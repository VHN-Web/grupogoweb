# GoWeb — instruções para IA (Claude / Cursor)

Plataforma SaaS **multi-tenant white-label** para restaurantes, bares e lanchonetes no **Paraguai**:
cardápio digital por QR, pedidos (mesa / retiro / delivery), pagamento multi-moeda (Gs., US$, R$),
caixa (PDV), estoque, registro de facturas e painel do estabelecimento. É um **site** (não app nativo).

Dois níveis:
1. **Plataforma** (dono: Lázaro) — `/admin`: planos, clientes contratantes, faturas multi-moeda,
   implantação → entrega → mensalidade automática → atraso → suspensão, domínios.
2. **Estabelecimento** (cliente do Lázaro) — `/{slug}` (cardápio) e `/painel/{slug}`.

Interface do cliente final, do painel do estabelecimento e das faturas em **espanhol (PY)**.
Admin da plataforma, comentários e docs em **português**.

## Stack
- Next.js 15 (App Router, Server Components, Server Actions) + React 19 + TypeScript strict
- Tailwind CSS v4 (tokens em `src/app/globals.css`; cor da marca via CSS var `--brand`)
- Drizzle ORM + PostgreSQL (dev local: PGlite em `./.pglite`; produção: `DATABASE_URL=postgres://...`)
- zod para validação; vitest para testes

## Mapa do código
```
src/core/          Regras de negócio PURAS (sem I/O): dinheiro, delivery, códigos, tipos, config do tenant
src/adapters/      PONTOS DE EXTENSÃO (interfaces + implementações)
  payments/        PaymentProvider + registry (cash, pos, pix_manual, transfer_manual, mock_online, bancard*, pagopar*)
  fiscal/          FiscalProvider (manual, sifen*)
  distance/        DistanceProvider (linha reta; futuro Google/Mapbox/OSRM)
  exchange-rates/  ExchangeRateProvider (manual)
  billing/         BillingProvider p/ cobrar OS CLIENTES DA PLATAFORMA (mercadopago, manual, mock, paypal*, pagopar*)
  notify/          E-mail (Resend) + WhatsApp (webhook genérico) — sem config = só registra
  storage/         Upload de imagens (Vercel Blob ou pasta .uploads/)
src/core/themes.ts        Modelos de site (cores, fontes, banner, layout). Novo modelo = nova entrada aqui
src/core/illustrations.ts Ilustrações SVG próprias usadas quando não há foto
src/components/brand/     Logo GoWeb (GoWebLogo/GoWebMark) e tela de login
src/services/      Casos de uso: orders, cash, fiscal, provision (cria tenant), billing (ciclo comercial)
src/middleware.ts  Roteamento por domínio: domínio próprio / slug.dominio-da-plataforma -> /{slug}
src/db/            schema.ts (Drizzle), client.ts, seed.ts
src/app/[slug]/    Site público do estabelecimento (cardápio, checkout, /pedido/[id] com comprovante)
src/app/painel/    Painel do estabelecimento (login por tenant; páginas em (app)/; actions.ts)
src/app/admin/     Admin da plataforma: (panel)/ visão geral, clientes, planos, config; login/
src/app/fatura/    Página pública da fatura (cliente escolhe Gs./US$/R$ e paga)
src/app/api/       orders, delivery-quote, payments/[provider]/webhook,
                   billing/checkout, billing/webhook/[provider], cron/billing, domains/resolve
```
`*` = stub com `available: false`, aguardando implementação humana.

