// Configuração da conta principal do Asaas carregada em memória (preenchida a cada leitura das
// configurações da plataforma — services/billing#getSettings e services/asaas#asaasConfig).
// Permite que os adapters síncronos (isConfigured) saibam se o Asaas está pronto.
import type { AsaasEnv } from "@/core/asaas";

let current: { env: AsaasEnv; apiKey: string; walletId: string } | null = null;

export function primeAsaas(v: { env: AsaasEnv; apiKey: string; walletId: string } | null) {
  current = v && v.apiKey ? v : null;
}
export const asaasRuntime = () => current;
