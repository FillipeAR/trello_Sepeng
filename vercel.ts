import type { VercelConfig } from "@vercel/config/v1";

/**
 * `crons` roda uma vez por dia (11:00 UTC = 08:00 BRT, início do expediente).
 * Planos Hobby limitam cron a 1x/dia — mantém isso funcionando em qualquer
 * plano. Quem quiser detecção mais rápida de SLA vencido (plano Pro+) pode
 * apertar essa frequência.
 */
export const config: VercelConfig = {
  crons: [{ path: "/api/cron/sla-check", schedule: "0 11 * * *" }],
};
