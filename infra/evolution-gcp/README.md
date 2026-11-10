# Evolution API no Google Cloud

Os arquivos ficam em `public/infra/` para poderem ser baixados no Cloud Shell:

```
curl -fsSL https://goweboficial.com/infra/evolution-gcp.sh | bash
```

- `public/infra/evolution-gcp.sh` — cria IP fixo, regra de firewall 80/443 e a VM e2-small (us-east1-b, Ubuntu 24.04, 30 GB) com o cloud-init.
- `public/infra/evolution-cloud-init.yaml` — instala Evolution API + PostgreSQL + Redis + Caddy (HTTPS). Segredos gerados na própria VM (`/opt/evolution/CHAVE.txt`); nada sensível nesses arquivos.
- Depois: registro A `evo` → IP na GoDaddy; chave em Admin → Configurações → Geovana.
