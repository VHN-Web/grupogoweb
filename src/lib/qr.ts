import "server-only";
import QRCode from "qrcode";
import { tenantPublicUrl } from "./urls";

export { appUrl } from "./urls";

export function menuUrl(t: { slug: string; customDomain?: string | null }, tableCode?: string) {
  const base = tenantPublicUrl(t);
  return `${base}${t.customDomain ? "/" : ""}${tableCode ? `?mesa=${tableCode}` : ""}`;
}

export async function qrSvg(url: string) {
  return QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}
