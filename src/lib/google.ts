import "server-only";
// Login com Google (OAuth 2.0 / OpenID Connect) — sem bibliotecas externas.
// Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET. URI de redirecionamento: {APP_URL}/api/auth/google/callback
import { appUrl } from "@/lib/urls";

export const googleEnabled = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
export const googleRedirectUri = () => `${appUrl()}/api/auth/google/callback`;

/** E-mails autorizados a entrar no admin da plataforma com Google (lista separada por vírgula). */
export function adminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function googleAuthUrl(state: string) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  u.searchParams.set("redirect_uri", googleRedirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("prompt", "select_account");
  return u.toString();
}

/** Troca o código pelo token e lê o e-mail verificado direto do Google. */
export async function googleEmail(code: string): Promise<{ email: string; name?: string } | null> {
  const tok = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!tok.ok) return null;
  const { access_token } = (await tok.json()) as { access_token?: string };
  if (!access_token) return null;
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${access_token}` } });
  if (!info.ok) return null;
  const u = (await info.json()) as { email?: string; email_verified?: boolean; name?: string };
  if (!u.email || u.email_verified !== true) return null; // só e-mail confirmado pelo Google
  return { email: u.email.toLowerCase(), name: u.name };
}
