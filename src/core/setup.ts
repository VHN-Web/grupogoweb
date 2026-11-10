// Passo a passo de configuração da loja — regras PURAS. Usado no painel (card "Primeiros passos")
// e pela Geovana da GoWeb no WhatsApp (guia o lojista e lembra o próximo passo).

export type SetupInput = {
  slug: string;
  logoUrl: string | null;
  productCount: number;
  address: string | null;
  lat: number | null;
  whatsapp: string | null;
  acceptsDelivery: boolean;
  deliveryMaxKm: number;
  hasOnlinePayment: boolean; // Pix (chave), Mercado Pago ou Asaas
  orderCount: number;
};

export type SetupStep = { key: string; title: string; done: boolean; href: string; how: string };

export function setupSteps(i: SetupInput): SetupStep[] {
  const p = `/painel/${i.slug}`;
  return [
    { key: "logo", title: "Colocar a logo e as cores", done: !!i.logoUrl, href: `${p}/aparencia`, how: "Em Aparência do site, envie a logo e escolha o modelo e a cor da loja." },
    { key: "produtos", title: "Cadastrar os produtos", done: i.productCount >= 3, href: `${p}/produtos`, how: "Em Produtos, use “Cadastrar pela foto do cardápio” — ou mande a foto do cardápio aqui no WhatsApp que eu cadastro." },
    { key: "endereco", title: "Endereço e localização no mapa", done: !!i.address && i.lat != null, href: `${p}/config`, how: "Em Configurações, preencha o endereço e marque o ponto da loja no mapa (é dele que sai a taxa de entrega)." },
    { key: "whatsapp", title: "WhatsApp da loja", done: !!i.whatsapp, href: `${p}/config`, how: "Em Configurações, informe o WhatsApp que recebe os pedidos e aparece no site." },
    { key: "pagamento", title: "Receber Pix e cartão", done: i.hasOnlinePayment, href: `${p}/recebimentos`, how: "Em Recebimentos, crie a conta de recebimento (Pix e cartão caem direto para você) — ou ao menos cadastre a chave Pix em Configurações." },
    ...(i.acceptsDelivery
      ? [{ key: "entrega", title: "Taxa e raio de entrega", done: i.lat != null && i.deliveryMaxKm > 0, href: `${p}/config`, how: "Em Configurações → Entrega, defina a taxa base, o valor por km e até onde você entrega." }]
      : []),
    { key: "teste", title: "Fazer um pedido de teste", done: i.orderCount > 0, href: `/${i.slug}`, how: "Abra o seu site pelo celular, faça um pedido como cliente e veja ele chegar em Pedidos." },
  ];
}

export function setupProgress(steps: SetupStep[]) {
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, pct: Math.round((done / Math.max(1, steps.length)) * 100), next: steps.find((s) => !s.done) ?? null };
}

/** Texto para a Geovana: situação da loja + próximo passo. */
export function setupForPrompt(steps: SetupStep[], base: string): string {
  const pr = setupProgress(steps);
  if (!pr.next) return "Configuração da loja: completa ✓.";
  return `Configuração da loja: ${pr.done}/${pr.total} passos. Pendentes: ${steps
    .filter((s) => !s.done)
    .map((s) => `${s.title} (${s.how} Link: ${base}${s.href})`)
    .join(" · ")}. Se o lojista pedir ajuda para configurar, guie UM passo por vez, começando por "${pr.next.title}".`;
}
