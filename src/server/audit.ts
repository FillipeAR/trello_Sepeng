import { buildDiff, serializeForAudit } from "@/core/audit/diff";
import type { JsonValue, Tx } from "./db";

export interface AuditInput {
  organizationId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  summary?: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Grava a trilha de auditoria. Sempre chamada DENTRO da transação do comando —
 * se a operação falha, o log não sobra; se a operação passa, o log existe.
 */
export async function writeAudit(tx: Tx, input: AuditInput) {
  const before = input.before ? serializeForAudit(input.before) : null;
  const after = input.after ? serializeForAudit(input.after) : null;

  return tx.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      beforeJson: (before ?? undefined) as JsonValue | undefined,
      afterJson: (after ?? undefined) as JsonValue | undefined,
      diffJson: (before || after ? buildDiff(before, after) : undefined) as
        | JsonValue
        | undefined,
      ip: input.ip,
      userAgent: input.userAgent,
    },
  });
}
