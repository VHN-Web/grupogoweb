import "server-only";
import { headers } from "next/headers";
import { isAndroidUA, isCourierNativeUA } from "@/core/courier-native";
import { requireCourier } from "@/lib/courier-auth";
import { getRegion, tr } from "@/core/region";
import { formatMoney } from "@/core/money";
import type { Currency } from "@/core/types";

/** Sessão + textos no idioma da loja do entregador. */
export async function courierCtx() {
  const { courier, tenant } = await requireCourier();
  const region = getRegion(tenant.country);
  // dentro do app Android (WebView) o GPS e as notificações são nativos
  const ua = (await headers()).get("user-agent");
  const native = isCourierNativeUA(ua);
  const android = isAndroidUA(ua);
  const T = tr(region.locale);
  const fmtTime = (d: Date) => new Intl.DateTimeFormat(region.intlLocale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: region.timeZone }).format(d);
  const fmtDay = (d: Date) => new Intl.DateTimeFormat(region.intlLocale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: region.timeZone }).format(d);
  const shell = {
    store: tenant.name,
    name: courier.name,
    online: courier.online,
    locale: region.locale,
    labels: {
      home: T("Entregas", "Entregas"),
      earnings: T("Ganancias", "Ganhos"),
      account: T("Cuenta", "Conta"),
      online: "Online",
      offline: "Offline",
      install: T("Instalar", "Instalar"),
    },
  };
  return { courier, tenant, region, native, android, T, fm: (v: number) => formatMoney(v, tenant.currency as Currency), fmtTime, fmtDay, shell };
}
