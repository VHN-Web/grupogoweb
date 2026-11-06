import { formatMoney } from "@/core/money";
import { getRegion, tr } from "@/core/region";
import { getLabels, type Currency } from "@/core/types";

/** Idioma, rótulos e formato de dinheiro do estabelecimento (painel e site). */
export function panelI18n(t: { country: string; currency: string }) {
  const region = getRegion(t.country);
  const base = t.currency as Currency;
  return {
    region,
    locale: region.locale,
    T: tr(region.locale),
    L: getLabels(region.locale),
    base,
    fm: (v: number) => formatMoney(v, base),
    fmtDate: (d: Date, opts: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" }) =>
      new Intl.DateTimeFormat(region.intlLocale, { ...opts, timeZone: region.timeZone }).format(d),
  };
}
