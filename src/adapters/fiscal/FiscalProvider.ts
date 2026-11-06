// =============================================================================
// PONTO DE EXTENSÃO: Documentos fiscais (factura)
// =============================================================================
// "manual"  -> o estabelecimento registra no painel o número da factura (talonário/timbrado).
// "sifen"   -> Facturación Electrónica (SIFEN/e-Kuatia, DNIT). STUB: exige certificado
//              digital, XML assinado (DE), envio SOAP, KuDE em PDF — intervenção humana.
// =============================================================================
import type { FiscalStatus } from "@/core/types";
import type { FiscalConfig } from "@/core/tenant-config";

export type FiscalIssueInput = {
  tenant: { id: string; name: string; ruc: string | null };
  config: FiscalConfig;
  order: {
    id: string;
    number: string;
    totalPyg: number;
    items: { name: string; quantity: number; unitPricePyg: number }[];
  };
  customer: { ruc?: string | null; name: string };
};

export type FiscalIssueResult = {
  status: FiscalStatus;
  docNumber?: string;
  timbrado?: string;
  cdc?: string;
  /** URL do KuDE (representação gráfica) quando houver */
  kudeUrl?: string;
};

export interface FiscalProvider {
  readonly id: string;
  readonly label: string;
  readonly available: boolean;
  issue(input: FiscalIssueInput): Promise<FiscalIssueResult>;
  cancel?(cdc: string, reason: string): Promise<FiscalStatus>;
}

/** Impostos incluídos no preço (PY): IVA 10% => total/11 ; IVA 5% => total/21 */
export function ivaIncluded(totalPyg: number, rate: 10 | 5): number {
  return Math.round(totalPyg / (rate === 10 ? 11 : 21));
}
