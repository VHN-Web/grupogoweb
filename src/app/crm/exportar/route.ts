import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";
import { CRM_STATUS_LABEL, SCORE_LABEL, toCsv } from "@/core/crm";
import { getPlatformAdmin } from "@/lib/auth";
import { partners } from "@/services/crm";

// Exporta todos os leads do CRM em CSV (abre no Excel/Google Planilhas).
export async function GET() {
  if (!(await getPlatformAdmin())) return NextResponse.redirect(new URL("/admin/login?next=/crm", process.env.APP_URL ?? "http://localhost:3000"));
  const [leads, people] = await Promise.all([db.query.crmLeads.findMany({ orderBy: desc(schema.crmLeads.createdAt) }), partners()]);
  const who = (id: string | null) => people.find((p) => p.id === id)?.name ?? "";
  const d = (x: Date | null) => (x ? x.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
  const rows = [
    ["id", "name", "category", "neighborhood", "city", "address", "phone", "instagram", "email", "website", "reviews", "pain", "pitch", "score", "status", "owner", "contactDate", "followUpDate", "notes", "source"],
    ...leads.map((l) => [l.code, l.name, l.category, l.neighborhood, l.city, l.address, l.phone?.replace("+", ""), l.instagram, l.email, l.website, l.reviews, l.pain, l.pitch, SCORE_LABEL[l.score], CRM_STATUS_LABEL[l.status], who(l.ownerId), d(l.contactAt), d(l.followUpAt), l.notes, l.source]),
  ];
  return new NextResponse("﻿" + toCsv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="goweb-crm-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
