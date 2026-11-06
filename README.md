# GoWeb

Cardápio digital com QR, pedidos, caixa e estoque para restaurantes, bares, cafeterias e lojas no Paraguai — multi-tenant e white-label.

## Rodar localmente (5 minutos)

Requisitos: Node.js 20+ (recomendado 22). **Não precisa de Docker nem de Postgres instalado** — em dev
o banco é o PGlite (PostgreSQL embutido, pasta `.pglite/`).

```bash
npm install
cp .env.example .env
npm run db:setup     # cria as tabelas e o restaurante de demonstração
npm run dev
```

- Página de vendas: http://localhost:3000
- Lojas demo (uma por modelo): `/brasa-burger`, `/nonna-lucia`, `/cafe-morena`, `/kira`, `/lupulo`, `/demo`
- Painel de qualquer loja demo: `/painel/{loja}` — senha `demo1234`
- Link de mesa: aparece no terminal após o `db:setup`
- Admin da plataforma (seus clientes, planos, cobranças): http://localhost:3000/admin — senha em `PLATFORM_ADMIN_PASSWORD` (padrão `admin123`)
- Em dev, todos os gateways estão no modo **Simulado** — dá para testar o fluxo inteiro sem dinheiro real.

> O PGlite aceita **um processo por vez**. Pare o `npm run dev` antes de rodar `db:setup`/`db:push`.

## O que já funciona

| Área | Status |
|---|---|
| Multi-tenant: 1 código, N estabelecimentos em `/{slug}` | ✅ |
| Identidade GoWeb (logo, página de vendas, painel, admin, logins) | ✅ |
| 6 modelos de site (Clássico, Hamburgueria, Restaurante, Cafeteria, Loja, Bar) | ✅ |
| Banner de promoção, logo e fotos com upload; ilustrações quando não há foto | ✅ |
| Criar estabelecimento (white-label: nome, logo, cor, mesas) em `/admin` | ✅ |
| Cardápio mobile-first, categorias, produtos esgotados | ✅ |
| QR por mesa (código aleatório) + QR geral, impressão em lote | ✅ |
| Carrinho, checkout: mesa / retiro / delivery | ✅ |
| Delivery com recálculo por distância (geolocalização do cliente), raio máximo, grátis acima de X | ✅ |
| Pagamento: efectivo, tarjeta, Pix, transferencia — em Gs., US$ ou R$ com câmbio do dia | ✅ |
| Troco (vuelto) em guaraníes calculado automaticamente | ✅ |
| Gateway online simulado (fluxo completo redirect → webhook → pago) | ✅ |
| Número aleatório do pedido + comprovante imprimível / PDF | ✅ |
| Painel de pedidos em tempo quase real, fluxo de status, cancelamento devolve estoque | ✅ |
| Abrir/fechar o local para pedidos | ✅ |
| Caixa (PDV): abertura, sangria/suprimento, resumo por meio e por moeda, fechamento | ✅ |
| Estoque: controle por produto, ajustes, histórico de movimentos | ✅ |
| Registro de facturas emitidas e recebidas (IVA 10/5/exento) | ✅ |
| Bancard, Pagopar (pagamentos dos restaurantes) | 🔌 adapter preparado (stub) |
| **Plataforma**: planos (mensal/anual), preço em Gs./US$/R$, implantação | ✅ |
| Contratação → fatura de implantação → pago → sistema criado automaticamente + tarefas | ✅ |
| Entrega com 1 clique → acessos + 1ª mensalidade enviados ao cliente | ✅ |
| Mensalidades automáticas (cron diário), aviso de atraso, suspensão e reativação ao pagar | ✅ |
| Página da fatura: cliente escolhe pagar em guaraníes, dólares ou reais | ✅ |
| Mercado Pago (BRL) | ✅ implementado — falta testar com suas credenciais |
| PayPal (USD), Pagopar (Gs.) para cobrar seus clientes | 🔌 adapter preparado (stub) |
| Domínio: anual inclui grátis; mensal paga adicional + renovação anual | ✅ |
| Domínio próprio por cliente + `slug.seudominio` | ✅ (precisa DNS) |
| Notificações por e-mail e WhatsApp (opcional por cliente) | ✅ (precisa chave Resend / URL da sua API de WhatsApp) |
| SIFEN (factura electrónica) | 🔌 adapter preparado (stub) |

