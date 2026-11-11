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
  /** APK publicado pelo GitHub Actions (Releases → entregador-latest). Outro endereço? Use COURIER_APK_URL. */
  apkUrl: "https://github.com/eulazacruz/Atlas/releases/download/entregador-latest/entregas.apk",
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

/** App Android do CRM dos sócios (mobile/android/crm): mesmo /crm num WebView + widgets e avisos nativos. */
export const CRM_APP = {
  packageId: "com.goweboficial.crm",
  uaMark: "GoWebCRM",
  apkUrl: "https://github.com/eulazacruz/Atlas/releases/download/crm-latest/goweb-crm.apk",
} as const;

/** Algum dos apps Android da GoWeb (entregador ou CRM)? */
export function isGoWebAppUA(ua: string | null | undefined) {
  return !!ua && (ua.includes(COURIER_APP.uaMark) || ua.includes(CRM_APP.uaMark));
}

/** Corrida oferecida ao entregador: vira a tela cheia "Nova entrega" no app Android (estilo iFood). */
export type CourierOffer = {
  /** mine = passada para ele (atribuída); open = livre, quem aceitar primeiro leva */
  type: "mine" | "open";
  orderId: string;
  number: string | number;
  address?: string | null;
  km?: number | null;
  /** quanto o entregador ganha, já formatado na moeda da loja */
  fee?: string | null;
  store?: string | null;
  /** escolhido pela atribuição automática (se não responder a tempo, passa para o próximo) */
  auto?: boolean;
};

/** Dados da oferta em texto (formato do Firebase e da resposta do ping). */
export function offerData(o: CourierOffer): Record<string, string> {
  return {
    kind: "offer",
    type: o.type,
    orderId: o.orderId,
    n: String(o.number),
    addr: (o.address ?? "").slice(0, 200),
    km: o.km != null && Number.isFinite(o.km) ? o.km.toFixed(1) : "",
    fee: (o.fee ?? "").slice(0, 40),
    store: (o.store ?? "").slice(0, 80),
    auto: o.auto ? "1" : "0",
  };
}

/** Pedido cancelado/retirado: o app fecha a tela da corrida se ela estiver aberta. */
export function offerCancelData(orderId: string): Record<string, string> {
  return { kind: "cancel", orderId };
}
