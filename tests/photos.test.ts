// The TV poster's albums, against a fake Google: the new picture goes in twice, the previous ones move to the album to empty.
import { describe, expect, it } from "vitest";
import { ALBUM_TRASH, ALBUM_TV, photosClient, replacePicture, withComment } from "../supabase/functions/_shared/photos.ts";

function fakeGoogle(opts: { goneAlbum?: string } = {}) {
  const albums = new Map<string, { title: string; items: string[] }>();
  let n = 0;
  const calls: string[] = [];
  const reply = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const path = url.replace("https://photoslibrary.googleapis.com/v1", "");
    calls.push(path);
    if (path === "/uploads") return reply(200, `upload-${++n}`);
    if (path === "/albums") { const id = `album-${++n}`; albums.set(id, { title: body.album.title, items: [] }); return reply(200, { id }); }
    if (path === "/mediaItems:batchCreate") {
      const a = albums.get(body.albumId);
      if (!a || body.albumId === opts.goneAlbum) return reply(404, { error: { message: "album" } });
      const ids = body.newMediaItems.map(() => `photo-${++n}`);
      a.items.push(...ids);
      return reply(200, { newMediaItemResults: ids.map((id: string) => ({ mediaItem: { id } })) });
    }
    const m = path.match(/^\/albums\/(.+):(batchRemoveMediaItems|batchAddMediaItems)$/);
    if (m) {
      const a = albums.get(m[1]);
      if (!a) return reply(404, {});
      a.items = m[2] === "batchAddMediaItems" ? [...a.items, ...body.mediaItemIds] : a.items.filter((x) => !body.mediaItemIds.includes(x));
      return reply(200, {});
    }
    return reply(400, {});
  }) as typeof fetch;
  return { albums, calls, fetcher };
}
// The token request goes to oauth2.googleapis.com: answered by the global fetch, stubbed here
globalThis.fetch = (async () => new Response(JSON.stringify({ access_token: "t" }))) as typeof fetch;

describe("TV poster albums", () => {
  it("each copy differs by a JPEG comment, the picture itself untouched", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3]);
    const c = withComment(jpeg, "hestia 2");
    expect([...c.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xfe]);
    expect((c[4] << 8) | c[5]).toBe(10);
    expect(new TextDecoder().decode(c.subarray(6, 14))).toBe("hestia 2");
    expect([...c.subarray(14)]).toEqual([...jpeg.subarray(2)]);
  });
  it("albums are remembered as soon as they exist", async () => {
    const g = fakeGoogle(), seen: string[] = [];
    await replacePicture(photosClient({ clientId: "c", clientSecret: "s" }, "r", g.fetcher), { tv: null, trash: null, previous: ["old-1"] },
      new Uint8Array([0xff, 0xd8]), "d", "d", async (which, id) => { seen.push(`${which}:${g.albums.get(id)?.title}`); });
    expect(seen).toEqual([`tv:${ALBUM_TV}`, `trash:${ALBUM_TRASH}`]);
  });
  it("first picture: makes the TV album and puts the picture in twice", async () => {
    const g = fakeGoogle();
    const out = await replacePicture(photosClient({ clientId: "c", clientSecret: "s" }, "r", g.fetcher), { tv: null, trash: null, previous: [] },
      new Uint8Array([0xff, 0xd8, 1]), "hestia-tele", "Hestia · télé");
    expect(g.albums.get(out.tv)).toEqual({ title: ALBUM_TV, items: out.ids });
    expect(out.ids).toHaveLength(2);
    expect(out.trash).toBeNull();
  });
  it("next picture: the previous ones leave the TV album for the album to empty", async () => {
    const g = fakeGoogle(), p = photosClient({ clientId: "c", clientSecret: "s" }, "r", g.fetcher);
    const first = await replacePicture(p, { tv: null, trash: null, previous: [] }, new Uint8Array([0xff, 0xd8]), "a", "a");
    const second = await replacePicture(p, { tv: first.tv, trash: null, previous: first.ids }, new Uint8Array([0xff, 0xd8]), "b", "b");
    expect(second.tv).toBe(first.tv);
    expect(g.albums.get(first.tv)!.items).toEqual(second.ids);
    expect(g.albums.get(second.trash!)).toEqual({ title: ALBUM_TRASH, items: first.ids });
  });
  it("a TV album deleted by hand is made again", async () => {
    const g = fakeGoogle({ goneAlbum: "album-old" });
    const out = await replacePicture(photosClient({ clientId: "c", clientSecret: "s" }, "r", g.fetcher), { tv: "album-old", trash: null, previous: [] },
      new Uint8Array([0xff, 0xd8]), "c", "c");
    expect(out.tv).not.toBe("album-old");
    expect(g.albums.get(out.tv)!.items).toHaveLength(2);
  });
});
