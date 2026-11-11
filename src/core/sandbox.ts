// Modo teste (homologação): nas prévias da Vercel nada sai de verdade — WhatsApp, e-mail, push,
// cobranças e apps de delivery ficam só registrados no log. Liberação específica por contato em SANDBOX_ALLOW.
// Regras PURAS: quando é ambiente de teste, o que a liberação permite e a impressão digital do banco.
import { createHash } from "node:crypto";

export type SandboxKind = "whatsapp" | "email" | "push" | "payments" | "delivery" | "instagram";

/** Ambiente de teste = prévia da Vercel (VERCEL_ENV=preview) ou APP_MODE=sandbox. APP_MODE=production nunca é teste. */
export function isSandboxEnv(env: Record<string, string | undefined>) {
  if (env.APP_MODE === "production") return false;
  return env.APP_MODE === "sandbox" || env.VERCEL_ENV === "preview";
}

export type SandboxAllow = { phones: Set<string>; emails: Set<string>; push: boolean };

/**
 * SANDBOX_ALLOW: lista separada por vírgula, definida pelo dono na Vercel (só no ambiente Preview).
 *   +5581999990000 ou 5581999990000 → esse WhatsApp recebe de verdade
 *   pessoa@empresa.com              → esse e-mail recebe de verdade
 *   push                            → notificações dos aparelhos cadastrados no banco de teste
 * Cobranças e apps de delivery nunca são liberados aqui: só com credenciais de teste (sandbox) do próprio serviço.
 */
export function parseSandboxAllow(raw: string | undefined): SandboxAllow {
  const out: SandboxAllow = { phones: new Set(), emails: new Set(), push: false };
  for (const part of (raw ?? "").split(",")) {
    const v = part.trim().toLowerCase();
    if (!v) continue;
    if (v === "push") out.push = true;
    else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) out.emails.add(v);
    else {
      const d = v.replace(/\D/g, "");
      if (d.length >= 10 && d.length <= 15) out.phones.add(d);
    }
  }
  return out;
}

/** Um envio para esse contato pode sair de verdade no ambiente de teste? */
export function sandboxAllows(allow: SandboxAllow, kind: SandboxKind, to?: string | null) {
  if (kind === "push") return allow.push;
  if (kind === "email") return !!to && allow.emails.has(to.trim().toLowerCase());
  if (kind === "whatsapp") {
    const d = (to ?? "").replace(/\D/g, "");
    return !!d && allow.phones.has(d);
  }
  return false; // payments, delivery, instagram: nunca pela lista
}

/** Credencial de teste do próprio serviço (essas podem rodar na prévia). */
export function isTestCredential(kind: "mercadopago" | "asaas", value: string | null | undefined) {
  if (kind === "mercadopago") return /^TEST-/.test(value ?? "");
  return value === "sandbox"; // asaas: ambiente da conta
}

/**
 * Impressão digital do banco (sem senha): host + porta + nome do banco, normalizados.
 * O build da prévia compara com PRODUCTION_DB_FINGERPRINT e se recusa a mexer no banco da produção.
 * Neon: o host "-pooler" e o direto são o mesmo banco.
 */
export function dbIdentity(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace("-pooler.", ".");
    const db = u.pathname.replace(/^\//, "").toLowerCase() || "postgres";
    return `${host}:${u.port || "5432"}/${db}`;
  } catch {
    return "";
  }
}

/** 16 caracteres hex de sha256(dbIdentity) — pode ir em variável de ambiente e no log do build sem expor nada. */
export function dbFingerprint(url: string) {
  const id = dbIdentity(url);
  return id ? createHash("sha256").update(id).digest("hex").slice(0, 16) : "";
}

export type DbGuard = { ok: true } | { ok: false; reason: "same_as_production" | "fingerprint_missing" };

/**
 * No ambiente de teste o app só abre um banco Postgres se PRODUCTION_DB_FINGERPRINT estiver configurada
 * e for diferente da impressão digital desse banco. Sem a variável não dá para provar que é outro banco → não abre.
 */
export function sandboxDbGuard(url: string, productionFingerprint: string | undefined): DbGuard {
  const prod = (productionFingerprint ?? "").trim().toLowerCase();
  if (!prod) return { ok: false, reason: "fingerprint_missing" };
  return dbFingerprint(url) === prod ? { ok: false, reason: "same_as_production" } : { ok: true };
}
