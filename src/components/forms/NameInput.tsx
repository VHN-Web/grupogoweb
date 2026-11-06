"use client";
import { useState } from "react";
import { sanitizeName } from "@/core/region";

/** Campo de nome: aceita só letras (com acentos), espaços, apóstrofo e hífen. */
export function NameInput({
  id,
  name,
  defaultValue = "",
  value,
  onChange,
  placeholder,
  className = "input",
  required,
  autoComplete = "name",
}: {
  id?: string;
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  const [inner, setInner] = useState(sanitizeName(defaultValue));
  const v = value ?? inner;
  return (
    <input
      id={id}
      name={name}
      className={className}
      value={v}
      required={required}
      autoComplete={autoComplete}
      placeholder={placeholder}
      inputMode="text"
      maxLength={60}
      onChange={(e) => {
        const clean = sanitizeName(e.target.value);
        setInner(clean);
        onChange?.(clean);
      }}
    />
  );
}
