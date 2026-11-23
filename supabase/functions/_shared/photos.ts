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

// The same picture with an invisible note in it: Google Photos merges identical files into one photo, so each copy must
// differ by a few bytes to be its own photo in the album. JPEG: a comment segment; PNG: a text chunk.
export type Mime = "image/jpeg" | "image/png";
export const mimeOf = (b: Uint8Array): Mime | null =>
  b[0] === 0xff && b[1] === 0xd8 ? "image/jpeg" : b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? "image/png" : null;

export function withComment(jpeg: Uint8Array, text: string): Uint8Array {
  const note = new TextEncoder().encode(text), len = note.length + 2;
  const out = new Uint8Array(jpeg.length + 2 + len);
  out.set(jpeg.subarray(0, 2), 0);                           // FF D8: start of image
  out.set([0xff, 0xfe, len >> 8, len & 0xff], 2);            // a comment segment
  out.set(note, 6);
  out.set(jpeg.subarray(2), 6 + note.length);
  return out;
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
// A tEXt chunk ("Comment") right after the header chunk (8-byte signature + 25-byte IHDR)
export function withPngText(png: Uint8Array, text: string): Uint8Array {
  const body = new TextEncoder().encode(`tEXtComment\0${text}`), at = 33;
  const chunk = new Uint8Array(12 + body.length - 4);
  const v = new DataView(chunk.buffer);
  v.setUint32(0, body.length - 4);
  chunk.set(body, 4);
  v.setUint32(4 + body.length, crc32(body));
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, at), 0); out.set(chunk, at); out.set(png.subarray(at), at + chunk.length);
  return out;
}
const distinct = (bytes: Uint8Array, mime: Mime, i: number) =>
  i === 0 ? bytes : mime === "image/png" ? withPngText(bytes, `hestia ${i + 1}`) : withComment(bytes, `hestia ${i + 1}`);

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
      const mime = mimeOf(bytes) ?? "image/jpeg", ext = mime === "image/png" ? "png" : "jpg";
      const tokens: string[] = [];
      for (let i = 0; i < copies; i++) {
        const r = await fetcher(`${API}/uploads`, {
          method: "POST", body: new Blob([distinct(bytes, mime, i) as BlobPart]),
          headers: { Authorization: `Bearer ${await bearer()}`, "Content-Type": "application/octet-stream", "X-Goog-Upload-Content-Type": mime, "X-Goog-Upload-Protocol": "raw" },
        });
        if (!r.ok) throw new Error(`Google Photos : envoi refusé (${r.status})`);
        tokens.push(await r.text());
      }
      const out = await call("/mediaItems:batchCreate", {
        albumId, newMediaItems: tokens.map((uploadToken, i) => ({ description, simpleMediaItem: { uploadToken, fileName: `${name}-${i + 1}.${ext}` } })),
      });
      const results: any[] = out.newMediaItemResults || [];
      const ids = [...new Set(results.map((x) => x.mediaItem?.id).filter(Boolean))] as string[];
      if (ids.length !== copies) {
        const why = results.map((x) => x.status?.message).filter((m) => m && m !== "Success" && m !== "OK").join(" ; ");
        throw new Error(`Google Photos : la photo n'a pas été ajoutée (${ids.length}/${copies}${why ? ` : ${why}` : ""})`);
      }
      return ids;
    },
    remove: (albumId: string, ids: string[]) => call(`/albums/${albumId}:batchRemoveMediaItems`, { mediaItemIds: ids }),
    add: (albumId: string, ids: string[]) => call(`/albums/${albumId}:batchAddMediaItems`, { mediaItemIds: ids }),
  };
}
export type PhotosClient = ReturnType<typeof photosClient>;

// Puts a new picture in the TV album and moves the previous ones to the album to empty. The albums are made the first
// time, and again if someone deleted them. Returns the ids to remember for next time.
// `made` is told of each album as soon as it exists, so that a failure later does not leave an album nobody remembers.
export async function replacePicture(p: PhotosClient, state: { tv: string | null; trash: string | null; previous: string[] },
  bytes: Uint8Array, name: string, description: string, made: (which: "tv" | "trash", id: string) => Promise<unknown> = async () => {}) {
  const album = async (which: "tv" | "trash") => { const id = await p.createAlbum(which === "tv" ? ALBUM_TV : ALBUM_TRASH); await made(which, id); return id; };
  let tv = state.tv ?? await album("tv");
  let ids: string[];
  try {
    ids = await p.addPicture(tv, bytes, name, description);
  } catch (e) {
    if (![400, 403, 404].includes((e as { status?: number }).status ?? 0) || !state.tv) throw e;
    tv = await album("tv"); // the album is gone: a new one (to be chosen again on the TV)
    ids = await p.addPicture(tv, bytes, name, description);
  }
  let trash = state.trash;
  if (state.previous.length) {
    await p.remove(tv, state.previous).catch(() => {}); // already removed by hand: fine
    trash ??= await album("trash");
    await p.add(trash, state.previous).catch(async () => {
      trash = await album("trash"); // the album to empty was deleted: a new one
      await p.add(trash, state.previous).catch(() => {});
    });
  }
  return { tv, trash, ids };
}
