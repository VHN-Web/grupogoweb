// URLs públicas. Sem "server-only" para poder ser usado também por scripts.
export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Endereço público do cardápio: domínio próprio (se houver) ou {APP_URL}/{slug}. */
export function tenantPublicUrl(t: { slug: string; customDomain?: string | null }) {
  return t.customDomain ? `https://${t.customDomain}` : `${appUrl()}/${t.slug}`;
}
