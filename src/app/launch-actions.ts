"use server";
// Lista de espera do lançamento: vira lead no CRM dos sócios (origem "site") e avisa no celular.
import { redirect } from "next/navigation";
import { upsertLead } from "@/services/crm";
import { sendPush } from "@/services/push";
import { clientIp, rateLimit } from "@/lib/security";

export async function joinWaitlist(f: FormData) {
  const lang = f.get("lang") === "es" ? "es" : "pt";
  const v = String(f.get("v") ?? "").replace(/[^a-z0-9-]/g, "").slice(0, 20);
  const back = (k: string) => redirect(v ? `/escaneou?v=${v}&lista=${k}#lista` : `/?lang=${lang}&lista=${k}#lista`);
  if (String(f.get("website") ?? "")) back("ok"); // armadilha para robôs
  if (!(await rateLimit(`waitlist:${await clientIp().catch(() => "x")}`, 5, 3600))) back("limite");
  const name = String(f.get("name") ?? "").trim().slice(0, 80);
  const business = String(f.get("business") ?? "").trim().slice(0, 80);
  const phone = String(f.get("phone") ?? "").replace(/\D/g, "").slice(0, 15);
  const city = String(f.get("city") ?? "").trim().slice(0, 60);
  if (!business || phone.length < 10) back("erro");
  try {
    await upsertLead({ name: business, phone, city: city || null, notes: `Lista de espera do lançamento${v ? ` (panfleto: ${v})` : ""} — contato: ${name || "—"}`, pain: "Pediu aviso do lançamento (12/11)" }, "site");
    await sendPush("all", { title: "Novo lead na lista de espera 🚀", body: `${business}${city ? ` · ${city}` : ""}`, url: "/crm/leads", tag: "waitlist", category: "leads" }).catch(() => null);
  } catch {
    back("erro");
  }
  back("ok");
}
