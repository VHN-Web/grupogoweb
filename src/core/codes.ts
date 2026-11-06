// Geração de códigos curtos (número do pedido, código da mesa).
import { randomInt } from "node:crypto";

/** Número do pedido mostrado ao cliente: 4 dígitos, 1000–9999. */
export function randomOrderNumber(): string {
  return String(randomInt(1000, 10000));
}

// Sem caracteres ambíguos (0/O, 1/I/L)
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Código da mesa usado no QR (?mesa=XXXXXX). Não sequencial para evitar adivinhação. */
export function randomTableCode(length = 6): string {
  let s = "";
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(0, ALPHABET.length)];
  return s;
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