## Arquitetura em uma frase
Regras puras em `src/core`, integrações atrás de interfaces em `src/adapters`, casos de uso em
`src/services`, telas em `src/app`. Detalhes e regras para a IA em [`CLAUDE.md`](./CLAUDE.md).

## Como funciona a venda (seu fluxo)
1. `/admin/planos`: confira os planos e preços (Gs., US$, R$) e a taxa de implantação.
2. `/admin/clientes` → **Novo cliente**: plano, moeda preferida, domínio (opcional), WhatsApp (opcional).
3. O cliente recebe o link da fatura e paga na moeda que quiser.
4. Pagou → o sistema dele é criado sozinho e aparecem as tarefas (configurar, comprar domínio, DNS).
5. Você configura (entra direto no painel dele) e clica **Entregar**: ele recebe os acessos e a 1ª mensalidade.
6. Daí em diante: fatura gerada X dias antes do vencimento, aviso de atraso, suspensão após a tolerância, reativação automática ao pagar.

## Mercado Pago (cobrar em reais)
1. Crie uma aplicação em mercadopago.com.br/developers e copie o **Access Token** (comece pelo de teste).
2. Em Webhooks, cadastre `https://SEU_DOMINIO/api/billing/webhook/mercadopago` (evento Pagamentos) e copie a assinatura secreta.
3. Preencha `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET` e, em `/admin/config`, escolha Mercado Pago para Reais.
> O Mercado Pago não opera no Paraguai: a sua conta brasileira cobra em BRL. Confirme com o Mercado Pago se cartões paraguaios são aceitos.

## Domínios
- **Seu domínio** (ex.: `atlas.com.py`): coloque em `APP_URL` e em `/admin/config`. Com DNS wildcard (`*.atlas.com.py`), cada cliente abre em `slug.atlas.com.py`.
- **Domínio do cliente**: compre (HostGator; `.com.py` no NIC Paraguay), aponte o DNS para o seu servidor, adicione o domínio na hospedagem (Vercel → Domains) e preencha "Domínio próprio" na ficha do cliente.

## Fotos e imagens
- Local: ficam na pasta `.uploads/` e são servidas em `/uploads/...`.
- Vercel: crie um **Blob Store** (Storage → Blob) no projeto; a variável `BLOB_READ_WRITE_TOKEN` é criada sozinha e o sistema passa a salvar lá.

## Deploy (sugestão)
- **App**: Vercel (ou Railway/Render).
- **Banco**: Neon ou Supabase (PostgreSQL). Defina `DATABASE_URL=postgres://...` e rode `npm run db:push` + `npm run db:seed` (opcional).
- Defina `SESSION_SECRET`, `APP_URL` (domínio real — usado nos QR Codes e links de fatura), `PLATFORM_ADMIN_PASSWORD` e `CRON_SECRET`.
- O `vercel.json` já agenda o ciclo de cobrança diário (`/api/cron/billing`).
- Em `/admin/config`, troque os gateways do modo Simulado para os reais.

## Próximos passos
Veja [`docs/ROADMAP.md`](./docs/ROADMAP.md) — inclui prompts prontos para colar no Cursor.


## Paraguai e Brasil
Cada estabelecimento tem um país (PY ou BR). Isso define idioma do site e do painel (espanhol/português), moeda base (Gs./R$), formato de telefone/WhatsApp (PY 9 dígitos · BR DDD + 9 dígitos), documento (RUC/CNPJ) e meios de pagamento padrão (no Brasil: Pix, cartão e dinheiro). A página de vendas abre em português para visitantes do Brasil (troca manual em ES/PT).

Modelos de site: Clássico, Hamburgueria, Restaurante, Cafeteria, Loja, Bar, **Barbearia**, **Informática/Tecnologia** e **Perfumaria/Cosméticos**.
