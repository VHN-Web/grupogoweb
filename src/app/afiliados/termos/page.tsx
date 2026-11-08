import Link from "next/link";
import { pctLabel } from "@/core/affiliates";
import { affiliateConfig } from "@/services/affiliates";

export const metadata = { title: "GoWeb Afiliados — termos do programa" };

export default async function AffTerms() {
  const cfg = await affiliateConfig();
  const tiers = cfg.tiers.map((t, i) => `${t.name} ${pctLabel(t.pctBp)} (${cfg.tiers[i + 1] ? `${t.minSales} a ${cfg.tiers[i + 1].minSales - 1}` : `${t.minSales} ou mais`} vendas)`).join("; ");
  const items = [
    ["Quem pode participar", "Qualquer pessoa maior de idade com CPF no Brasil. O programa vale só para clientes do Brasil. Não há taxa de entrada, meta mínima nem multa."],
    ["Ativação", "Depois do cadastro, o afiliado entra na turma da próxima live de boas-vindas (quinzenal). O link de divulgação é liberado pela GoWeb depois da live."],
    ["Comissão sobre a implantação", `O afiliado recebe uma porcentagem do valor da implantação (sem o domínio) de cada cliente que contratar pelo seu link ou indicação e pagar. A porcentagem depende do total de vendas pagas: ${tiers}. A venda que faz o afiliado subir de nível já recebe a nova porcentagem.`],
    ["Plano anual", `Quando o cliente indicado contrata um plano anual, o afiliado recebe mais ${pctLabel(cfg.annualPctBp)} sobre a primeira anuidade paga. Mensalidades e renovações não geram comissão.`],
    ["Indicação de afiliados", `Quem traz um novo afiliado para o programa recebe ${pctLabel(cfg.referrerPctBp)} da implantação de cada venda paga desse afiliado. Vale um único nível.`],
    ["Atribuição", `A venda é do afiliado cujo link o cliente abriu por último (válido por ${cfg.cookieDays} dias) ou que cadastrou o contato do cliente primeiro no portal. Contato já em atendimento por outro afiliado não pode ser cadastrado de novo.`],
    ["Pagamento", "A comissão aparece no portal assim que o cliente paga a implantação e é paga por Pix na chave cadastrada. O afiliado é responsável pelos próprios impostos."],
    ["Cancelamentos", "Se o pagamento do cliente for estornado ou contestado, a comissão correspondente é cancelada ou descontada das próximas. Compras para si mesmo (autoindicação), cadastros falsos ou spam levam à suspensão e perda das comissões pendentes."],
    ["Divulgação", "Use só os materiais e informações oficiais. É proibido prometer funções ou preços diferentes dos publicados, se passar pela GoWeb ou enviar mensagens em massa sem autorização (LGPD)."],
    ["Ranking e prêmios", "O ranking mensal considera as vendas pagas no mês. Prêmios, quando houver, são anunciados nas lives e podem mudar a cada campanha."],
    ["Alterações", "A GoWeb pode alterar as porcentagens e regras com aviso no portal; comissões já geradas não mudam."],
  ];
  return (
    <main className="site min-h-dvh">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/afiliados" className="text-sm font-semibold hover:underline">← Programa de afiliados</Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Termos do programa de afiliados GoWeb</h1>
        <ol className="mt-8 space-y-6">
          {items.map(([t, d], i) => (
            <li key={t}>
              <h2 className="font-bold">{i + 1}. {t}</h2>
              <p className="mt-1 text-[var(--s-muted)]">{d}</p>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
