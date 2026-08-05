/**
 * Adapter de envio via WhatsApp Business Cloud API (Meta). Não existe
 * integração nativa de WhatsApp no Marketplace da Vercel hoje (só e-mail via
 * Resend) — por isso é uma chamada HTTP direta ao Graph API, sem SDK de
 * terceiro. Credenciais via env: `WHATSAPP_ACCESS_TOKEN` e
 * `WHATSAPP_PHONE_NUMBER_ID` (criados no Meta for Developers).
 */

const GRAPH_API_VERSION = "v21.0";

export class WhatsAppSendError extends Error {}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (!digits) {
    throw new WhatsAppSendError("Telefone inválido.");
  }
  return digits;
}

export async function sendWhatsAppMessage(to: string, title: string, body: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new WhatsAppSendError("WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID não configurados.");
  }

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizePhone(to),
        type: "text",
        text: { body: `*${title}*\n${body}` },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new WhatsAppSendError(`Falha ao enviar WhatsApp (${response.status}): ${detail}`);
  }
}
