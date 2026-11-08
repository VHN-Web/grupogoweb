"use server";
// Ações do app do entregador. Toda ação confere a sessão do entregador e a loja dele.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCourier, clearCourierSession } from "@/lib/courier-auth";
import { claimDelivery, completeDelivery, CourierError, declineDelivery, pickUpDelivery, setCourierOnline } from "@/services/courier-app";
import { audit } from "@/lib/security";
import { getRegion, tr } from "@/core/region";

const done = (msg?: string, err?: boolean): never => {
  revalidatePath("/entregador");
  redirect(msg ? `/entregador?${err ? "err" : "ok"}=${encodeURIComponent(msg)}` : "/entregador");
};

async function run(fn: () => Promise<void>, ok?: string) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof CourierError) done(e.message, true);
    throw e;
  }
  done(ok);
}

export async function toggleOnlineAction(f: FormData) {
  const { courier, tenant } = await requireCourier();
  const on = f.get("online") === "1";
  await setCourierOnline(courier, on);
  await audit(tenant.id, `entregador:${courier.name}`, on ? "courier.online" : "courier.offline", courier.name);
  done();
}

export async function claimAction(orderId: string) {
  const { courier, tenant } = await requireCourier();
  const T = tr(getRegion(tenant.country).locale);
  await run(() => claimDelivery(courier, orderId), T("¡Entrega tomada! Pasá a retirarla.", "Entrega é sua! Passe na loja para retirar."));
}

export async function pickupAction(orderId: string) {
  const { courier, tenant } = await requireCourier();
  const T = tr(getRegion(tenant.country).locale);
  await run(() => pickUpDelivery(courier, orderId), T("En camino. El cliente ya te ve en el mapa.", "A caminho! O cliente já vê você no mapa."));
}

export async function deliverAction(orderId: string, f: FormData) {
  const { courier, tenant } = await requireCourier();
  const T = tr(getRegion(tenant.country).locale);
  await run(() => completeDelivery(courier, orderId, f.get("collected") === "on"), T("Entrega confirmada ✓", "Entrega confirmada ✓"));
}

export async function courierLogout() {
  const s = await requireCourier();
  await setCourierOnline(s.courier, false);
  await clearCourierSession();
  redirect("/entregador/entrar?saiu=1");
}

export async function declineAction(orderId: string) {
  const { courier, tenant } = await requireCourier();
  const T = tr(getRegion(tenant.country).locale);
  await run(() => declineDelivery(courier, orderId), T("Entrega rechazada. Pasó al siguiente repartidor.", "Entrega recusada. Ela foi para o próximo entregador."));
}
