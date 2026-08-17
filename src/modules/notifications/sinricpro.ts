/**
 * Adapter pra disparar a rotina da Alexa do escritório via SinricPro:
 * ObraFlow reporta o estado "On" de um dispositivo virtual (Switch)
 * cadastrado no SinricPro — a rotina da Alexa (configurada no app Alexa,
 * fora deste repositório: "quando o dispositivo liga, faça X") dispara a
 * partir desse evento. Credenciais via env: `SINRICPRO_API_KEY` e
 * `SINRICPRO_DEVICE_ID` (id do dispositivo virtual no dashboard SinricPro).
 *
 * Sem SDK oficial pra Node — duas chamadas HTTP diretas, mesmo padrão do
 * adapter de WhatsApp: autentica (troca a API key por um access token de
 * curta duração, 7 dias) e então aciona a ação do dispositivo. Como o
 * evento "obra ganha" é raro, autentica de novo a cada disparo em vez de
 * cachear o token entre invocações serverless — mais simples, sem risco de
 * token expirado silenciosamente.
 */

export class SinricProTriggerError extends Error {}

async function getAccessToken(apiKey: string): Promise<string> {
  const response = await fetch("https://api.sinric.pro/api/v1/auth", {
    method: "POST",
    headers: {
      "x-sinric-api-key": apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ client_id: "obraflow" }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new SinricProTriggerError(`Falha ao autenticar no SinricPro (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as { accessToken?: string };
  if (!data.accessToken) {
    throw new SinricProTriggerError("SinricPro não retornou accessToken.");
  }
  return data.accessToken;
}

/** Liga o dispositivo virtual — a rotina da Alexa é quem decide o que fazer a partir daí. */
export async function triggerObraGanhaRoutine(): Promise<void> {
  const apiKey = process.env.SINRICPRO_API_KEY;
  const deviceId = process.env.SINRICPRO_DEVICE_ID;
  if (!apiKey || !deviceId) {
    throw new SinricProTriggerError("SINRICPRO_API_KEY/SINRICPRO_DEVICE_ID não configurados.");
  }

  const accessToken = await getAccessToken(apiKey);

  const query = new URLSearchParams({
    clientId: "obraflow",
    type: "request",
    createdAt: String(Date.now()),
    action: "setPowerState",
    value: JSON.stringify({ state: "On" }),
  });

  const response = await fetch(`https://api.sinric.pro/api/v1/devices/${deviceId}/action?${query}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new SinricProTriggerError(`Falha ao acionar dispositivo SinricPro (${response.status}): ${detail}`);
  }
}
