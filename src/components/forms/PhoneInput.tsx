"use client";
import { useState } from "react";
import { PHONE_RULES, PHONE_COUNTRIES, isValidPhone, sanitizePhone, toE164, type Locale } from "@/core/region";

function parseE164(e164: string | null | undefined, fallback: string) {
  if (e164) {
    const rule = Object.values(PHONE_RULES).find((r) => e164.startsWith(`+${r.dial}`));
    if (rule) return { country: rule.country, national: e164.slice(rule.dial.length + 1) };
  }
  return { country: fallback, national: "" };
}

/**
 * Telefone/WhatsApp: escolha do país + só números, com o tamanho exato do país (inclui DDD).
 * Envia no formulário (campo `name`) o número em E.164 (+5511912345678) ou vazio.
 */
export function PhoneInput({
  id,
  name,
  defaultValue,
  defaultCountry = "PY",
  locale = "es",
  required,
  onChange,
  className = "input",
  selectClassName = "input",
}: {
  id?: string;
  name?: string;
  defaultValue?: string | null;
  defaultCountry?: string;
  locale?: Locale;
  required?: boolean;
  onChange?: (e164: string | null, valid: boolean) => void;
  className?: string;
  selectClassName?: string;
}) {
  const init = parseE164(defaultValue, defaultCountry);
  const [country, setCountry] = useState(init.country);
  const [national, setNational] = useState(init.national);
  const [touched, setTouched] = useState(false);
  const rule = PHONE_RULES[country];
  const valid = isValidPhone(national, country);
  const e164 = valid ? toE164(national, country) : null;
  const pt = locale === "pt";

  const emit = (c: string, n: string) => {
    const ok = isValidPhone(n, c);
    onChange?.(ok ? toE164(n, c) : null, ok);
  };

  return (
    <div>
      <div className="flex gap-2">
        <select
          aria-label={pt ? "País" : "País"}
          className={`${selectClassName} px-2`}
          style={{ width: 112, flex: "0 0 112px" }}
          value={country}
          onChange={(e) => {
            const c = e.target.value;
            const n = sanitizePhone(national, c);
            setCountry(c);
            setNational(n);
            emit(c, n);
          }}
        >
          {/* o país da loja/do visitante aparece primeiro */}
          {[defaultCountry, ...PHONE_COUNTRIES.filter((c) => c !== defaultCountry)].filter((c): c is string => !!c && !!PHONE_RULES[c]).map((c) => (
            <option key={c} value={c}>
              {c} +{PHONE_RULES[c].dial}
            </option>
          ))}
        </select>
        <input
          id={id}
          className={`${className} min-w-0`}
          style={{ flex: "1 1 0%", width: "auto" }}
          inputMode="numeric"
          autoComplete="tel-national"
          pattern="[0-9]*"
          maxLength={rule.length + 1}
          placeholder={rule.placeholder.replace(/\s/g, "")}
          value={national}
          required={required}
          onBlur={() => setTouched(true)}
          onChange={(e) => {
            const n = sanitizePhone(e.target.value, country);
            setNational(n);
            emit(country, n);
          }}
        />
      </div>
      {name && <input type="hidden" name={name} value={e164 ?? ""} />}
      <p className={`mt-1 text-[12px] ${touched && national && !valid ? "text-red-500" : "opacity-60"}`}>
        {touched && national && !valid
          ? pt
            ? `Número incompleto: ${rule.hint.pt}`
            : `Número incompleto: ${rule.hint.es}`
          : `${national.length}/${rule.length} · ${pt ? rule.hint.pt : rule.hint.es}`}
      </p>
    </div>
  );
}
