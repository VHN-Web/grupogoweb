# Roadmap + prompts para o Cursor

Cada etapa abaixo tem um prompt pronto. Abra o projeto no Cursor, use o modo Agent (com Claude) e cole o prompt.
O arquivo `CLAUDE.md` / `.cursor/rules/menupy.mdc` já ensina a arquitetura para a IA. Faça **uma etapa por vez**,
rode `npm test && npm run typecheck` e teste no navegador antes de seguir.

Legenda: 🤖 a IA resolve sozinha · 🧑 exige intervenção humana (contrato, credenciais, homologação)

---

## Fase 1 — Deixar pronto para o primeiro cliente piloto

### 1.1 🤖 Upload de imagens (logo e produtos)
> Crie um `StorageProvider` em `src/adapters/storage/` (interface + implementação local em `public/uploads` para dev e uma para Cloudflare R2/S3 via env). Troque os campos "URL da foto" e "URL do logo" do painel por upload com preview, redimensionando para no máximo 800px (use sharp no servidor). Siga as regras do CLAUDE.md.

### 1.2 🤖 Usuários e papéis no painel
> Substitua a senha única por tenant por uma tabela `staff_users` (nome, email/telefone, senha, papel: OWNER | CASHIER | KITCHEN). OWNER acessa tudo; CASHIER: pedidos e caixa; KITCHEN: só a tela de pedidos (modo cozinha em tela cheia, letras grandes). Adapte `requireTenantAdmin` para `requireRole(slug, roles[])`. Mantenha compatibilidade com o tenant demo.

### 1.3 🤖 Alerta sonoro de pedido novo
> Na tela de pedidos do painel, toque um som e mostre notificação do navegador quando chegar pedido novo (compare ids entre refreshes no client). Botão para ativar o som (navegadores exigem interação).

### 1.4 🤖 Adicionais e observações por produto
> Adicione grupos de adicionais/variações (ex: "Punto de la carne", "Extras +Gs. 5.000") com mínimo/máximo de escolhas. Snapshot dos adicionais no `order_items`. Preço recalculado no servidor. Atualize cardápio, carrinho, comprovante e painel.

### 1.5 🤖 Rate limit e segurança básica
> Adicione rate limit (por IP + slug) no login do painel, no /admin e em POST /api/orders. Adicione headers de segurança no next.config. Valide tamanho de payloads.

### 1.6 🧑🤖 Domínio e subdomínios
> Suporte a `{slug}.atlas.com.py` além de `/slug` via middleware do Next que reescreve o host para a rota `[slug]`. Campo opcional `customDomain` no tenant.
(Humano: comprar domínio, configurar DNS wildcard na Vercel.)

---

## Fase 1.5 — Cobrança dos seus clientes (plataforma)

### 1.5.1 🧑 Mercado Pago em produção
Já implementado (`src/adapters/billing/mercadopago.ts`). Falta: criar a aplicação, testar com credenciais de **teste** (Pix e cartão de teste), configurar o webhook e trocar BRL para "Mercado Pago" em /admin/config.

### 1.5.2 🧑🤖 PayPal (US$)
> Implemente `paypalBillingProvider` em `src/adapters/billing/others.ts` seguindo os passos do comentário (Orders API v2 + captura no retorno + webhook PAYMENT.CAPTURE.COMPLETED com verificação de assinatura). Adicione rota de retorno que captura a ordem. Escreva testes.
(Humano: conta PayPal Business, credenciais sandbox, confirmar recebimento de pagadores do Paraguai.)

### 1.5.3 🧑🤖 Pagopar (Gs.) para a sua cobrança
Quando tiver RUC/sócio no Paraguai: implemente `pagoparBillingProvider` (mesmo fluxo do adapter de pagamentos dos restaurantes).

### 1.5.4 🤖 Página pública de planos + contratação self-service
> Crie `/planes` (espanhol) listando os planos ativos com preço nas 3 moedas e um formulário de contratação que chama `createCustomer`. Proteja com captcha/rate limit. O admin recebe notificação de novo cliente.

