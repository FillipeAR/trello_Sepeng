import { prisma } from "@/server/db";

/**
 * Rate limiting de login direto no Postgres — sem Redis/serviço externo. Janela
 * deslizante de `WINDOW_MINUTES`: `EMAIL_LIMIT` falhas na mesma conta ou
 * `IP_LIMIT` falhas na mesma origem (mais frouxo — um escritório inteiro pode
 * compartilhar IP/NAT) bloqueiam login novo até a janela passar.
 */

const WINDOW_MINUTES = 15;
const EMAIL_LIMIT = 5;
const IP_LIMIT = 20;

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterMinutes: number };

export async function checkLoginRateLimit(email: string, ip: string | null): Promise<RateLimitDecision> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);

  const emailFailures = await prisma.loginAttempt.count({
    where: { email, success: false, createdAt: { gte: since } },
  });
  if (emailFailures >= EMAIL_LIMIT) {
    return { allowed: false, retryAfterMinutes: WINDOW_MINUTES };
  }

  if (ip) {
    const ipFailures = await prisma.loginAttempt.count({
      where: { ip, success: false, createdAt: { gte: since } },
    });
    if (ipFailures >= IP_LIMIT) {
      return { allowed: false, retryAfterMinutes: WINDOW_MINUTES };
    }
  }

  return { allowed: true };
}

export async function recordLoginAttempt(email: string, ip: string | null, success: boolean): Promise<void> {
  await prisma.loginAttempt.create({ data: { email, ip, success } });
}
