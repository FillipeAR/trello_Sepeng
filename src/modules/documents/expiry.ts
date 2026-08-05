import { prisma } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { DOMAIN_EVENTS, enqueueEvent } from "@/server/outbox";
import { DOCUMENT_EXPIRY_WARNING_DAYS } from "@/core/documents/validity";

/**
 * Varre documentos entrando na janela de aviso e documentos já vencidos,
 * ainda não sinalizados, e enfileira o evento correspondente. Mesmo padrão
 * de `checkSlaBreaches` (`src/modules/notifications/sla.ts`): chamado pelo
 * cron em `/api/cron/document-check`, sem ator (auditoria com `actorId:
 * null`), idempotente via os dois flags `...AlertSentAt` — cada limiar só
 * gera um evento por documento, mesmo rodando todo dia. Renovar o documento
 * (mudar `expiresAt`) zera os dois flags no command handler, reabrindo o
 * alerta pra nova data.
 */
export async function checkDocumentExpirations(): Promise<{ expiringSoon: number; expired: number }> {
  const now = new Date();
  const warningThreshold = new Date(now.getTime() + DOCUMENT_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000);

  const expiringSoon = await prisma.projectDocument.findMany({
    where: {
      deletedAt: null,
      expiresAt: { gte: now, lte: warningThreshold },
      expiringAlertSentAt: null,
    },
    include: { project: { select: { id: true, name: true, code: true, organizationId: true } } },
  });

  for (const document of expiringSoon) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.projectDocument.updateMany({
        where: { id: document.id, expiringAlertSentAt: null },
        data: { expiringAlertSentAt: now },
      });
      if (updated.count === 0) return; // outra execução já sinalizou este documento

      await writeAudit(tx, {
        organizationId: document.project.organizationId,
        actorId: null,
        action: "document.expiring_soon",
        entityType: "ProjectDocument",
        entityId: document.id,
        summary: `Documento "${document.type}" da obra ${document.project.code} vence em breve (${document.expiresAt.toLocaleDateString("pt-BR")}).`,
      });

      await enqueueEvent(tx, {
        organizationId: document.project.organizationId,
        type: DOMAIN_EVENTS.DOCUMENT_EXPIRING_SOON,
        payload: {
          projectId: document.project.id,
          projectName: document.project.name,
          projectCode: document.project.code,
          documentType: document.type,
          documentExpiresAt: document.expiresAt.toISOString(),
        },
        idempotencyKey: `document.expiring_soon:${document.id}`,
      });
    });
  }

  const expired = await prisma.projectDocument.findMany({
    where: {
      deletedAt: null,
      expiresAt: { lt: now },
      expiredAlertSentAt: null,
    },
    include: { project: { select: { id: true, name: true, code: true, organizationId: true } } },
  });

  for (const document of expired) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.projectDocument.updateMany({
        where: { id: document.id, expiredAlertSentAt: null },
        data: { expiredAlertSentAt: now },
      });
      if (updated.count === 0) return;

      await writeAudit(tx, {
        organizationId: document.project.organizationId,
        actorId: null,
        action: "document.expired",
        entityType: "ProjectDocument",
        entityId: document.id,
        summary: `Documento "${document.type}" da obra ${document.project.code} venceu em ${document.expiresAt.toLocaleDateString("pt-BR")}.`,
      });

      await enqueueEvent(tx, {
        organizationId: document.project.organizationId,
        type: DOMAIN_EVENTS.DOCUMENT_EXPIRED,
        payload: {
          projectId: document.project.id,
          projectName: document.project.name,
          projectCode: document.project.code,
          documentType: document.type,
          documentExpiresAt: document.expiresAt.toISOString(),
        },
        idempotencyKey: `document.expired:${document.id}`,
      });
    });
  }

  return { expiringSoon: expiringSoon.length, expired: expired.length };
}
