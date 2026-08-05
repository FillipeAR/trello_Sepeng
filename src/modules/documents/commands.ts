import { z } from "zod";
import { canReadProject, hasPermission } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import type { SessionContext } from "@/server/actor";
import { prisma, type Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { CommandError } from "@/modules/projects/commands";

/**
 * Documento com validade (ART/RRT, alvará, licença, seguro, ...). Sem
 * histórico de versão — renovar é editar `expiresAt` (e opcionalmente trocar
 * o arquivo) no mesmo registro; ver nota no schema sobre isso ser suficiente
 * pro MVP. Autorização = mesma leitura de obra (`canReadProject`) + a
 * permissão transversal `document:manage` (hoje: Diretoria, RH).
 */

function requireManage(actor: SessionContext) {
  if (!hasPermission(actor, PERMISSIONS.DOCUMENT_MANAGE)) {
    throw new CommandError("Você não tem permissão para gerenciar documentos.", {
      errors: ["Permissão document:manage ausente."],
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

async function getOwnedDocument(tx: Tx, actor: SessionContext, documentId: string) {
  const document = await tx.projectDocument.findFirst({
    where: { id: documentId, organizationId: actor.organizationId, deletedAt: null },
  });
  if (!document) {
    throw new CommandError("Documento não encontrado.", { errors: ["Documento inexistente."] });
  }
  const project = await getReadableProject(tx, actor, document.projectId);
  return { document, project };
}

const fileSchema = z.object({ url: z.string(), name: z.string(), size: z.number(), mimeType: z.string() });

const documentSchema = z.object({
  type: z.string().trim().min(2, "Informe o tipo do documento."),
  referenceNumber: z.string().trim().optional().nullable(),
  issuedAt: z.coerce.date().optional().nullable(),
  expiresAt: z.coerce.date(),
  notes: z.string().trim().optional().nullable(),
  file: fileSchema.nullable().optional(),
});

export type ProjectDocumentInput = z.infer<typeof documentSchema>;

export async function createProjectDocument(
  actor: SessionContext,
  input: { projectId: string; data: unknown },
) {
  requireManage(actor);
  const data = documentSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const project = await getReadableProject(tx, actor, input.projectId);

    const document = await tx.projectDocument.create({
      data: {
        organizationId: actor.organizationId,
        projectId: project.id,
        type: data.type,
        referenceNumber: data.referenceNumber || null,
        issuedAt: data.issuedAt ?? null,
        expiresAt: data.expiresAt,
        notes: data.notes || null,
        createdById: actor.userId,
      },
    });

    if (data.file) {
      await tx.attachment.create({
        data: {
          organizationId: actor.organizationId,
          entityType: "PROJECT_DOCUMENT",
          entityId: document.id,
          fileName: data.file.name,
          url: data.file.url,
          mimeType: data.file.mimeType,
          size: data.file.size,
          uploadedById: actor.userId,
        },
      });
    }

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "document.created",
      entityType: "ProjectDocument",
      entityId: document.id,
      summary: `Documento "${data.type}" registrado na obra ${project.code}, válido até ${data.expiresAt.toLocaleDateString("pt-BR")}.`,
      after: document,
    });

    return document;
  });
}

export async function updateProjectDocument(
  actor: SessionContext,
  input: { documentId: string; data: unknown },
) {
  requireManage(actor);
  const data = documentSchema.parse(input.data);

  return prisma.$transaction(async (tx) => {
    const { document } = await getOwnedDocument(tx, actor, input.documentId);

    const expiresAtChanged = document.expiresAt.getTime() !== data.expiresAt.getTime();

    const updated = await tx.projectDocument.update({
      where: { id: document.id },
      data: {
        type: data.type,
        referenceNumber: data.referenceNumber || null,
        issuedAt: data.issuedAt ?? null,
        expiresAt: data.expiresAt,
        notes: data.notes || null,
        // Renovou o prazo: reabre os dois alertas do cron pra essa nova data.
        ...(expiresAtChanged ? { expiringAlertSentAt: null, expiredAlertSentAt: null } : {}),
      },
    });

    if (data.file) {
      await tx.attachment.deleteMany({
        where: { organizationId: actor.organizationId, entityType: "PROJECT_DOCUMENT", entityId: document.id },
      });
      await tx.attachment.create({
        data: {
          organizationId: actor.organizationId,
          entityType: "PROJECT_DOCUMENT",
          entityId: document.id,
          fileName: data.file.name,
          url: data.file.url,
          mimeType: data.file.mimeType,
          size: data.file.size,
          uploadedById: actor.userId,
        },
      });
    }

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "document.updated",
      entityType: "ProjectDocument",
      entityId: document.id,
      summary: expiresAtChanged
        ? `Documento "${updated.type}" renovado — validade até ${data.expiresAt.toLocaleDateString("pt-BR")}.`
        : `Documento "${updated.type}" editado.`,
      before: document,
      after: updated,
    });

    return updated;
  });
}

export async function deleteProjectDocument(actor: SessionContext, input: { documentId: string }) {
  requireManage(actor);
  return prisma.$transaction(async (tx) => {
    const { document } = await getOwnedDocument(tx, actor, input.documentId);

    const updated = await tx.projectDocument.update({
      where: { id: document.id },
      data: { deletedAt: new Date() },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "document.deleted",
      entityType: "ProjectDocument",
      entityId: document.id,
      summary: `Documento "${document.type}" removido.`,
      before: document,
    });

    return updated;
  });
}
