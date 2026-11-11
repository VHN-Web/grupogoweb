import { describe, expect, it } from "vitest";
import { androidOpenAppUrl, assetLinks, COURIER_APP, extractAccessToken, isCourierNativeUA } from "./courier-native";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";

describe("app Android do entregador", () => {
  it("acha o código no link, na mensagem do WhatsApp ou sozinho", () => {
    expect(extractAccessToken(`https://goweboficial.com/entregador/acesso/${TOKEN}`)).toBe(TOKEN);
    expect(extractAccessToken(`Oi Ana! Este é seu acesso ao app de entregas da Burguer. Abra no celular: https://goweboficial.com/entregador/acesso/${TOKEN}`)).toBe(TOKEN);
    expect(extractAccessToken(`  ${TOKEN}  `)).toBe(TOKEN);
    expect(extractAccessToken(`gowebentregador://acesso/${TOKEN}`)).toBe(TOKEN);
  });
  it("recusa texto sem código válido", () => {
    expect(extractAccessToken("")).toBeNull();
    expect(extractAccessToken("oi tudo bem")).toBeNull();
    expect(extractAccessToken("https://goweboficial.com/entregador/acesso/curto")).toBeNull();
    expect(extractAccessToken(`https://goweboficial.com/entregador/acesso/${TOKEN}${"x".repeat(40)}`)).toBeNull();
  });
  it("reconhece o WebView do app", () => {
    expect(isCourierNativeUA(`Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile ${COURIER_APP.uaMark}/1.0.3`)).toBe(true);
    expect(isCourierNativeUA("Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile")).toBe(false);
  });
  it("intent do Chrome com volta para a página de download", () => {
    const u = androidOpenAppUrl(TOKEN, "https://goweboficial.com/entregador/baixar");
    expect(u.startsWith(`intent://acesso/${TOKEN}#Intent;scheme=gowebentregador;package=com.goweboficial.entregador;`)).toBe(true);
    expect(u).toContain("S.browser_fallback_url=https%3A%2F%2Fgoweboficial.com%2Fentregador%2Fbaixar");
    expect(() => androidOpenAppUrl("x", "/")).toThrow();
  });
  it("assetlinks com a impressão digital padrão ou a do ambiente", () => {
    expect(assetLinks(null)[0].target.sha256_cert_fingerprints).toEqual([COURIER_APP.defaultCertSha256]);
    const other = Array.from({ length: 32 }, () => "ab").join(":");
    expect(assetLinks(`${other}, lixo`)[0].target.sha256_cert_fingerprints).toEqual([other.toUpperCase()]);
  });
});
