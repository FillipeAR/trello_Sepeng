import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";
import { describe, type EventPayload } from "@/core/notifications/describe";
import { canActorReadProject } from "./queries";

export interface ProjectActivityItem {
  id: string;
  type: string;
  title: string;
  body: string;
  actorName: string | null;
  createdAt: Date;
}

/**
 * Feed de atualizações automáticas da obra: narra todo evento de domínio
 * registrado pra ela (avanço de etapa, lembrete, SLA vencido, medição etc.),
 * não só o que `resolveRecipients` decidiu notificar. Mesmo gate de acesso da
 * página da obra (`canActorReadProject`) — quem lê a obra vê o histórico
 * completo, cross-departamento, sem depender de quem foi "notificado" no
 * envio original.
 */
export async function listProjectActivity(
  actor: SessionContext,
  projectId: string,
): Promise<ProjectActivityItem[] | null> {
  const allowed = await canActorReadProject(actor, projectId);
  if (!allowed) return null;

  const events = await prisma.outboxEvent.findMany({
    where: { organizationId: actor.organizationId, projectId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return events.map((event) => {
    const payload = event.payload as unknown as EventPayload;
    const { title, body } = describe(event.type, payload);
    return {
      id: event.id,
      type: event.type,
      title,
      body,
      actorName: payload.actorName ?? null,
      createdAt: event.createdAt,
    };
  });
}
