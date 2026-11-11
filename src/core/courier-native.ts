// App Android do entregador (casco nativo em mobile/android): constantes e regras puras.
// O app abre as mesmas telas de /entregador num WebView e, enquanto o motoboy está online,
// um serviço nativo envia o GPS para /api/entregador/ping mesmo com o app fechado ou a tela bloqueada.

export const COURIER_APP = {
  /** applicationId do APK (mobile/android/app/build.gradle). */
  packageId: "com.goweboficial.entregador",
  /** Esquema próprio para abrir o app já logado: gowebentregador://acesso/<token>. */
  scheme: "gowebentregador",
  /** Marca adicionada ao User-Agent do WebView do app. */
  uaMark: "GoWebEntregador",
  /** SHA-256 do certificado de assinatura padrão (App Links). Trocou a chave? Use ANDROID_CERT_SHA256. */
  defaultCertSha256: "B8:17:93:6D:FA:A7:08:E6:43:55:A9:62:F2:D7:38:1B:1C:2C:DB:7B:60:D5:68:94:BA:8B:1E:88:96:CB:2A:0E",
} as const;

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

/** Aceita o link de acesso inteiro, a mensagem do WhatsApp com o link dentro ou só o código. */
export function extractAccessToken(input: string | null | undefined): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const m = s.match(/\/entregador\/acesso\/([A-Za-z0-9_-]{20,64})(?![A-Za-z0-9_-])/) ?? s.match(/gowebentregador:\/\/acesso\/([A-Za-z0-9_-]{20,64})(?![A-Za-z0-9_-])/);
  if (m) return m[1];
  return TOKEN.test(s) ? s : null;
}

/** A página está aberta dentro do app Android (WebView com a marca no User-Agent)? */
export function isCourierNativeUA(ua: string | null | undefined) {
  return !!ua && ua.includes(COURIER_APP.uaMark);
}

export function isAndroidUA(ua: string | null | undefined) {
  return !!ua && /android/i.test(ua);
}

/** Link que o Chrome do Android entende para abrir o app já com a sessão; sem o app, vai para `fallback`. */
export function androidOpenAppUrl(token: string, fallback: string) {
  if (!TOKEN.test(token)) throw new Error("token inválido");
  return `intent://acesso/${token}#Intent;scheme=${COURIER_APP.scheme};package=${COURIER_APP.packageId};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
}

/** Conteúdo de /.well-known/assetlinks.json (o Android confere para abrir o link de acesso direto no app). */
export function assetLinks(fingerprints: string | null | undefined) {
  const list = (fingerprints?.trim() ? fingerprints : COURIER_APP.defaultCertSha256)
    .split(/[\s,;]+/)
    .map((f) => f.trim().toUpperCase())
    .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: COURIER_APP.packageId, sha256_cert_fingerprints: list },
    },
  ];
}
