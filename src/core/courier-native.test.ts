import { describe, expect, it } from "vitest";
import { androidOpenAppUrl, assetLinks, COURIER_APP, extractAccessToken, isCourierNativeUA, offerCancelData, offerData } from "./courier-native";

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

describe("oferta de corrida (tela cheia no app)", () => {
  it("tudo em texto, com km arredondado e campos vazios quando faltam", () => {
    expect(offerData({ type: "mine", orderId: "o1", number: 4821, address: "Rua A, 10", neighborhood: "Boa Viagem", km: 2.345, fee: "R$ 8,00", store: "Burguer", auto: true })).toEqual({
      kind: "offer", type: "mine", orderId: "o1", n: "4821", addr: "Rua A, 10", bairro: "Boa Viagem", km: "2.3", fee: "R$ 8,00", store: "Burguer", auto: "1",
    });
    expect(offerData({ type: "open", orderId: "o2", number: "77" })).toEqual({ kind: "offer", type: "open", orderId: "o2", n: "77", addr: "", bairro: "", km: "", fee: "", store: "", auto: "0" });
  });
  it("cancelamento", () => {
    expect(offerCancelData("o1")).toEqual({ kind: "cancel", orderId: "o1" });
  });
});
