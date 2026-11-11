import { describe, expect, it } from "vitest";
import { dbFingerprint, dbIdentity, isSandboxEnv, isTestCredential, parseSandboxAllow, sandboxAllows, sandboxDbGuard } from "./sandbox";

describe("modo teste (homologação)", () => {
  it("prévia da Vercel é teste; produção nunca", () => {
    expect(isSandboxEnv({ VERCEL_ENV: "preview" })).toBe(true);
    expect(isSandboxEnv({ VERCEL_ENV: "production" })).toBe(false);
    expect(isSandboxEnv({})).toBe(false);
    expect(isSandboxEnv({ APP_MODE: "sandbox" })).toBe(true);
    expect(isSandboxEnv({ APP_MODE: "production", VERCEL_ENV: "preview" })).toBe(false);
  });
  it("liberação específica por contato", () => {
    const a = parseSandboxAllow(" +55 81 99999-0000, Ana@Empresa.com , push, lixo, 123");
    expect(sandboxAllows(a, "whatsapp", "5581999990000")).toBe(true);
    expect(sandboxAllows(a, "whatsapp", "+55 (81) 99999-0000")).toBe(true);
    expect(sandboxAllows(a, "whatsapp", "5581988880000")).toBe(false);
    expect(sandboxAllows(a, "email", "ana@empresa.com")).toBe(true);
    expect(sandboxAllows(a, "email", "outra@empresa.com")).toBe(false);
    expect(sandboxAllows(a, "push")).toBe(true);
    expect(sandboxAllows(parseSandboxAllow(""), "push")).toBe(false);
    expect(sandboxAllows(a, "payments", "5581999990000")).toBe(false);
    expect(sandboxAllows(a, "delivery")).toBe(false);
  });
  it("credenciais de teste dos serviços", () => {
    expect(isTestCredential("mercadopago", "TEST-123")).toBe(true);
    expect(isTestCredential("mercadopago", "APP_USR-123")).toBe(false);
    expect(isTestCredential("asaas", "sandbox")).toBe(true);
    expect(isTestCredential("asaas", "production")).toBe(false);
  });
  it("mesmo banco com ou sem pooler, com senhas diferentes", () => {
    const a = "postgres://u:senha1@ep-x-123-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require";
    const b = "postgresql://outro:senha2@ep-x-123.sa-east-1.aws.neon.tech:5432/neondb";
    expect(dbIdentity(a)).toBe("ep-x-123.sa-east-1.aws.neon.tech:5432/neondb");
    expect(dbFingerprint(a)).toBe(dbFingerprint(b));
    expect(dbFingerprint(a)).toHaveLength(16);
    expect(dbFingerprint("postgres://u:p@ep-y-999.neon.tech/neondb")).not.toBe(dbFingerprint(a));
    expect(dbFingerprint("isso não é url")).toBe("");
  });
  it("prévia só abre banco provadamente diferente da produção", () => {
    const prod = "postgres://u:p@ep-prod.neon.tech/neondb";
    const test = "postgres://u:p@ep-teste.neon.tech/neondb";
    expect(sandboxDbGuard(test, dbFingerprint(prod))).toEqual({ ok: true });
    expect(sandboxDbGuard(prod, dbFingerprint(prod))).toEqual({ ok: false, reason: "same_as_production" });
    expect(sandboxDbGuard(prod, dbFingerprint(prod).toUpperCase())).toEqual({ ok: false, reason: "same_as_production" });
    expect(sandboxDbGuard(test, undefined)).toEqual({ ok: false, reason: "fingerprint_missing" });
  });
});
