import type { VercelConfig } from "@vercel/config/v1";

/**
 * `crons` roda uma vez por dia (11:00 UTC = 08:00 BRT, início do expediente).
 * Planos Hobby limitam cron a 1x/dia por job **e a no máximo 2 jobs por
 * projeto** — sla-check + document-check já usa os dois. Quem quiser
 * detecção mais rápida (SLA ou documento vencendo) precisa de plano Pro+.
 */
export const config: VercelConfig = {
  crons: [
    { path: "/api/cron/sla-check", schedule: "0 11 * * *" },
    { path: "/api/cron/document-check", schedule: "5 11 * * *" },
  ],
};
