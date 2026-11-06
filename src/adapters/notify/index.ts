// =============================================================================
// PONTO DE EXTENSÃO: Notificações para os seus clientes (e-mail + WhatsApp opcional)
// =============================================================================
// E-mail:
//   RESEND_API_KEY + EMAIL_FROM  -> envia via Resend (https://resend.com)
//   sem chave                   -> apenas registra no log (visível em /admin/clientes/[id])
// WhatsApp (só se o cliente optou):
//   WHATSAPP_WEBHOOK_URL (+ WHATSAPP_WEBHOOK_TOKEN) -> faz POST {to, message} para a sua
//   API de WhatsApp (Evolution API, Z-API, n8n, Meta Cloud API via proxy...). Ajuste o
//   formato do corpo em sendWhatsApp() conforme a API que você usa.
//   sem URL -> apenas registra no log
// =============================================================================

export type SendResult = { status: "SENT" | "LOGGED" | "FAILED"; error?: string };

export async function sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: "LOGGED" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "GoWeb <suporte@goweboficial.com>", to: [to], subject, text }),
    });
    if (!res.ok) return { status: "FAILED", error: `${res.status} ${await res.text()}` };
    return { status: "SENT" };
  } catch (e) {
    return { status: "FAILED", error: String(e) };
  }
}

export async function sendWhatsApp(to: string, message: string): Promise<SendResult> {
  const url = process.env.WHATSAPP_WEBHOOK_URL;
  if (!url) return { status: "LOGGED" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.WHATSAPP_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.WHATSAPP_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify({ to: to.replace(/\D/g, ""), message }),
    });
    if (!res.ok) return { status: "FAILED", error: `${res.status} ${await res.text()}` };
    return { status: "SENT" };
  } catch (e) {
    return { status: "FAILED", error: String(e) };
  }
}
