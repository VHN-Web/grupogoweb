// Ponte com os apps Android (mobile/android: entregador e CRM). Dentro do app o WebView expõe `window.AtlasApp`;
// no navegador comum ela não existe e as telas seguem como PWA. Só use em componentes de cliente.

export type NativeStatus = {
  tracking: boolean;
  permission: "granted" | "denied" | "prompt";
  lastSentAt: number;
  accuracy: number;
  sig: string;
  error: string;
  notifications: boolean;
  battery: boolean;
  push: boolean;
  version: string;
  /** "Aparecer sobre outros apps": a corrida abre por cima de qualquer app */
  overlay?: boolean;
  /** Android 14+: tela cheia com o celular bloqueado */
  fullScreen?: boolean;
};

type Bridge = {
  version(): string;
  status(): string;
  startTracking(): void;
  stopTracking(): void;
  openAppSettings(): void;
  requestNotifications(): void;
  requestBatteryExemption(): void;
  requestOverlay?(): void;
  requestFullScreen?(): void;
  /** app do CRM */
  app?(): string;
  openChannelSettings?(category: string): void;
  syncNow?(): void;
  /** app do CRM: "ilha ao vivo" vira notificação em andamento com cronômetro ("" = some) */
  setLive?(json: string): void;
  /** app do entregador: idioma dos textos nativos */
  setLang?(lang: string): void;
  beforeLogout(): void;
};

export function nativeApp(): Bridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { AtlasApp?: Bridge }).AtlasApp;
  return b && typeof b.status === "function" ? b : null;
}

export function nativeStatus(): NativeStatus | null {
  const b = nativeApp();
  if (!b) return null;
  try {
    return JSON.parse(b.status()) as NativeStatus;
  } catch {
    return null;
  }
}
