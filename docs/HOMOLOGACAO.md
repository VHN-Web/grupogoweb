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
