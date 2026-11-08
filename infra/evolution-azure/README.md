# Servidor do WhatsApp (Evolution API) na Azure

Servidor usado pela Geovana para conectar o WhatsApp das lojas pelo QR Code.
Tudo sobe sozinho com `cloud-init.yaml`: Evolution API v2 + PostgreSQL + Redis + Caddy (HTTPS automático).

## 1. Criar a máquina (portal.azure.com → Máquinas virtuais → Criar)
| Campo | Valor |
|---|---|
| Grupo de recursos | `goweb` (novo) |
| Nome | `goweb-whatsapp` |
| Região | Brazil South (IP brasileiro para as sessões do WhatsApp) |
| Imagem | Ubuntu Server 24.04 LTS – x64 Gen2 |
| Tamanho | **Standard_B2s** (2 vCPU, 4 GB) — aguenta dezenas de lojas |
| Autenticação | Chave pública SSH (gerar novo par; guarde o .pem) |
| Portas de entrada | HTTP (80) e HTTPS (443). SSH (22) opcional |
| Disco | SSD Standard, 30 GB |
| Avançado → Dados personalizados | colar **todo** o `cloud-init.yaml` |

## 2. Fixar o IP
Recurso do IP público da VM → Configuração → Atribuição **Estático** → Salvar.

## 3. DNS (GoDaddy, onde está o goweboficial.com)
Meus produtos → DNS → Adicionar registro: Tipo **A**, Nome **evo**, Valor **IP da VM**, TTL 1/2 hora.
O Caddy emite o certificado HTTPS sozinho assim que o DNS propagar (alguns minutos).

## 4. Pegar a chave global
VM → Operações → **Executar comando** → RunShellScript:
```
cat /opt/evolution/CHAVE.txt
```
Não envie a chave por chat/e-mail.

## 5. Conectar na GoWeb
Admin → Configurações → Geovana: URL `https://evo.goweboficial.com` + chave global → Conectar.

## Manutenção
- Atualizar a Evolution: Executar comando → `cd /opt/evolution && sed -i 's/v2.3.7/vX.Y.Z/' docker-compose.yml && docker compose --env-file .env pull && docker compose --env-file .env up -d`
- Ver se está rodando: `cd /opt/evolution && docker compose ps`
- Backup: VM → Backup (Azure Backup, diário) — as sessões do WhatsApp ficam nos volumes do Docker.
- Custo de referência (Brazil South, sob demanda): B2s ≈ US$ 49/mês + disco e IP (poucos dólares).
