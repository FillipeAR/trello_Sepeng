import { z } from "zod";
import { canReadProject, hasPermission } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import type { SessionContext } from "@/server/actor";
import { prisma, type Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { CommandError } from "@/modules/projects/commands";
import { enqueueStaffAssignedEvent } from "@/modules/staff/notify";

/**
 * Organograma: template de cargos por organização (`OrgChartPosition`, em
 * árvore via `parentId`) + quem ocupa cada cargo numa obra específica
 * (`ProjectOrgChartAssignment`). Aditivo — não mexe nos campos STAFF já
 * publicados no fluxo (ver CLAUDE.md).
 */

function requireManage(actor: SessionContext) {
  if (!hasPermission(actor, PERMISSIONS.STAFF_MANAGE)) {
    throw new CommandError("Você não tem permissão para gerenciar o organograma.", {
      errors: ["Permissão staff:manage ausente."],
    });
  }
}

const positionSchema = z.object({
  title: z.string().min(2, "Informe o nome do cargo."),
  parentId: z.string().optional().nullable(),
});

async function assertNoCycle(tx: Tx, organizationId: string, positionId: string, parentId: string | null) {
  let current = parentId;
  let hops = 0;
  while (current) {
    if (current === positionId) {
      throw new CommandError("Não é possível criar um ciclo no organograma.", {
        errors: ["Este cargo não pode reportar a um dos seus próprios subordinados."],
      });
    }
    const parent: { parentId: string | null } | null = await tx.orgChartPosition.findFirst({
      where: { id: current, organizationId },
      select: { parentId: true },
    });
    current = parent?.parentId ?? null;
    hops += 1;
    if (hops > 100) break; // salvaguarda — não deveria acontecer sem ciclo já detectado acima.
  }
}

export async function createPosition(actor: SessionContext, input: { data: unknown }) {
  requireManage(actor);
  const data = positionSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    if (data.parentId) {
      const parent = await tx.orgChartPosition.findFirst({
        where: { id: data.parentId, organizationId: actor.organizationId, deletedAt: null },
      });
      if (!parent) {
        throw new CommandError("Cargo superior inválido.", { errors: ["Cargo não encontrado."] });
      }
    }

    const siblingCount = await tx.orgChartPosition.count({
      where: { organizationId: actor.organizationId, parentId: data.parentId || null, deletedAt: null },
    });

    const position = await tx.orgChartPosition.create({
      data: {
        organizationId: actor.organizationId,
        title: data.title,
        parentId: data.parentId || null,
        order: siblingCount,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "orgchart.position_created",
      entityType: "OrgChartPosition",
      entityId: position.id,
      summary: `Cargo "${position.title}" criado no organograma.`,
      after: position,
    });

    return position;
  });
}

export async function updatePosition(actor: SessionContext, input: { positionId: string; data: unknown }) {
  requireManage(actor);
  const data = positionSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const position = await tx.orgChartPosition.findFirst({
      where: { id: input.positionId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!position) {
      throw new CommandError("Cargo não encontrado.", { errors: ["Cargo inexistente."] });
    }

    if (data.parentId) {
      const parent = await tx.orgChartPosition.findFirst({
        where: { id: data.parentId, organizationId: actor.organizationId, deletedAt: null },
      });
      if (!parent) {
        throw new CommandError("Cargo superior inválido.", { errors: ["Cargo não encontrado."] });
      }
      await assertNoCycle(tx, actor.organizationId, position.id, data.parentId);
    }

    const updated = await tx.orgChartPosition.update({
      where: { id: position.id },
      data: { title: data.title, parentId: data.parentId || null },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "orgchart.position_updated",
      entityType: "OrgChartPosition",
      entityId: position.id,
      summary: `Cargo "${updated.title}" atualizado.`,
      before: position,
      after: updated,
    });

    return updated;
  });
}

export async function deletePosition(actor: SessionContext, input: { positionId: string }) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const position = await tx.orgChartPosition.findFirst({
      where: { id: input.positionId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!position) {
      throw new CommandError("Cargo não encontrado.", { errors: ["Cargo inexistente."] });
    }

    // Filhos ficam órfãs no topo (parentId null), não em cascata — evita apagar um
    // galho inteiro do organograma sem querer.
    await tx.orgChartPosition.updateMany({
      where: { organizationId: actor.organizationId, parentId: position.id },
      data: { parentId: null },
    });

    await tx.orgChartPosition.update({ where: { id: position.id }, data: { deletedAt: new Date() } });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "orgchart.position_deleted",
      entityType: "OrgChartPosition",
      entityId: position.id,
      summary: `Cargo "${position.title}" removido do organograma.`,
      before: position,
    });
  });
}

export async function movePosition(actor: SessionContext, input: { positionId: string; direction: "up" | "down" }) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const position = await tx.orgChartPosition.findFirst({
      where: { id: input.positionId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!position) {
      throw new CommandError("Cargo não encontrado.", { errors: ["Cargo inexistente."] });
    }

    const siblings = await tx.orgChartPosition.findMany({
      where: { organizationId: actor.organizationId, parentId: position.parentId, deletedAt: null },
      orderBy: { order: "asc" },
    });

    const index = siblings.findIndex((s) => s.id === position.id);
    const swapWith = input.direction === "up" ? siblings[index - 1] : siblings[index + 1];
    if (!swapWith) return position;

    await tx.orgChartPosition.update({ where: { id: position.id }, data: { order: swapWith.order } });
    await tx.orgChartPosition.update({ where: { id: swapWith.id }, data: { order: position.order } });

    return position;
  });
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

export async function assignPosition(
  actor: SessionContext,
  input: { projectId: string; positionId: string; professionalId: string | null },
) {
  requireManage(actor);

  return prisma.$transaction(async (tx) => {
    const project = await getReadableProject(tx, actor, input.projectId);

    const position = await tx.orgChartPosition.findFirst({
      where: { id: input.positionId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!position) {
      throw new CommandError("Cargo não encontrado.", { errors: ["Cargo inexistente no organograma."] });
    }

    let professional: { id: string; name: string } | null = null;
    if (input.professionalId) {
      professional = await tx.professional.findFirst({
        where: { id: input.professionalId, organizationId: actor.organizationId, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!professional) {
        throw new CommandError("Profissional não encontrado.", { errors: ["Profissional inexistente."] });
      }
    }

    const existing = await tx.projectOrgChartAssignment.findUnique({
      where: { projectId_positionId: { projectId: project.id, positionId: position.id } },
    });

    const assignment = await tx.projectOrgChartAssignment.upsert({
      where: { projectId_positionId: { projectId: project.id, positionId: position.id } },
      create: {
        organizationId: actor.organizationId,
        projectId: project.id,
        positionId: position.id,
        professionalId: input.professionalId || null,
      },
      update: { professionalId: input.professionalId || null },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "orgchart.position_assigned",
      entityType: "ProjectOrgChartAssignment",
      entityId: assignment.id,
      summary: professional
        ? `"${professional.name}" atribuído(a) ao cargo "${position.title}" na obra.`
        : `Cargo "${position.title}" desocupado na obra.`,
      before: { professionalId: existing?.professionalId ?? null },
      after: { professionalId: assignment.professionalId },
    });

    if (professional && professional.id !== existing?.professionalId) {
      await enqueueStaffAssignedEvent(tx, {
        organizationId: actor.organizationId,
        professionalId: professional.id,
        projectId: project.id,
        projectName: project.name,
        projectCode: project.code,
        contextLabel: position.title,
      });
    }

    return assignment;
  });
}
