#!/bin/bash
# =============================================================================
# GoWeb · cria o servidor do WhatsApp (Evolution API) no Google Cloud.
# Rode no Cloud Shell (botão >_ no topo do console):
#   curl -fsSL https://goweboficial.com/infra/evolution-gcp.sh | bash
# Cria: IP fixo + liberação das portas 80/443 + VM e2-small (Ubuntu 24.04, 30 GB)
# que se instala sozinha (Evolution + PostgreSQL + Redis + HTTPS). Pode rodar de novo
# sem medo: o que já existe é mantido.
# =============================================================================
set -euo pipefail
NAME=goweb-evolution
REGION=us-east1
ZONE=us-east1-b
DOMAIN=evo.goweboficial.com
SRC=https://goweboficial.com/infra/evolution-cloud-init.yaml

PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [ -z "$PROJECT" ] || [ "$PROJECT" = "(unset)" ]; then
  echo ""
  echo "Nenhum projeto selecionado. Seus projetos:"
  gcloud projects list --format="table(projectId,name)"
  echo ""
  echo "Escolha um e rode de novo assim (troque SEU-PROJETO pelo ID da 1ª coluna):"
  echo "  curl -fsSL https://goweboficial.com/infra/evolution-gcp.sh | PROJECT=SEU-PROJETO bash"
  exit 1
fi
gcloud config set project "$PROJECT" >/dev/null 2>&1
echo "▶ Projeto: $PROJECT"

if ! gcloud beta billing projects describe "$PROJECT" --format="value(billingEnabled)" 2>/dev/null | grep -qi true; then
  echo "⚠ O faturamento (crédito de teste) não parece ligado a este projeto."
  echo "  Console → Faturamento → Vincular conta de faturamento ao projeto $PROJECT. Depois rode de novo."
fi

echo "▶ Ativando o Compute Engine (pode levar 1-2 min na primeira vez)…"
gcloud services enable compute.googleapis.com

echo "▶ Liberando HTTP/HTTPS…"
gcloud compute firewall-rules describe goweb-web >/dev/null 2>&1 || \
  gcloud compute firewall-rules create goweb-web --allow=tcp:80,tcp:443 --target-tags=goweb-web --description="GoWeb Evolution (HTTPS)" --quiet

echo "▶ Reservando IP fixo…"
gcloud compute addresses describe "$NAME-ip" --region="$REGION" >/dev/null 2>&1 || \
  gcloud compute addresses create "$NAME-ip" --region="$REGION" --quiet
IP=$(gcloud compute addresses describe "$NAME-ip" --region="$REGION" --format="value(address)")

if gcloud compute instances describe "$NAME" --zone="$ZONE" >/dev/null 2>&1; then
  echo "▶ A máquina $NAME já existe — mantendo."
else
  echo "▶ Criando a máquina (e2-small, 30 GB)…"
  curl -fsSL "$SRC" -o /tmp/goweb-cloud-init.yaml
  sed -i "s/^      EVO_DOMAIN=.*/      EVO_DOMAIN=$DOMAIN/" /tmp/goweb-cloud-init.yaml
  gcloud compute instances create "$NAME" \
    --zone="$ZONE" --machine-type=e2-small \
    --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
    --boot-disk-size=30GB --boot-disk-type=pd-balanced \
    --tags=goweb-web --address="$IP" \
    --metadata-from-file=user-data=/tmp/goweb-cloud-init.yaml --quiet
fi

cat <<FIM

✅ Pronto! A máquina está se instalando sozinha (uns 10 minutos).

1) Na GoDaddy (DNS de goweboficial.com), crie o registro:
     Tipo: A    Nome: evo    Valor: $IP    TTL: 600

2) Depois de ~10 min, a chave global da Evolution fica disponível. Para ver (só você vê):
     gcloud compute ssh $NAME --zone=$ZONE --command="sudo cat /opt/evolution/CHAVE.txt"
   (na primeira vez ele pergunta sobre uma chave SSH: só aperte Enter)

3) No GoWeb: Admin → Configurações → Geovana
     URL: https://$DOMAIN
     Chave global: a que apareceu no passo 2

IP do servidor: $IP
FIM
