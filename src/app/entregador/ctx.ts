import "server-only";
import { headers } from "next/headers";
import { isAndroidUA, isCourierNativeUA } from "@/core/courier-native";
import { cookies } from "next/headers";
import { requireCourier } from "@/lib/courier-auth";
import { getRegion } from "@/core/region";
import { COURIER_LANG_COOKIE, courierT, intlOf, resolveCourierLang } from "@/core/courier-i18n";
import { formatMoney } from "@/core/money";
import type { Currency } from "@/core/types";

/** Sessão + textos no idioma escolhido pelo entregador (pt, es ou en; padrão = idioma da loja). */
export async function courierCtx() {
  const { courier, tenant } = await requireCourier();
  const region = getRegion(tenant.country);
  // dentro do app Android (WebView) o GPS e as notificações são nativos
  const ua = (await headers()).get("user-agent");
  const native = isCourierNativeUA(ua);
  const android = isAndroidUA(ua);
  const lang = resolveCourierLang({ saved: courier.lang, cookie: (await cookies()).get(COURIER_LANG_COOKIE)?.value, store: region.locale });
  const T = courierT(lang);
  const intl = intlOf(lang);
  const fmtTime = (d: Date) => new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: region.timeZone }).format(d);
  const fmtDay = (d: Date) => new Intl.DateTimeFormat(intl, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: region.timeZone }).format(d);
  const shell = {
    store: tenant.name,
    name: courier.name,
    online: courier.online,
    locale: lang,
    labels: {
      home: T("Entregas", "Entregas", "Deliveries"),
      earnings: T("Ganancias", "Ganhos", "Earnings"),
      account: T("Cuenta", "Conta", "Account"),
      online: "Online",
      offline: "Offline",
      install: T("Instalar", "Instalar", "Install"),
    },
  };
  return { courier, tenant, region, lang, native, android, T, fm: (v: number) => formatMoney(v, tenant.currency as Currency), fmtTime, fmtDay, shell };
}
