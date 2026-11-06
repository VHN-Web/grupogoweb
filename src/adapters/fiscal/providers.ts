import type { FiscalProvider } from "./FiscalProvider";

export const manualFiscalProvider: FiscalProvider = {
  id: "manual",
  label: "Manual (talonario / registro en el panel)",
  available: true,
  async issue(input) {
    // Apenas cria o registro; o número é preenchido pelo estabelecimento no painel.
    return { status: "REGISTERED", timbrado: input.config.timbrado };
  },
};

// =============================================================================
// STUB — SIFEN (Sistema Integrado de Facturación Electrónica Nacional - DNIT)
// =============================================================================
// Para implementar (intervenção humana obrigatória):
//  - Estabelecimento habilitado como facturador electrónico + timbrado electrónico
//  - Certificado digital (PFX) por tenant, guardado com segurança (KMS/secret manager)
//  - Gerar XML do DE conforme Manual Técnico SIFEN vigente, calcular CDC (44 dígitos),
//    assinar (XMLDSig), enviar via web service (recepción síncrona/lote) em ambiente test/prod
//  - Gerar KuDE (PDF com QR) e guardar; tratar eventos (cancelación, inutilización)
//  - Considerar libs/serviços prontos (ex: facturadores intermediários) em vez de fazer do zero
// =============================================================================
export const sifenFiscalProvider: FiscalProvider = {
  id: "sifen",
  label: "SIFEN — Factura electrónica (próximamente)",
  available: false,
  async issue() {
    throw new Error("[sifen] ainda não implementado — ver src/adapters/fiscal/providers.ts");
  },
};

const providers = [manualFiscalProvider, sifenFiscalProvider];
export function getFiscalProvider(id: string): FiscalProvider {
  return providers.find((p) => p.id === id) ?? manualFiscalProvider;
}
export function listFiscalProviders() {
  return providers;
}
