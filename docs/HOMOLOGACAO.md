# Homologação (ambiente de teste)

Cada PR gera uma **prévia** na Vercel. Na prévia o sistema entra sozinho em **modo teste**
(`VERCEL_ENV=preview`, regras em `src/core/sandbox.ts`, guarda em `src/lib/sandbox.ts`):

| O quê | Na prévia |
| --- | --- |
| Banco | Só abre um banco **provadamente diferente** do da produção (`PRODUCTION_DB_FINGERPRINT`) |
| Schema e seed no build | Só rodam no banco de teste; se a prévia apontar para a produção, o build para |
| WhatsApp (Evolution e oficial) | Envio vira log (simula sucesso). Criar/conectar/apagar instância ou trocar webhook: bloqueado |
| E-mail (Resend) e WhatsApp genérico | Viram log |
| Push (navegador e Firebase) | Viram log |
| Cobranças | Asaas só com conta **sandbox**; Mercado Pago só com token **TEST-…** |
| Apps de delivery (Open Delivery) | Bloqueados |
| IA (Gemini), CEP, mapas | Funcionam normalmente |
| Faixa amarela "AMBIENTE DE TESTE" | Em todas as telas |

Tarefas agendadas (`vercel.json`) não rodam em prévias.

## Configuração na Vercel (dono do projeto)

1. **Banco de teste**: `DATABASE_URL` marcado **só em Preview**, apontando para outro banco (ex.: um branch do Neon).
2. **`PRODUCTION_DB_FINGERPRINT`** (em Preview): a impressão digital do banco da produção. Ela aparece no log de
   todo build de produção, na linha `impressão digital do banco: …` (16 caracteres, não expõe senha).
   Sem essa variável a prévia compila, mas não abre banco nenhum.
3. **`SANDBOX_ALLOW`** (opcional, em Preview): contatos que podem receber de verdade durante um teste,
   separados por vírgula — `5581999990000,pessoa@empresa.com,push` (`push` = aparelhos do banco de teste).
4. Chaves de cobrança em Preview: só as de teste (Asaas sandbox, Mercado Pago `TEST-…`).

`APP_MODE=sandbox` liga o modo teste fora da Vercel; `APP_MODE=production` nunca é teste.

## Central de Homologação (`/admin/homologacao`)

Painel do dono da plataforma (`services/homolog.ts`, regras em `core/homolog.ts`, GitHub em `adapters/github/client.ts`):

| Função | Como funciona |
| --- | --- |
| Lista | PRs abertos contra o `main` com autor, branch, checks exigidos (padrão: `Testes e tipos` e `Vercel – atlas`) e link da prévia |
| Aprovar e publicar | Confere de novo no GitHub (mesmo commit que você viu, checks verdes, sem conflito), registra a aprovação e faz o merge; a Vercel publica |
| Reprovar | Pede ajustes no PR com o motivo; nada vai para a produção |
| Reverter | Abre um PR que desfaz o último publicado (passa pela mesma aprovação). Em emergência: rollback instantâneo da Vercel |
| Histórico | Tabela `homolog_events` (quem, quando, qual PR, motivo) + registro de atividades |
| Avisos | App do CRM, categoria "Homologação": PR novo, testes concluídos, publicado, ajustes pedidos |
| Ambientes | Branch `teste/<nome>` por colaborador; `/teste/<nome>` abre a prévia mais recente dele |

Configuração (Admin → Homologação, só o administrador principal):
1. **Token do GitHub** fine-grained, só deste repositório: Contents e Pull requests (leitura e escrita); Commit statuses, Checks e Deployments (leitura).
2. **Webhook** no repositório (Settings → Webhooks): URL e segredo mostrados no painel, content type `application/json`, eventos *Pull requests* e *Check suites*.
3. **Proteção do `main`** (GitHub → Settings → Branches): exigir PR, 1 aprovação e o check `Testes e tipos`; sem force push.
4. Um branch `teste/<nome>` por colaborador real (criado a partir do `main`).

Numa prévia (modo teste) o painel não aprova nem publica nada.
