import { prisma } from "@/server/db";
import { DOMAIN_EVENTS } from "@/server/outbox";

/**
 * Worker do outbox. Hoje entrega apenas notificação in-app; e-mail e WhatsApp
 * entram como novos `channels` aqui, sem tocar no engine nem nos comandos.
 */

interface EventPayload {
  projectId: string;
  projectName: string;
  projectCode: string;
  stageId?: string | null;
  stageName?: string | null;
  fromStageName?: string | null;
  departmentId?: string | null;
  displayStatus?: string;
  actorName?: string;
}

function describe(type: string, p: EventPayload): { title: string; body: string } {
  switch (type) {
    case DOMAIN_EVENTS.PROJECT_CREATED:
      return {
        title: `Nova obra: ${p.projectName}`,
        body: `${p.projectCode} foi cadastrada e está em "${p.displayStatus}".`,
      };
    case DOMAIN_EVENTS.STAGE_ENTERED:
      return {
        title: `${p.projectName} chegou em ${p.stageName}`,
        body: `${p.actorName ?? "Um usuário"} concluiu ${p.fromStageName}. Status: "${p.displayStatus}".`,
      };
    case DOMAIN_EVENTS.STAGE_RETURNED:
      return {
        title: `${p.projectName} foi devolvida para ${p.stageName}`,
        body: `${p.actorName ?? "Um usuário"} devolveu a obra a partir de ${p.fromStageName}.`,
      };
    case DOMAIN_EVENTS.PROJECT_REJECTED:
      return {
        title: `${p.projectName} foi reprovada`,
        body: `Reprovação registrada em ${p.fromStageName} por ${p.actorName ?? "um usuário"}.`,
      };
    case DOMAIN_EVENTS.PROJECT_FINISHED:
      return {
        title: `${p.projectName} foi finalizada`,
        body: `A obra ${p.projectCode} concluiu o fluxo completo.`,
      };
    default:
      return {
        title: p.projectName,
        body: `Evento ${type} registrado.`,
      };
  }
}

/** Quem precisa saber: o departamento que recebeu a obra e a equipe alocada. */
async function resolveRecipients(
  organizationId: string,
  payload: EventPayload,
): Promise<string[]> {
  const recipients = new Set<string>();

  if (payload.departmentId) {
    const members = await prisma.membership.findMany({
      where: { organizationId, departmentId: payload.departmentId, isActive: true },
      select: { userId: true },
    });
    for (const m of members) recipients.add(m.userId);
  }

  const team = await prisma.projectTeamAssignment.findMany({
    where: { projectId: payload.projectId },
    select: { userId: true },
  });
  for (const t of team) recipients.add(t.userId);

  return [...recipients];
}

export async function processOutbox(limit = 50): Promise<number> {
  const events = await prisma.outboxEvent.findMany({
    where: { status: "PENDING", availableAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let processed = 0;

  for (const event of events) {
    try {
      const payload = event.payload as unknown as EventPayload;
      const recipients = await resolveRecipients(event.organizationId, payload);
      const { title, body } = describe(event.type, payload);

      if (recipients.length > 0) {
        await prisma.notification.createMany({
          data: recipients.map((userId) => ({
            organizationId: event.organizationId,
            userId,
            type: event.type,
            title,
            body,
            linkUrl: `/obras/${payload.projectId}`,
          })),
        });
      }

      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: "DONE", processedAt: new Date(), attempts: { increment: 1 } },
      });
      processed += 1;
    } catch (error) {
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: event.attempts >= 4 ? "FAILED" : "PENDING",
          attempts: { increment: 1 },
          error: error instanceof Error ? error.message : String(error),
          // Backoff exponencial simples.
          availableAt: new Date(Date.now() + 2 ** event.attempts * 60_000),
        },
      });
    }
  }

  return processed;
}
