// Selo e convite do GoInteligence (recursos pro).
export function ProBadge() {
  return (
    <span className="ml-1 inline-block rounded bg-gradient-to-r from-[#1F7FD8] to-[#3CC46B] px-1.5 py-0.5 align-middle text-[10px] font-black tracking-wide text-white">
      GoInteligence
    </span>
  );
}

export function ProUpsell({ locale, feature }: { locale: "es" | "pt"; feature?: string }) {
  const pt = locale === "pt";
  return (
    <div className="rounded-2xl border border-[#3CC46B]/40 bg-gradient-to-br from-[#1F7FD8]/10 to-[#3CC46B]/10 p-5">
      <p className="font-bold">
        {feature ? `${feature} — ` : ""}
        {pt ? "disponível no GoInteligence" : "disponible en GoInteligence"}
      </p>
      <p className="mt-1 text-sm text-muted">
        {pt
          ? "Campanhas de reativação no WhatsApp, indique e ganhe, cartão fidelidade/cashback, cupom de aniversário, sugestões inteligentes, recuperação de carrinho, ofertas relâmpago, agenda, equipe com login e relatório de caixa automático."
          : "Campañas de reactivación por WhatsApp, recomendá y ganá, tarjeta de fidelidad/cashback, cupón de cumpleaños, sugerencias inteligentes, carritos abandonados, ofertas relámpago, agenda, equipo con login e informe de caja automático."}
      </p>
      <p className="mt-3 text-sm font-semibold">{pt ? "Fale com o suporte para ativar no seu plano." : "Hablá con soporte para activarlo en tu plan."}</p>
    </div>
  );
}
