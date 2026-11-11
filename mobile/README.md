# Apps Android (APK): entregador e CRM

Dois módulos no mesmo projeto Gradle (`mobile/android`):

- `app/` — **Entregas GoWeb** (`com.goweboficial.entregador`), abre `/entregador`. Detalhes abaixo.
- `crm/` — **GoWeb CRM** (`com.goweboficial.crm`), abre `/crm` com o login do admin (e-mail e senha). Tem:
  - um canal de notificação por tipo de aviso (vendas, suporte, leads, retornos, demos, WhatsApp, afiliados, acessos): cada sócio escolhe som/vibração em CRM → App e notificações;
  - avisos na hora pelo Firebase (se o `google-services.json` tiver o app `com.goweboficial.crm`) e, sempre, uma conferência a cada 15 min (`SyncWorker` → `/api/crm/app`) que respeita as preferências de cada sócio;
  - widgets **Hoje no CRM** (retornos, leads novos, contatos/meta, demos, avisos não lidos) e **Acessos** (site oficial, página e links de afiliados hoje × ontem);
  - download do CSV com a sessão do app e envio de arquivos.
  - APK publicado em Releases → `crm-latest` (link em CRM → App e notificações).

## App do entregador

Casco nativo do `/entregador`. **Não duplica nada do sistema**: o app abre as mesmas telas do site num
WebView (mesma sessão `gw_cour`, mesmas Server Actions, mesmas APIs) e acrescenta só o que o navegador
não consegue fazer:

| O quê | Como |
|---|---|
| GPS com o app fechado / tela bloqueada | `LocationService` (serviço em primeiro plano, tipo `location`, aviso fixo com botão **Ficar offline**) → `POST /api/entregador/ping` com o cookie do WebView. Mesma regra do site: 20 m ou 8 s; parado, 20 s. |
| **Corrida em tela cheia** (estilo iFood) | `IncomingActivity`: abre por cima de qualquer app (permissão "Sobrepor a outros apps", pedida na tela inicial do app) ou pela notificação de tela cheia com o celular bloqueado. Toca e vibra por 30 s; Aceitar/Recusar → `/api/entregador/oferta`. Sem resposta numa atribuição automática → recusa e passa ao próximo. |
| Avisos com o motoboy **online** (sem configurar nada) | A resposta do ping traz `mine`/`open`; o serviço compara e mostra "Nova entrega #N" / "Entrega disponível #N". |
| Avisos com o app fechado e o motoboy **offline** | Firebase Cloud Messaging (opcional): o app registra o token em `/api/entregador/push`; o servidor envia por `src/adapters/push/fcm.ts` dentro do mesmo `sendPush` do PWA. |
| Entrar | Link de acesso abre direto no app (App Links + `/.well-known/assetlinks.json`), botão **Abrir no app** (`/entregador/abrir-app` → `gowebentregador://acesso/<token>`) ou colar o link na tela de entrada. |

A ponte JS é `window.AtlasApp` (`AtlasBridge.java` ↔ `src/lib/native-bridge.ts`). O WebView se identifica com
`GoWebEntregador/<versão>` no User-Agent (`isCourierNativeUA`), e as telas trocam textos/comportamento sozinhas.

## Gerar o APK (GitHub Actions — não precisa instalar nada)

O workflow `.github/workflows/android-apk.yml` roda em todo PR/push que mexe em `mobile/android/`
(e manualmente em **Actions → App do entregador → Run workflow**).

- **PR**: o APK fica em *Artifacts* da execução (`entregas-apk`).
- **main/manual**: publica também em **Releases → entregador-latest**.
- O botão de `/entregador/baixar` aponta para esse APK do Releases (repositório público). Para usar outro endereço,
  defina `COURIER_APK_URL` no Vercel.

### Secrets (Settings → Secrets and variables → Actions)

| Nome | Para quê |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Chave de assinatura (arquivo `.jks` em base64). **Sempre a mesma**: senão o Android não aceita atualizar o app. |
| `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` | Senhas/apelido da chave. |
| `GOOGLE_SERVICES_JSON` (opcional) | Conteúdo do `google-services.json` do Firebase (app Android `com.goweboficial.entregador`). |

Variável `ATLAS_URL` (opcional): endereço do site. Padrão `https://goweboficial.com`.

Gerar outra chave (se precisar): `keytool -genkeypair -keystore entregador-release.jks -alias entregador -keyalg RSA -keysize 2048 -validity 10950`
e coloque a impressão SHA-256 dela em `ANDROID_CERT_SHA256` no Vercel (App Links).

## Firebase (opcional, para avisos com o motoboy offline)

1. console.firebase.google.com → criar projeto → adicionar app **Android** com o pacote `com.goweboficial.entregador`.
2. Baixar o `google-services.json` → colar o conteúdo no secret `GOOGLE_SERVICES_JSON`.
3. Configurações do projeto → Contas de serviço → **Gerar nova chave privada** → colar o JSON (ou em base64) em
   `FCM_SERVICE_ACCOUNT` nas variáveis de ambiente do Vercel.

Sem isso tudo funciona, mas os avisos nativos só chegam enquanto o motoboy está online.

## Rodar no Android Studio

Abra a pasta `mobile/android`. Para apontar para outro servidor: `gradle assembleDebug -PatlasUrl=https://seu-preview.vercel.app`
(precisa ser HTTPS).
