import { BillingMock } from "./BillingMock";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_MOCK_GATEWAY !== "true") return <p className="p-8">No disponible.</p>;
  return (
    <BillingMock
      invoiceId={sp.invoice ?? ""}
      amount={Number(sp.amount ?? 0)}
      currency={(sp.currency as "PYG" | "USD" | "BRL") ?? "PYG"}
      returnUrl={sp.return ?? "/"}
    />
  );
}
