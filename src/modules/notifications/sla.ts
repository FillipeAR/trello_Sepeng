import { prisma } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { DOMAIN_EVENTS, enqueueEvent } from "@/server/outbox";

/**
 * Varre etapas ativas com prazo vencido e ainda não sinalizadas, marca
 * `slaBreached` e enfileira o evento de escalonamento. Chamado pelo cron em
 * `/api/cron/sla-check` — não é um comando de usuário, não existe "ator"
 * (auditoria grava `actorId: null`). Idempotente: `slaBreached: false` no
 * filtro garante que cada etapa só gera um evento, mesmo rodando todo dia.
 */
export async function checkSlaBreaches(): Promise<number> {
  const now = new Date();

  const overdue = await prisma.stageInstance.findMany({
    where: {
      status: { in: ["PENDING", "IN_PROGRESS"] },
      dueAt: { lt: now },
      slaBreached: false,
    },
    include: {
      stage: true,
      project: { select: { id: true, name: true, code: true, organizationId: true } },
    },
  });

  let breached = 0;

  for (const instance of overdue) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.stageInstance.updateMany({
        where: { id: instance.id, slaBreached: false },
        data: { slaBreached: true },
      });
      if (updated.count === 0) return; // outra execução já sinalizou esta etapa

      await writeAudit(tx, {
        organizationId: instance.project.organizationId,
        actorId: null,
        action: "stage.sla_breached",
        entityType: "StageInstance",
        entityId: instance.id,
        summary: `SLA vencido: "${instance.stage.name}" na obra ${instance.project.code}.`,
      });

      await enqueueEvent(tx, {
        organizationId: instance.project.organizationId,
        type: DOMAIN_EVENTS.SLA_BREACHED,
        payload: {
          projectId: instance.project.id,
          projectName: instance.project.name,
          projectCode: instance.project.code,
          stageId: instance.stage.id,
          stageName: instance.stage.name,
          departmentId: instance.stage.departmentId,
          displayStatus: instance.stage.displayStatus,
          dueAt: instance.dueAt ? instance.dueAt.toISOString() : null,
        },
        idempotencyKey: `sla.breached:${instance.id}`,
      });
    });
    breached += 1;
  }

  return breached;
}
