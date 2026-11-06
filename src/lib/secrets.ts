// Criptografia dos segredos guardados no banco (tokens de gateway dos lojistas).
// Sem "server-only" para poder ser usado também pelo seed/migrações.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// ---------------------------------------------------------------- segredos (tokens de gateway) criptografados no banco
function key(): Buffer {
  const s = process.env.CREDENTIALS_SECRET || process.env.SESSION_SECRET || "dev-secret-change-me-please";
  return createHash("sha256").update(`goweb-credentials:${s}`).digest();
}

/** AES-256-GCM. Formato: enc:v1:<iv>:<tag>:<dados> (base64url). */
export function sealSecret(plain: string): string {
  if (!plain || plain.startsWith("enc:v1:")) return plain;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `enc:v1:${iv.toString("base64url")}:${c.getAuthTag().toString("base64url")}:${data.toString("base64url")}`;
}

export function openSecret(value: string | undefined | null): string {
  if (!value) return "";
  if (!value.startsWith("enc:v1:")) return value; // valores antigos (antes da criptografia)
  try {
    const [, , iv, tag, data] = value.split(":");
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}

const SECRET_FIELDS = new Set(["accessToken", "webhookSecret", "privateKey", "secret", "token"]);

/** Credenciais de um gateway prontas para uso (descriptografadas). */
export function openCredentials(creds: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds ?? {})) out[k] = SECRET_FIELDS.has(k) ? openSecret(v) : v;
  return out;
}

export function sealCredentials(creds: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds)) out[k] = SECRET_FIELDS.has(k) ? sealSecret(v) : v;
  return out;
}

