// Google Photos, for the TV poster: the Chromecast's ambient screen shows an album, so the poster is put in one.
//
// Since 2025 an app may only fill albums it created itself, and no app may delete a photo from a library. So Hestia
// keeps two albums of its own: "Hestia · Télé" (the current picture, twice: the ambient screen wants more than one) and
// "Hestia · À supprimer", where the previous pictures go, for the family to empty by hand now and then.
// Access: the owner's consent (OAuth, a refresh token kept in private.config), asked from Réglages › Télé.

export const PHOTOS_SCOPES = [
  "https://www.googleapis.com/auth/photoslibrary.appendonly",           // upload, make the albums
  "https://www.googleapis.com/auth/photoslibrary.edit.appcreateddata",  // move Hestia's own pictures between its albums
];
export const ALBUM_TV = "Hestia · Télé", ALBUM_TRASH = "Hestia · À supprimer";
const API = "https://photoslibrary.googleapis.com/v1";

export type OAuthClient = { clientId: string; clientSecret: string };

export function consentUrl(client: OAuthClient, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: client.clientId, redirect_uri: redirectUri, response_type: "code", scope: PHOTOS_SCOPES.join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function token(params: Record<string, string>): Promise<Record<string, string>> {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams(params) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google (${r.status}) : ${data.error_description || data.error || "connexion refusée"}`);
  return data;
}
// The consent's code, exchanged for the lasting refresh token
export async function exchangeCode(client: OAuthClient, redirectUri: string, code: string): Promise<string> {
  const data = await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: client.clientId, client_secret: client.clientSecret });
  if (!data.refresh_token) throw new Error("Google n'a pas donné d'accès durable : recommencer depuis Réglages.");
  return data.refresh_token;
}

export function photosClient(client: OAuthClient, refreshToken: string, fetcher: typeof fetch = fetch) {
  let access: Promise<string> | null = null;
  const bearer = () => (access ??= token({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: client.clientId, client_secret: client.clientSecret })
    .then((d) => d.access_token));
  const call = async (path: string, body: unknown) => {
    const r = await fetcher(`${API}${path}`, { method: "POST", headers: { Authorization: `Bearer ${await bearer()}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`Google Photos (${r.status}) : ${data.error?.message || "refusé"}`), { status: r.status });
    return data;
  };
  return {
    createAlbum: async (title: string): Promise<string> => (await call("/albums", { album: { title } })).id,
    // One picture, put in the album as `copies` separate photos (an upload token is good for one photo only)
    async addPicture(albumId: string, bytes: Uint8Array, name: string, description: string, copies = 2): Promise<string[]> {
      const tokens: string[] = [];
      for (let i = 0; i < copies; i++) {
        const r = await fetcher(`${API}/uploads`, {
          method: "POST", body: new Blob([bytes as BlobPart]),
          headers: { Authorization: `Bearer ${await bearer()}`, "Content-Type": "application/octet-stream", "X-Goog-Upload-Content-Type": "image/jpeg", "X-Goog-Upload-Protocol": "raw" },
        });
        if (!r.ok) throw new Error(`Google Photos : envoi refusé (${r.status})`);
        tokens.push(await r.text());
      }
      const out = await call("/mediaItems:batchCreate", {
        albumId, newMediaItems: tokens.map((uploadToken, i) => ({ description, simpleMediaItem: { uploadToken, fileName: `${name}-${i + 1}.jpg` } })),
      });
      const ids = (out.newMediaItemResults || []).map((x: any) => x.mediaItem?.id).filter(Boolean);
      if (ids.length !== copies) throw new Error("Google Photos : la photo n'a pas été ajoutée");
      return ids;
    },
    remove: (albumId: string, ids: string[]) => call(`/albums/${albumId}:batchRemoveMediaItems`, { mediaItemIds: ids }),
    add: (albumId: string, ids: string[]) => call(`/albums/${albumId}:batchAddMediaItems`, { mediaItemIds: ids }),
  };
}
export type PhotosClient = ReturnType<typeof photosClient>;

// Puts a new picture in the TV album and moves the previous ones to the album to empty. The albums are made the first
// time, and again if someone deleted them. Returns the ids to remember for next time.
export async function replacePicture(p: PhotosClient, state: { tv: string | null; trash: string | null; previous: string[] },
  bytes: Uint8Array, name: string, description: string) {
  let tv = state.tv ?? await p.createAlbum(ALBUM_TV);
  let ids: string[];
  try {
    ids = await p.addPicture(tv, bytes, name, description);
  } catch (e) {
    if (![400, 403, 404].includes((e as { status?: number }).status ?? 0) || !state.tv) throw e;
    tv = await p.createAlbum(ALBUM_TV); // the album is gone: a new one (to be chosen again on the TV)
    ids = await p.addPicture(tv, bytes, name, description);
  }
  let trash = state.trash;
  if (state.previous.length) {
    await p.remove(tv, state.previous).catch(() => {}); // already removed by hand: fine
    trash ??= await p.createAlbum(ALBUM_TRASH);
    await p.add(trash, state.previous).catch(async () => {
      trash = await p.createAlbum(ALBUM_TRASH); // the album to empty was deleted: a new one
      await p.add(trash, state.previous).catch(() => {});
    });
  }
  return { tv, trash, ids };
}
