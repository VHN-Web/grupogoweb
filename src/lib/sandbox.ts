// Modo teste nas prévias da Vercel (homologação). Regras puras em core/sandbox.ts.
// Os adaptadores chamam sandboxBlocks() ANTES de qualquer envio real: no teste, o envio vira só uma linha no log.
import { isSandboxEnv, isTestCredential, parseSandboxAllow, sandboxAllows, type SandboxKind } from "@/core/sandbox";

export const isSandbox = () => isSandboxEnv(process.env);

export class SandboxBlockedError extends Error {
  constructor(readonly kind: SandboxKind | "mercadopago" | "asaas") {
    super("Ambiente de teste: envio real bloqueado (nada saiu). Veja SANDBOX_ALLOW para liberar um contato.");
  }
}

/** true = NÃO enviar (ambiente de teste e contato fora da liberação). Registra o que teria saído. */
export function sandboxBlocks(kind: SandboxKind, to?: string | null, what?: string) {
  if (!isSandbox()) return false;
  if (sandboxAllows(parseSandboxAllow(process.env.SANDBOX_ALLOW), kind, to)) return false;
  console.info(`[modo teste] ${kind} bloqueado${to ? ` para ${mask(to)}` : ""}${what ? `: ${what.slice(0, 120)}` : ""}`);
  return true;
}

/** Cobranças: no teste só com credencial de teste do próprio serviço (Mercado Pago TEST-…, Asaas sandbox). */
export function assertTestCredential(kind: "mercadopago" | "asaas", value: string | null | undefined) {
  if (isSandbox() && !isTestCredential(kind, value)) throw new SandboxBlockedError(kind);
}

// no log só o fim do número/e-mail
function mask(v: string) {
  if (v.includes("@")) return v.replace(/^(.).*(@.*)$/, "$1***$2");
  const d = v.replace(/\D/g, "");
  return d.length > 4 ? `***${d.slice(-4)}` : "***";
}
