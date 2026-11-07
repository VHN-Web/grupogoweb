import { requireTenantAdmin } from "@/lib/auth";
import { formatBirthday } from "@/core/growth";
import { minorToInput } from "@/core/money";
import type { Currency } from "@/core/types";
import { shopperRows } from "@/services/growth";
import { audit } from "@/lib/security";
import { actorName } from "@/lib/auth";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  // evita injeção de fórmula ao abrir no Excel/Sheets
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTenantAdmin(slug, "customers");
  const rows = await shopperRows(t.id);
  const head = ["nome", "whatsapp", "pedidos", "total", "ultima_compra", "aniversario", "aceita_ofertas", "cliente_desde"];
  const lines = rows.map((r) =>
    [r.name, r.phone, r.orders, minorToInput(r.total, t.currency as Currency), r.lastOrderAt?.toISOString().slice(0, 10) ?? "", formatBirthday(r.birthday), r.marketingOptIn ? "sim" : "não", r.createdAt.toISOString().slice(0, 10)].map(cell).join(","),
  );
  await audit(t.id, await actorName(slug), "customers.export", `${rows.length}`);
  return new Response("﻿" + [head.join(","), ...lines].join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="clientes-${slug}.csv"`, "cache-control": "no-store" },
  });
}
