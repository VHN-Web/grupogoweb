import { describe, expect, it } from "vitest";
import { openCredentials, openSecret, sealCredentials, sealSecret } from "./secrets";

describe("segredos criptografados", () => {
  it("criptografa e abre de volta", () => {
    const s = sealSecret("APP_USR-123456");
    expect(s.startsWith("enc:v1:")).toBe(true);
    expect(s).not.toContain("APP_USR");
    expect(openSecret(s)).toBe("APP_USR-123456");
  });
  it("é idempotente e aceita valores antigos em texto puro", () => {
    const s = sealSecret("abc");
    expect(sealSecret(s)).toBe(s);
    expect(openSecret("legado")).toBe("legado");
  });
  it("rejeita dados adulterados", () => {
    const s = sealSecret("token-secreto");
    const bad = s.slice(0, -3) + (s.endsWith("A") ? "BBB" : "AAA");
    expect(openSecret(bad)).toBe("");
  });
  it("só criptografa campos sensíveis", () => {
    const c = sealCredentials({ accessToken: "APP_USR-x", account: "Loja X" });
    expect(c.account).toBe("Loja X");
    expect(c.accessToken).not.toBe("APP_USR-x");
    expect(openCredentials(c)).toEqual({ accessToken: "APP_USR-x", account: "Loja X" });
  });
});
