import type { VercelConfig } from "@vercel/config/v1";

/**
 * `crons` roda uma vez por dia (11:00 UTC = 08:00 BRT, início do expediente).
 * Plano Hobby limita cron a 1x/dia por job.
 */
export const config: VercelConfig = {
  crons: [{ path: "/api/cron/sla-check", schedule: "0 11 * * *" }],
};
