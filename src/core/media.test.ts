import { describe, expect, it } from "vitest";
import { DEFAULT_VIDEO_QUOTA_BYTES, VIDEO_MAX_BYTES, blobPathOf, buildGallery, isVideoPath, moveOne, promote, reorder, validVideoPath, videoAllowed, videoQuotaBytes, type MediaItem } from "./media";

const m = (id: string, position: number, kind: "image" | "video" = "image"): MediaItem => ({ id, kind, url: `/uploads/x/${id}.${kind === "video" ? "mp4" : "webp"}`, position });

describe("galeria: compatível com produtos antigos", () => {
  it("só a foto principal continua funcionando", () => {
    expect(buildGallery("/uploads/a.webp", [])).toEqual([{ kind: "image", url: "/uploads/a.webp" }]);
    expect(buildGallery(null, [])).toEqual([]);
  });
  it("principal primeiro, depois a ordem do lojista, sem repetir", () => {
    const g = buildGallery("/uploads/main.webp", [m("b", 1), m("v", 0, "video"), { ...m("dup", 2), url: "/uploads/main.webp" }]);
    expect(g.map((x) => x.kind)).toEqual(["image", "video", "image"]);
    expect(g[1].url).toMatch(/v\.mp4$/);
  });
});

describe("galeria: ordem e principal", () => {
  const items = [m("a", 0), m("b", 1), m("c", 2)];
  it("reordenar ignora ids estranhos e mantém os que faltarem", () => {
    expect(reorder(items, ["c", "zzz", "a", "c"])).toEqual([{ id: "c", position: 0 }, { id: "a", position: 1 }, { id: "b", position: 2 }]);
  });
  it("mover uma casa", () => {
    expect(moveOne(items, "b", -1).map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(moveOne(items, "a", -1).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(moveOne(items, "c", 1).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("tornar principal troca de lugar sem perder a antiga; vídeo não pode", () => {
    expect(promote("/uploads/old.webp", m("b", 1))).toEqual({ ok: true, newMain: "/uploads/x/b.webp", replaceWith: "/uploads/old.webp" });
    expect(promote(null, m("b", 1))).toEqual({ ok: true, newMain: "/uploads/x/b.webp", replaceWith: null });
    expect(promote("/uploads/old.webp", m("v", 0, "video")).ok).toBe(false);
  });
});

describe("galeria: vídeo com limite rígido", () => {
  const q = DEFAULT_VIDEO_QUOTA_BYTES;
  it("tipo, tamanho, 1 por produto e cota da plataforma", () => {
    expect(videoAllowed({ contentType: "video/mp4", size: 5e6 }, 0, 0, q)).toEqual({ ok: true });
    expect(videoAllowed({ contentType: "video/x-msvideo", size: 5e6 }, 0, 0, q)).toEqual({ ok: false, reason: "type" });
    expect(videoAllowed({ contentType: "video/mp4", size: VIDEO_MAX_BYTES + 1 }, 0, 0, q)).toEqual({ ok: false, reason: "size" });
    expect(videoAllowed({ contentType: "video/mp4", size: 5e6 }, 1, 0, q)).toEqual({ ok: false, reason: "per_product" });
    expect(videoAllowed({ contentType: "video/webm", size: 5e6 }, 0, q - 1e6, q)).toEqual({ ok: false, reason: "quota" });
    expect(videoQuotaBytes("500")).toBe(500 * 1024 * 1024);
    expect(videoQuotaBytes(undefined)).toBe(q);
  });
  it("caminho do envio só dentro da pasta do produto", () => {
    expect(validVideoPath("tenants/t1/products/p1/abc-123.mp4", "t1", "p1")).toBe(true);
    expect(validVideoPath("tenants/t1/products/p2/abc.mp4", "t1", "p1")).toBe(false);
    expect(validVideoPath("tenants/t1/products/p1/../x.mp4", "t1", "p1")).toBe(false);
    expect(validVideoPath("tenants/t1/products/p1/a.exe", "t1", "p1")).toBe(false);
  });
  it("reconhece vídeo e o caminho do Blob", () => {
    expect(isVideoPath("/uploads/a/b.MP4")).toBe(true);
    expect(isVideoPath("/uploads/a/b.webp")).toBe(false);
    expect(blobPathOf("/uploads/tenants/t/p.webp")).toBe("tenants/t/p.webp");
    expect(blobPathOf("https://abc.public.blob.vercel-storage.com/tenants/t/p.webp")).toBe("tenants/t/p.webp");
    expect(blobPathOf("https://example.com/p.webp")).toBeNull();
  });
});
