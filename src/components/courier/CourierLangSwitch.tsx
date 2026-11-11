// Seletor de idioma do app do entregador (Português · Español · English). Formulário simples: funciona sem JavaScript.
import { COURIER_LANGS, type CourierLang } from "@/core/courier-i18n";
import { setCourierLangAction } from "@/app/entregador/actions";

export function CourierLangSwitch({ lang, back, label }: { lang: CourierLang; back: string; label?: string }) {
  return (
    <form action={setCourierLangAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="back" value={back} />
      {label && <span className="text-sm font-semibold">{label}</span>}
      <div className="flex gap-1 rounded-2xl bg-[var(--s-soft)] p-1" role="group" aria-label={label ?? (lang === "en" ? "Language" : "Idioma")}>
        {COURIER_LANGS.map((l) => (
          <button
            key={l.id}
            name="lang"
            value={l.id}
            lang={l.intl}
            aria-pressed={l.id === lang}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${l.id === lang ? "bg-[#3CC46B] text-[#0E0E10]" : "text-[var(--s-muted)]"}`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </form>
  );
}
