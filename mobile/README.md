# App Android do entregador (APK)

Casco nativo do `/entregador`. **Não duplica nada do sistema**: o app abre as mesmas telas do site num
WebView (mesma sessão `gw_cour`, mesmas Server Actions, mesmas APIs) e acrescenta só o que o navegador
não consegue fazer:

| O quê | Como |
|---|---|
| GPS com o app fechado / tela bloqueada | `LocationService` (serviço em primeiro plano, tipo `location`, aviso fixo com botão **Ficar offline**) → `POST /api/entregador/ping` com o cookie do WebView. Mesma regra do site: 20 m ou 8 s; parado, 20 s. |
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
- Variável `COMMIT_APK=true` (opcional): grava o APK em `public/entregador/entregas.apk`, que é o arquivo baixado em
  `/entregador/baixar`. Sem ela, suba o APK nesse caminho por PR, ou hospede onde quiser e defina `COURIER_APK_URL` no Vercel.

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