### 1.5.5 🤖 Automação de domínio na Vercel
> Ao salvar "Domínio próprio" no admin, chame a API da Vercel (POST /v10/projects/{id}/domains) para adicionar o domínio e mostre o status de verificação/DNS na ficha do cliente. Env: VERCEL_TOKEN, VERCEL_PROJECT_ID.
(Compra do domínio continua manual — a HostGator não oferece API pública de registro, até onde sabemos.)

### 1.5.6 🤖 Notas fiscais da sua empresa
Se você faturar pelo Brasil (MEI/ME), integrar emissão de NFS-e (ex.: via Asaas, eNotas, NFE.io) quando a fatura for paga.

---

## Fase 2 — Pagamentos reais (🧑 intervenção humana obrigatória)

Antes: abrir conta/contrato com o gateway, obter credenciais de **staging**, ler a documentação oficial.

### 2.1 Bancard vPOS
> Implemente `src/adapters/payments/bancard.ts` seguindo a interface `PaymentProvider` e os TODOs do arquivo. Crie tabela `payment_attempts` (id numérico sequencial = shop_process_id, orderId, provider, status, payload). Use as credenciais de `tenant.paymentConfig.credentials.bancard`. Adicione campos de credenciais na tela de configuração (somente OWNER, nunca exibir a chave privada depois de salva). Escreva testes do cálculo de token. Use `mock-online.ts` como referência de fluxo. Documentação oficial: [colar o link/PDF que o Bancard enviar].

### 2.2 Pagopar
> Mesmo processo para `pagopar.ts`. [colar documentação]

### 2.3 Pix automático (turistas brasileiros)
> Novo adapter `pix_psp` usando [Efí / Mercado Pago BR / Asaas — escolher] para gerar QR Pix dinâmico em BRL e confirmar via webhook.
(Humano: conta PJ/PSP no Brasil — avaliar viabilidade fiscal de receber em BRL.)

---

## Fase 3 — Fiscal (🧑 obrigatória)

### 3.1 SIFEN — factura electrónica
Recomendação: integrar com um **facturador intermediário homologado** (API pronta) em vez de assinar XML do zero.
> Implemente `sifen` em `src/adapters/fiscal/providers.ts` usando a API do [provedor escolhido]. Ao emitir: guardar CDC, status e URL do KuDE. Tratar rejeição e cancelamento (evento). Taxa de IVA por produto (10/5/exento) — adicionar coluna em `products`.
(Humano: timbrado electrónico, certificado digital por cliente, contrato com o provedor, testes em ambiente de homologação da DNIT.)

---

## Fase 4 — Crescimento

- 🤖 Relatórios: vendas por dia/produto/meio de pagamento, exportar CSV/Excel.
- 🤖 Offline/PWA no painel: fila local de pedidos de balcão quando cair a internet (IndexedDB + sync).
- 🤖 Tempo real com SSE no lugar do polling.
- 🤖 i18n (es / pt / guaraní básico no cardápio).
- 🤖 Upgrade/downgrade de plano com cálculo proporcional; trial gratuito.
- 🤖 Integração WhatsApp: enviar status do pedido ao cliente.
- 🧑 Impressora térmica de cozinha (QZ Tray ou app ponte local).

---

## Checklist antes de vender
- [ ] `SESSION_SECRET` forte, `PLATFORM_ADMIN_PASSWORD` forte, `CRON_SECRET`, `ENABLE_MOCK_GATEWAY=false`
- [ ] Gateways reais em /admin/config (nenhuma moeda em "Simulado")
- [ ] RESEND_API_KEY configurada e domínio de e-mail verificado (senão as mensagens só ficam registradas)
- [ ] Banco PostgreSQL gerenciado com backup diário
- [ ] Termos de uso / política de privacidade (espanhol)
- [ ] Teste com 1 restaurante piloto por 2 semanas antes de abrir vendas
