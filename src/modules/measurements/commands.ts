import { z } from "zod";
import { canReadProject, hasPermission } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import type { SessionContext } from "@/server/actor";
import { prisma, type Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { DOMAIN_EVENTS, enqueueEvent } from "@/server/outbox";
import { CommandError } from "@/modules/projects/commands";

/**
 * Medição periódica (orçamento vs. custo real): previsto x executado por
 * período de referência, com aprovação. Não depende de etapa do fluxo — a
 * competência é a unidade, não a etapa (o fluxo é dado e configurável por
 * organização). Autorização é a mesma leitura de obra (`canReadProject`) +
 * a permissão transversal `measurement:manage`, dada hoje a Diretoria e
 * Financeiro em `DEFAULT_ROLES`.
 */

function requireManage(actor: SessionContext) {
  if (!hasPermission(actor, PERMISSIONS.MEASUREMENT_MANAGE)) {
    throw new CommandError("Você não tem permissão para gerenciar medições.", {
      errors: ["Permissão measurement:manage ausente."],
    });
  }
}

async function getReadableProject(tx: Tx, actor: SessionContext, projectId: string) {
  const project = await tx.project.findFirst({
    where: { id: projectId, organizationId: actor.organizationId, deletedAt: null },
    include: {
      team: { select: { userId: true } },
      stageInstances: { select: { stage: { select: { departmentId: true } } } },
    },
  });
  if (!project) {
    throw new CommandError("Obra não encontrada.", { errors: ["Obra inexistente."] });
  }

  const visitedDepartmentIds = project.stageInstances
    .map((si) => si.stage.departmentId)
    .filter((d): d is string => Boolean(d));

  const allowed = canReadProject(actor, {
    visitedDepartmentIds,
    assignedUserIds: project.team.map((t) => t.userId),
  });
  if (!allowed) {
    throw new CommandError("Você não tem acesso a esta obra.", {
      errors: ["Sem permissão de leitura para esta obra."],
    });
  }

  return project;
}

async function getOwnedMeasurement(tx: Tx, actor: SessionContext, measurementId: string) {
  const measurement = await tx.measurement.findFirst({
    where: { id: measurementId, organizationId: actor.organizationId, deletedAt: null },
  });
  if (!measurement) {
    throw new CommandError("Medição não encontrada.", { errors: ["Medição inexistente."] });
  }
  const project = await getReadableProject(tx, actor, measurement.projectId);
  return { measurement, project };
}

const measurementSchema = z.object({
  referenceDate: z.coerce.date(),
  plannedValue: z.coerce.number().nonnegative("Informe um valor previsto válido."),
  measuredValue: z.coerce.number().nonnegative("Informe um valor medido válido."),
  notes: z.string().trim().optional().nullable(),
});

export type MeasurementInput = z.infer<typeof measurementSchema>;

export async function createMeasurement(
  actor: SessionContext,
  input: { projectId: string; data: unknown },
) {
  requireManage(actor);
  const data = measurementSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const project = await getReadableProject(tx, actor, input.projectId);

    const measurement = await tx.measurement.create({
      data: {
        organizationId: actor.organizationId,
        projectId: project.id,
        referenceDate: data.referenceDate,
        plannedValue: data.plannedValue,
        measuredValue: data.measuredValue,
        notes: data.notes || null,
        createdById: actor.userId,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "measurement.created",
      entityType: "Measurement",
      entityId: measurement.id,
      summary: `Medição registrada na obra ${project.code} (previsto ${data.plannedValue}, medido ${data.measuredValue}).`,
      after: measurement,
    });

    return measurement;
  });
}

export async function updateMeasurement(
  actor: SessionContext,
  input: { measurementId: string; data: unknown },
) {
  requireManage(actor);
  const data = measurementSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const { measurement } = await getOwnedMeasurement(tx, actor, input.measurementId);
    if (measurement.status !== "PENDING") {
      throw new CommandError("Só é possível editar uma medição pendente.", {
        errors: ["Esta medição já foi decidida."],
      });
    }

    const updated = await tx.measurement.update({
      where: { id: measurement.id },
      data: {
        referenceDate: data.referenceDate,
        plannedValue: data.plannedValue,
        measuredValue: data.measuredValue,
        notes: data.notes || null,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "measurement.updated",
      entityType: "Measurement",
      entityId: measurement.id,
      summary: "Medição pendente editada.",
      before: measurement,
      after: updated,
    });

    return updated;
  });
}

export async function cancelMeasurement(actor: SessionContext, input: { measurementId: string }) {
  requireManage(actor);
  return prisma.$transaction(async (tx) => {
    const { measurement } = await getOwnedMeasurement(tx, actor, input.measurementId);
    if (measurement.status !== "PENDING") {
      throw new CommandError("Só é possível cancelar uma medição pendente.", {
        errors: ["Esta medição já foi decidida."],
      });
    }

    const updated = await tx.measurement.update({
      where: { id: measurement.id },
      data: { deletedAt: new Date() },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "measurement.cancelled",
      entityType: "Measurement",
      entityId: measurement.id,
      summary: "Medição pendente cancelada.",
      before: measurement,
      after: updated,
    });
  });
}

async function decideMeasurement(
  actor: SessionContext,
  input: { measurementId: string; approve: boolean; rejectionReason?: string | null },
) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const { measurement, project } = await getOwnedMeasurement(tx, actor, input.measurementId);
    if (measurement.status !== "PENDING") {
      throw new CommandError("Esta medição já foi decidida.", {
        errors: ["Só é possível aprovar/reprovar uma medição pendente."],
      });
    }
    if (!input.approve && !input.rejectionReason?.trim()) {
      throw new CommandError("Informe o motivo da reprovação.", {
        errors: ["Motivo da reprovação obrigatório."],
      });
    }

    const updated = await tx.measurement.update({
      where: { id: measurement.id },
      data: {
        status: input.approve ? "APPROVED" : "REJECTED",
        approvedById: actor.userId,
        approvedAt: new Date(),
        rejectionReason: input.approve ? null : input.rejectionReason?.trim(),
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: input.approve ? "measurement.approved" : "measurement.rejected",
      entityType: "Measurement",
      entityId: measurement.id,
      summary: input.approve
        ? `Medição de ${project.code} aprovada.`
        : `Medição de ${project.code} reprovada: ${updated.rejectionReason}.`,
      before: measurement,
      after: updated,
    });

    if (measurement.createdById !== actor.userId) {
      await enqueueEvent(tx, {
        organizationId: actor.organizationId,
        type: input.approve ? DOMAIN_EVENTS.MEASUREMENT_APPROVED : DOMAIN_EVENTS.MEASUREMENT_REJECTED,
        projectId: project.id,
        payload: {
          projectId: project.id,
          projectName: project.name,
          projectCode: project.code,
          recipientId: measurement.createdById,
          actorName: actor.userName,
          measurementReferenceDate: measurement.referenceDate.toISOString(),
          measuredValue: String(measurement.measuredValue),
          rejectionReason: updated.rejectionReason ?? undefined,
        },
        idempotencyKey: `${input.approve ? "measurement.approved" : "measurement.rejected"}:${measurement.id}`,
      });
    }

    return updated;
  });
}

export async function approveMeasurement(actor: SessionContext, input: { measurementId: string }) {
  return decideMeasurement(actor, { measurementId: input.measurementId, approve: true });
}

export async function rejectMeasurement(
  actor: SessionContext,
  input: { measurementId: string; reason: string },
) {
  return decideMeasurement(actor, {
    measurementId: input.measurementId,
    approve: false,
    rejectionReason: input.reason,
  });
}
