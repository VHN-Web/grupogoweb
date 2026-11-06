"use client";
import { useState } from "react";
import { formatMoney, MINOR_UNITS, minorToInput } from "@/core/money";
import type { Currency } from "@/core/types";

/**
 * Campo de valor com máscara monetária: aceita só números e formata enquanto digita
 * (estilo caixa eletrônico — "1", "12", "123" → R$ 0,01 · R$ 0,12 · R$ 1,23).
 * Envia o valor no campo `name` no formato que o servidor entende.
 */
export function MoneyInput({
  name,
  currency,
  defaultMinor,
  required,
  className,
  placeholder,
  ariaLabel,
}: {
  name: string;
  currency: Currency;
  defaultMinor?: number | null;
  required?: boolean;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [minor, setMinor] = useState<number | null>(defaultMinor ?? null);
  const max = 1_000_000_000 * MINOR_UNITS[currency]; // limite de sanidade
  return (
    <>
      <input
        className={className ?? "input"}
        inputMode="numeric"
        autoComplete="off"
        aria-label={ariaLabel ?? placeholder}
        placeholder={placeholder ?? formatMoney(0, currency)}
        required={required}
        value={minor == null ? "" : formatMoney(minor, currency)}
        onKeyDown={(e) => {
          // bloqueia letras e símbolos; permite atalhos e navegação
          if (e.ctrlKey || e.metaKey || e.key.length > 1) return;
          if (!/\d/.test(e.key)) e.preventDefault();
        }}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
          if (!digits) return setMinor(null);
          const n = Math.min(Number(digits), max);
          setMinor(n);
        }}
      />
      <input type="hidden" name={name} value={minor == null ? "" : minorToInput(minor, currency)} />
    </>
  );
}
