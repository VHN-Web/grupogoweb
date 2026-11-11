// Idiomas do app do entregador: português, espanhol e inglês — cada tela, aviso e erro num idioma só.
// O entregador escolhe (Conta → Idioma; tela de entrar e de download); padrão = idioma da loja.
// Guardado em couriers.lang (vale para os avisos enviados pelo servidor e o app Android) e no cookie gw_cour_lang.

export type CourierLang = "pt" | "es" | "en";

export const COURIER_LANGS: { id: CourierLang; label: string; short: string; intl: string }[] = [
  { id: "pt", label: "Português", short: "PT", intl: "pt-BR" },
  { id: "es", label: "Español", short: "ES", intl: "es-PY" },
  { id: "en", label: "English", short: "EN", intl: "en-US" },
];

export const COURIER_LANG_COOKIE = "gw_cour_lang";

export function isCourierLang(v: unknown): v is CourierLang {
  return v === "pt" || v === "es" || v === "en";
}

/** Primeiro idioma suportado do Accept-Language ("es-PY,es;q=0.9,en;q=0.8" → "es"). */
export function langFromAccept(header: string | null | undefined): CourierLang | null {
  if (!header) return null;
  const list = header
    .split(",")
    .map((p) => {
      const [tag, q] = p.trim().split(";q=");
      return { l: tag.slice(0, 2).toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  return list.map((x) => x.l).find(isCourierLang) ?? null;
}

/** Idioma do entregador: escolha salva → cookie → idioma da loja → navegador → português. */
export function resolveCourierLang(o: { saved?: string | null; cookie?: string | null; store?: string | null; accept?: string | null }): CourierLang {
  if (isCourierLang(o.saved)) return o.saved;
  if (isCourierLang(o.cookie)) return o.cookie;
  if (isCourierLang(o.store)) return o.store;
  return langFromAccept(o.accept) ?? "pt";
}

/** Tradutor das telas: T(espanhol, português, inglês) — mesma ordem do tr() do resto do sistema + inglês. */
export function courierT(lang: CourierLang) {
  return (es: string, pt: string, en: string) => (lang === "en" ? en : lang === "es" ? es : pt);
}

export const intlOf = (lang: CourierLang) => COURIER_LANGS.find((l) => l.id === lang)!.intl;

// ---------------------------------------------------------------- erros das ações do entregador
export type CourierErrorCode = "not_found" | "go_online" | "taken" | "not_yours" | "closed" | "cancelled" | "cannot_decline";

export const COURIER_ERRORS: Record<CourierErrorCode, Record<CourierLang, string>> = {
  not_found: { pt: "Pedido não encontrado.", es: "Pedido no encontrado.", en: "Order not found." },
  go_online: { pt: "Fique online para pegar entregas.", es: "Ponete online para tomar entregas.", en: "Go online to take deliveries." },
  taken: { pt: "Outro entregador já pegou essa entrega.", es: "Otro repartidor ya tomó esta entrega.", en: "Another courier already took this delivery." },
  not_yours: { pt: "Essa entrega não é sua.", es: "Esta entrega no es tuya.", en: "This delivery isn't yours." },
  closed: { pt: "Pedido já encerrado.", es: "Pedido ya cerrado.", en: "This order is already closed." },
  cancelled: { pt: "Pedido cancelado pela loja.", es: "Pedido cancelado por la tienda.", en: "The store canceled this order." },
  cannot_decline: { pt: "Não dá mais para recusar esta entrega.", es: "Ya no se puede rechazar esta entrega.", en: "This delivery can no longer be declined." },
};

// ---------------------------------------------------------------- avisos enviados pelo servidor
export type CourierPushKind = "new" | "available" | "cancelled";

export function courierPushText(lang: CourierLang, kind: CourierPushKind, v: { number: string | number; store?: string | null; address?: string | null; km?: number | null }) {
  const T = courierT(lang);
  const n = String(v.number);
  if (kind === "new") {
    const km = v.km != null && Number.isFinite(v.km) ? v.km.toFixed(1) : null;
    const parts = [v.store, v.address, km ? T(`${km.replace(".", ",")} km de la tienda`, `${km.replace(".", ",")} km da loja`, `${km} km from the store`) : null].filter(Boolean);
    return { title: T(`Nueva entrega #${n}`, `Nova entrega #${n}`, `New delivery #${n}`), body: parts.join(" · ") };
  }
  if (kind === "available") {
    return {
      title: T(`Entrega disponible #${n}`, `Entrega disponível #${n}`, `Delivery available #${n}`),
      body: T("El primero que la tome se la lleva.", "Quem pegar primeiro leva.", "First to accept gets it."),
    };
  }
  return {
    title: T(`#${n} cancelado`, `#${n} cancelado`, `#${n} canceled`),
    body: T("La tienda canceló este pedido.", "A loja cancelou este pedido.", "The store canceled this order."),
  };
}
