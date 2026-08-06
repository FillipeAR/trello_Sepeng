import { Resend } from "resend";

/**
 * Adapter de envio via Resend (categoria `messaging` do Marketplace da
 * Vercel). Credenciais via env: `RESEND_API_KEY` — provisionado com
 * `vercel integration add resend` e `vercel env pull`, ou manualmente pelo
 * dashboard da Resend. `EMAIL_FROM` é opcional (endereço remetente
 * verificado no domínio Resend); sem ele cai no domínio de teste deles.
 */

export class EmailSendError extends Error {}

let client: Resend | null = null;

function getClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new EmailSendError("RESEND_API_KEY não configurado.");
  }
  if (!client) client = new Resend(apiKey);
  return client;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const resend = getClient();
  const from = process.env.EMAIL_FROM ?? "ObraFlow <onboarding@resend.dev>";

  const { error } = await resend.emails.send({ from, to, subject, html });
  if (error) {
    throw new EmailSendError(`Falha ao enviar e-mail (${error.name}): ${error.message}`);
  }
}
