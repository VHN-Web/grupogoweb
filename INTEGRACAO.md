# Integração: idiomas (pt-BR / es / en) e CEP automático

O zip enviado tinha só os arquivos do app do entregador (sem `layout.tsx` raiz, `ctx.ts`, checkout, painel, admin).
Tudo que dependia desses arquivos foi feito como módulo pronto + os passos abaixo (cada um é uma troca pequena).

## 1) Seletor de idioma em todas as páginas

**Já aplicado neste zip:** `/entregador` (cabeçalho do app), `/entregador/entrar`, `/entregador/baixar`, página offline do app Android (`mobile/www/index.html`).

**Falta (arquivos que não vieram no zip):**

1. `src/app/layout.tsx` (raiz) — liga o botão em TODAS as páginas (site, loja, painel, admin, afiliados, CRM) e define `<html lang>`:
   ```tsx
   import { getLocale } from "@/lib/i18n-server";
   import { GlobalLanguageSwitcher } from "@/components/i18n/GlobalLanguageSwitcher";
   // dentro do componente (async):
   const locale = await getLocale();
   // <html lang={locale} ...>   e, dentro do <body>, depois de {children}:
   <GlobalLanguageSwitcher locale={locale} />
   ```
   O botão flutua no canto inferior esquerdo. Se preferir dentro do cabeçalho de alguma área, use
   `<LanguageSwitcher locale={locale} />` (variante inline) no cabeçalho dela e acrescente o caminho em `HIDE` de `GlobalLanguageSwitcher.tsx`.

2. `src/app/entregador/ctx.ts(x)` — faça o `T` e o `locale` do app seguirem o seletor (hoje seguem `tenant.country`):
   ```ts
   import { getLocale } from "@/lib/i18n-server";
   import { makeT, legacyLang } from "@/lib/i18n";
   const locale = await getLocale();     // "pt-BR" | "es" | "en"
   const T = makeT(locale);              // T(es, pt, en?) — sem 3º arg usa src/lib/i18n-en.ts
   // passe locale em `shell` (CourierShell aceita "pt-BR" | "es" | "en"); para código antigo que só aceita es|pt use legacyLang(locale)
   ```
3. `tr(locale)` (`src/core/region.ts`) e `panelI18n(t)` (`src/lib/panel-i18n.ts`) — mesma troca: o idioma vem de `getLocale()` e o `T` de `makeT(locale)`.
   Assim painel do lojista, admin e loja ganham o seletor funcionando sem editar cada tela.
   - Padrão agora é **pt-BR** para todo mundo (inclusive lojas do Paraguai). Para manter `es` como padrão nas lojas PY, use `getLocale(tenant.country === "PY" ? "es" : "pt-BR")`.
4. **Inglês:** cada texto sem tradução cai no português. Para traduzir uma tela sem editá-la, acrescente `"texto em português": "English"` em `src/lib/i18n-en.ts` (o app do entregador já está todo traduzido); para textos com variáveis use o 3º argumento: `T(es, pt, en)`.
5. Páginas com texto fixo bilíngue "pt · es" (ex.: login do admin, vendas) devem passar a usar `pick(locale, {pt, es, en})` como em `entregador/entrar/page.tsx`.
6. `manifest.webmanifest` do entregador: coloque `"lang": "pt-BR"`.

**App Android:** abre `/entregador`, então herda tudo acima. Sem escolha prévia o cookie não existe → português do Brasil (o Accept-Language do aparelho é ignorado de propósito). Ao trocar, a escolha fica salva por 1 ano.

## 2) CEP automático no checkout

Componente pronto: `src/components/forms/AddressFields.tsx` (+ `src/lib/cep.ts`, com testes em `cep.test.ts`).
No formulário do checkout (só para lojas com `country === "BR"`; Paraguai continua com o campo atual), troque o campo único de endereço por:
```tsx
<AddressFields locale={locale} onChange={(v, full) => /* opcional */} />
```
Campos enviados: `cep`, `number`, `complement`, `street`, `neighborhood`, `city`, `state` + `address` (texto completo,
ex.: "Avenida Paulista, 1000 - Bela Vista - São Paulo - SP, 01310-100"), então a Server Action/`/api/orders` atual
continua funcionando se ela já lê `address`. Nomes diferentes: prop `names={{ number: "numero", ... }}`; pré-preenchimento: `defaultValue`.

- CEP com máscara; ao completar 8 dígitos busca ViaCEP → (se falhar) BrasilAPI, preenche rua/bairro/cidade/UF e leva o cursor ao **Número**. Tudo segue editável; CEP inexistente ou sem internet mostra aviso e deixa digitar à mão; "Sem número" grava S/N.
- Regra do projeto: **valide de novo no servidor** (`isValidCep`, `onlyDigits` em `lib/cep.ts`) e continue recalculando taxa/distância lá — o navegador não é confiável.
- A CSP atual (`connect-src 'self' https:`) já permite as duas APIs.
