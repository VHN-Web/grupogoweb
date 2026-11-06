"use client";
import { useState } from "react";
import { formatMoney, MINOR_UNITS, minorToInput } from "@/core/money";
import type { Currency } from "@/core/types";

/**
 * Campo de valor com máscara monetária: aceita só números e formata enquanto digita
 * (estilo caixa eletrônico — "1", "12", "123" → R$ 0,01 · R$ 0,12 · R$ 1,23).
 * Envia o valor no campo `name` no formato que o servidor entende.
 */
function toEnd(el: HTMLInputElement) {
  requestAnimationFrame(() => {
    const n = el.value.length;
    try {
      el.setSelectionRange(n, n);
    } catch {}
  });
}

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
        // o cursor fica sempre no fim: os dígitos entram pela direita, como na maquininha
        onFocus={(e) => toEnd(e.currentTarget)}
        onClick={(e) => toEnd(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.ctrlKey || e.metaKey || e.key === "Tab" || e.key === "Enter" || e.key.startsWith("Arrow")) return;
          if (/^\d$/.test(e.key)) {
            e.preventDefault();
            setMinor((m) => Math.min((m ?? 0) * 10 + Number(e.key), max));
            return;
          }
          if (e.key === "Backspace" || e.key === "Delete") {
            e.preventDefault();
            setMinor((m) => (m == null || m < 10 ? null : Math.floor(m / 10)));
            return;
          }
          if (e.key.length === 1) e.preventDefault(); // letras e símbolos
        }}
        onPaste={(e) => {
          // colar "150,50" ou "R$ 1.500,00" = valor completo
          e.preventDefault();
          const txt = e.clipboardData.getData("text");
          const hasCents = /[.,]\d{1,2}\s*$/.test(txt);
          let digits = txt.replace(/\D/g, "");
          if (!digits) return;
          if (!hasCents && MINOR_UNITS[currency] > 1) digits += "00";
          setMinor(Math.min(Number(digits), max));
        }}
        onChange={(e) => {
          // teclados de celular que não avisam a tecla: usa o tipo de edição
          const ev = e.nativeEvent as InputEvent;
          if (ev.inputType === "insertText" && ev.data) {
            const d = ev.data.replace(/\D/g, "");
            if (d) setMinor((m) => Math.min((m ?? 0) * 10 ** d.length + Number(d), max));
            return;
          }
          if (ev.inputType?.startsWith("delete")) {
            setMinor((m) => (m == null || m < 10 ? null : Math.floor(m / 10)));
            return;
          }
          const digits = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
          setMinor(digits ? Math.min(Number(digits), max) : null);
        }}
      />
      <input type="hidden" name={name} value={minor == null ? "" : minorToInput(minor, currency)} />
    </>
  );
}
