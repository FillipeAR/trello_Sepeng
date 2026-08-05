import { hasPermission } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { documentValidityStatus, type DocumentValidityStatus } from "@/core/documents/validity";
import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";
import { canActorReadProject } from "@/modules/projects/queries";

export interface ProjectDocumentRow {
  id: string;
  type: string;
  referenceNumber: string | null;
  issuedAt: Date | null;
  expiresAt: Date;
  notes: string | null;
  status: DocumentValidityStatus;
  createdByName: string;
  createdAt: Date;
  file: { url: string; name: string } | null;
}

/** Só quem tem `document:manage` (hoje: Diretoria, RH, Administrador) vê a seção. */
export async function getProjectDocuments(
  actor: SessionContext,
  projectId: string,
): Promise<ProjectDocumentRow[] | null> {
  if (!hasPermission(actor, PERMISSIONS.DOCUMENT_MANAGE)) return null;

  const allowed = await canActorReadProject(actor, projectId);
  if (!allowed) return null;

  const documents = await prisma.projectDocument.findMany({
    where: { organizationId: actor.organizationId, projectId, deletedAt: null },
    orderBy: { expiresAt: "asc" },
    include: { createdBy: { select: { name: true } } },
  });

  const documentIds = documents.map((d) => d.id);
  const files = documentIds.length
    ? await prisma.attachment.findMany({
        where: { organizationId: actor.organizationId, entityType: "PROJECT_DOCUMENT", entityId: { in: documentIds } },
      })
    : [];
  const fileByDocumentId = new Map(files.map((f) => [f.entityId, f]));

  const now = new Date();

  return documents.map((d) => {
    const file = fileByDocumentId.get(d.id);
    return {
      id: d.id,
      type: d.type,
      referenceNumber: d.referenceNumber,
      issuedAt: d.issuedAt,
      expiresAt: d.expiresAt,
      notes: d.notes,
      status: documentValidityStatus(d.expiresAt, now),
      createdByName: d.createdBy.name,
      createdAt: d.createdAt,
      file: file ? { url: file.url, name: file.fileName } : null,
    };
  });
}
