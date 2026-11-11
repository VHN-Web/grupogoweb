import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  IG_MAX_TEXT_BYTES,
  cleanAuthCode,
  igAuthUrl,
  igContact,
  igLogChannel,
  igText,
  igVerifySignature,
  igWindowOpen,
  instagramAllowed,
  makeState,
  missingScopes,
  parseIgWebhook,
  parseLongToken,
  parseShortToken,
  readState,
  tokenNeedsRefresh,
} from "./instagram";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const DAY = 86_400_000;

describe("Instagram: quem pode usar (validado no servidor)", () => {
  it("só GoInteligence e nunca demo", () => {
    expect(instagramAllowed({ tier: "pro", demo: false, country: "BR" })).toEqual({ ok: true });
    expect(instagramAllowed({ tier: "basic", demo: false, country: "BR" }).ok).toBe(false);
    expect(instagramAllowed({ tier: null, demo: false, country: "PY" }).ok).toBe(false);
    expect(instagramAllowed({ tier: "pro", demo: true, country: "BR" }).ok).toBe(false);
  });
});

describe("Instagram: login", () => {
  it("URL oficial só com as permissões de mensagem", () => {
    const u = new URL(igAuthUrl({ appId: "123", redirectUri: "https://goweboficial.com/api/instagram/oauth/callback", state: "abc" }));
    expect(u.origin + u.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(u.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_manage_messages");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("state")).toBe("abc");
    expect(cleanAuthCode("AQB123#_")).toBe("AQB123");
  });
  it("state vence em 10 min e exige a loja", () => {
    const s = makeState({ tenantId: "t1" }, "admin", NOW, "n");
    expect(readState(s, NOW + 60_000)).toMatchObject({ scope: "store", tenantId: "t1" });
    expect(readState(s, NOW + 11 * 60_000)).toBeNull();
    expect(readState({ ...s, tenantId: null }, NOW)).toBeNull();
    expect(readState(makeState("goweb", "platform", NOW, "n"), NOW)).toMatchObject({ scope: "goweb", tenantId: null });
    expect(readState("lixo", NOW)).toBeNull();
  });
  it("tokens: com e sem envelope, validade e permissões faltando", () => {
    expect(parseShortToken({ data: [{ access_token: "s", user_id: 99, permissions: "instagram_business_basic" }] })).toEqual({ token: "s", userId: "99", permissions: ["instagram_business_basic"] });
    expect(parseShortToken({ access_token: "s", user_id: "99", permissions: ["a", "b"] })?.permissions).toEqual(["a", "b"]);
    expect(parseShortToken({ error: "x" })).toBeNull();
    expect(parseLongToken({ access_token: "L", expires_in: 5184000 }, NOW)?.expiresAt.getTime()).toBe(NOW + 60 * DAY);
    expect(missingScopes(["instagram_business_basic"])).toEqual(["instagram_business_manage_messages"]);
  });
  it("renova com 10 dias de folga, nunca antes de 24 h nem depois de vencer", () => {
    expect(tokenNeedsRefresh({ expiresAt: new Date(NOW + 30 * DAY), issuedAt: new Date(NOW - 30 * DAY) }, NOW)).toBe(false);
    expect(tokenNeedsRefresh({ expiresAt: new Date(NOW + 9 * DAY), issuedAt: new Date(NOW - 51 * DAY) }, NOW)).toBe(true);
    expect(tokenNeedsRefresh({ expiresAt: new Date(NOW + 9 * DAY), issuedAt: new Date(NOW - 3600_000) }, NOW)).toBe(false);
    expect(tokenNeedsRefresh({ expiresAt: new Date(NOW - 1), issuedAt: new Date(NOW - 61 * DAY) }, NOW)).toBe(false);
  });
});

describe("Instagram: webhook", () => {
  it("assinatura X-Hub-Signature-256", () => {
    const body = '{"object":"instagram"}';
    const sig = `sha256=${createHmac("sha256", "segredo").update(body).digest("hex")}`;
    expect(igVerifySignature(body, sig, "segredo")).toBe(true);
    expect(igVerifySignature(body + " ", sig, "segredo")).toBe(false);
    expect(igVerifySignature(body, sig, "outro")).toBe(false);
    expect(igVerifySignature(body, null, "segredo")).toBe(false);
    expect(igVerifySignature(body, "sha256=zz", "segredo")).toBe(false);
  });
  it("lê mensagens, ecos e ignora o resto", () => {
    const ev = parseIgWebhook({
      object: "instagram",
      entry: [
        {
          id: "17841",
          time: 1,
          messaging: [
            { sender: { id: "555" }, recipient: { id: "17841" }, timestamp: NOW, message: { mid: "m1", text: "Oi, tem açaí?" } },
            { sender: { id: "17841" }, recipient: { id: "555" }, timestamp: NOW, message: { mid: "m2", text: "Temos!", is_echo: true } },
            { sender: { id: "555" }, recipient: { id: "17841" }, timestamp: NOW, read: { mid: "m2" } },
            { sender: { id: "555" }, recipient: { id: "17841" }, timestamp: NOW, message: { mid: "m3", attachments: [{ type: "image" }] } },
            { sender: { id: "555" }, recipient: { id: "17841" }, timestamp: NOW, message: { mid: "m4", text: "x", is_deleted: true } },
          ],
        },
      ],
    });
    expect(ev).toHaveLength(3);
    expect(ev[0]).toMatchObject({ accountId: "17841", contactId: "555", mid: "m1", text: "Oi, tem açaí?", echo: false, hasMedia: false });
    expect(ev[1]).toMatchObject({ contactId: "555", echo: true });
    expect(ev[2]).toMatchObject({ mid: "m3", hasMedia: true, text: "" });
    expect(parseIgWebhook({ object: "page", entry: [] })).toEqual([]);
    expect(parseIgWebhook(null)).toEqual([]);
  });
});

describe("Instagram: envio", () => {
  it("só responde dentro de 24 h", () => {
    expect(igWindowOpen(new Date(NOW - 23 * 3600_000), NOW)).toBe(true);
    expect(igWindowOpen(new Date(NOW - 25 * 3600_000), NOW)).toBe(false);
    expect(igWindowOpen(null, NOW)).toBe(false);
  });
  it("texto até 1.000 bytes sem quebrar acento", () => {
    expect(igText("  oi  ")).toBe("oi");
    const long = igText("ã".repeat(900));
    expect(Buffer.byteLength(long, "utf8")).toBeLessThanOrEqual(IG_MAX_TEXT_BYTES);
    expect(long.endsWith("…")).toBe(true);
    expect(long.includes("�")).toBe(false);
  });
  it("consumo separado por canal", () => {
    expect(igLogChannel("goweb")).toBe("ig:goweb");
    expect(igLogChannel({ tenantId: "t1" })).toBe("ig:store:t1");
    expect(igContact("555")).toBe("ig:555");
  });
});
