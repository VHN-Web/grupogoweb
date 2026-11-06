import { MockGateway } from "./MockGateway";

// Página que SIMULA o checkout hospedado de um gateway (Bancard/Pagopar...). Apenas dev/demo.
export default async function MockPay({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_MOCK_GATEWAY !== "true") return <p className="p-8">No disponible.</p>;
  return (
    <MockGateway
      refId={sp.ref ?? ""}
      amount={Number(sp.amount ?? 0)}
      currency={(sp.currency as "PYG" | "USD" | "BRL") ?? "PYG"}
      returnUrl={sp.return ?? "/"}
      slug={sp.t ?? ""}
    />
  );
}