## Regras invioláveis
1. **Isolamento multi-tenant**: toda query de dado de negócio filtra por `tenantId`. Toda Server Action do painel começa com `requireTenantAdmin(slug)`.
2. **Dinheiro**: cada estabelecimento tem uma **moeda base** (`tenant.currency`: PYG no Paraguai, BRL no Brasil). As colunas `*_pyg` de pedidos/produtos/caixa/notas guardam valores na **unidade menor da moeda base** (nome histórico: em BRL são centavos). Exceção: `invoices.amount_pyg/usd/brl` do billing são de fato por moeda. Cotações = "unidades da base por 1 unidade da moeda X" (`tenantRates`). Nunca use float para somar dinheiro; conversões só via `src/core/money.ts` (`fromBase`/`toBase`/`changeDue`), entrada de valores via `parseMajorToMinor`/`minorToInput`.
2b. **Região** (`src/core/region.ts`): `tenant.country` (PY/BR) define idioma (es/pt), moeda base, cotações, delivery e meios de pagamento padrão (`provisionTenant({country})`). Textos: `tr(locale)(es, pt)`; no painel use `panelI18n(t)`. Página de vendas detecta o país do visitante (`x-vercel-ip-country`/accept-language, `?lang=` força).
2d. **Exclusividade por país**: um estabelecimento/cliente do Brasil só vê português e R$ (sem Gs./US$, sem SIFEN/RUC); Paraguai vê espanhol com Gs./US$/R$. Moedas aceitas = `region.currency + region.extraCurrencies`.
2e. **Gateway do estabelecimento**: Mercado Pago (`src/adapters/payments/mercadopago.ts`) com o token DO estabelecimento, salvo em Configurações → Integrações (testado via /users/me antes de salvar). Opção sem credencial não aparece no site (`publicPaymentConfig`).
2f. **GoInteligence** (plano pro: `tenant.tier = "pro"`, definido por `plans.intelligence` na contratação ou pelo admin): sugestões (`core/intelligence.ts#buildSuggestions`), ofertas relâmpago (`products.promoPricePyg/promoEndsAt`, preço efetivo calculado no servidor), cupons (`coupons`, validados em `services/orders.ts`), carrinhos abandonados (`carts`, aviso ao lojista ao abrir o painel), agenda (`appointments` + `tenants.bookingConfig`, produtos com `durationMin`), equipe (`staff`, sessão `staff:<id>`, áreas em `PANEL_AREAS`; `requireTenantAdmin(slug, area)`), relatório de caixa (`services/intelligence.ts#cashReport`). Ações em `painel/[slug]/(app)/pro-actions.ts`.
2g. **Impressora térmica**: `/painel/[slug]/imprimir/[id]` (58/80 mm via `@page`), impresso por iframe (`components/ThermalPrint.tsx`); auto-impressão de pedidos novos se `tenants.autoPrint`.
2c. **Nome e telefone**: nome só letras (`sanitizeName`/`isValidName`, componente `NameInput`); telefone só dígitos com o tamanho exato do país incluindo DDD (`PHONE_RULES`, `PhoneInput`), salvo em E.164 e validado de novo no servidor (`isValidE164`).
3. **Preço e taxa SEMPRE recalculados no servidor** (`services/orders.ts`). Nunca confiar em valores vindos do navegador.
4. **Integrações externas só via adapter.** Nada de chamar Bancard/Pagopar/SIFEN direto de página ou service. Novo gateway = novo arquivo em `src/adapters/payments/` + registro em `registry.ts`. O resto do sistema não muda.
5. **Estoque**: baixa condicional dentro da transação do pedido (`stock >= qty`); cancelamento devolve via `stock_movements`.
6. **Credenciais** de gateway ficam em `tenant.paymentConfig.credentials` e nunca vão ao browser (use `publicPaymentConfig`).
7. **Billing**: faturas guardam o valor nas 3 moedas (definidos no plano, sem conversão). `markInvoicePaid` é idempotente e é o ÚNICO lugar que dispara efeitos (provisionar, reativar). Gateway por moeda em `platform_settings.gatewayByCurrency`.
8. O admin da plataforma (sessão "platform") acessa qualquer `/painel/{slug}`.
9. Novos valores de "enum" → adicionar em `src/core/types.ts` (e rótulos em `LABELS`).
10. Identidade GoWeb (goweboficial.com · suporte@goweboficial.com · "Clique, Conecte, Venda."): ônix #0E0E10, marfim #F4F1EA, verde #3CC46B, azul #1F7FD8, marinho #1D4F91; logo SEMPRE via `GoWebLogo`/`GoWebMark` (nunca texto). O site do estabelecimento usa a marca DELE (tema + cor), com GoWeb só no rodapé.
11. Mobile-first. Componentes de cliente só quando houver interatividade.

## Comandos
```
npm run dev         # http://localhost:3000
npm run db:setup    # cria tabelas + dados demo (pare o dev server antes: PGlite aceita 1 processo)
npm run db:push     # aplica mudanças do schema
npm test            # testes das regras de negócio
npm run typecheck
npm run build
```

## Ao implementar algo novo
- Regra de negócio pura → `src/core/` + teste em `*.test.ts`.
- Mudou o schema → `src/db/schema.ts` e rode `npm run db:push`.
- Rode `npm test && npm run typecheck` antes de concluir.
- Veja `docs/ROADMAP.md` para a ordem das próximas etapas e os pontos que exigem intervenção humana.
