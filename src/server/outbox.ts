import { randomUUID } from "node:crypto";
import type { JsonValue, Tx } from "./db";

/**
 * Outbox transacional. O engine nunca envia e-mail nem WhatsApp: ele grava o
 * evento junto da transição, e um worker separado entrega. Plugar um canal novo
 * (V2) não toca em nenhuma regra de negócio.
 */
export const DOMAIN_EVENTS = {
  PROJECT_CREATED: "project.created",
  STAGE_ENTERED: "stage.entered",
  STAGE_COMPLETED: "stage.completed",
  STAGE_RETURNED: "stage.returned",
  PROJECT_REJECTED: "project.rejected",
  PROJECT_FINISHED: "project.finished",
  TASK_ASSIGNED: "task.assigned",
  MENTION_CREATED: "mention.created",
  SLA_BREACHED: "sla.breached",
  MEASUREMENT_APPROVED: "measurement.approved",
  MEASUREMENT_REJECTED: "measurement.rejected",
  DOCUMENT_EXPIRING_SOON: "document.expiring_soon",
  DOCUMENT_EXPIRED: "document.expired",
  /** Profissional (STAFF) selecionado num campo de etapa da obra. */
  STAFF_ASSIGNED: "staff.assigned",
  /** Cadastro próprio (`/cadastro`) — link de confirmação de e-mail. */
  EMAIL_VERIFICATION_REQUESTED: "email_verification.requested",
  /** E-mail confirmado num cadastro próprio — falta aprovação de um admin. */
  SIGNUP_PENDING_APPROVAL: "signup.pending_approval",
} as const;

export type DomainEventType = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];

export async function enqueueEvent(
  tx: Tx,
  input: {
    organizationId: string;
    type: DomainEventType;
    payload: Record<string, unknown>;
    /** Chave estável evita evento duplicado se o comando for reexecutado. */
    idempotencyKey?: string;
  },
) {
  return tx.outboxEvent.create({
    data: {
      organizationId: input.organizationId,
      type: input.type,
      payload: input.payload as JsonValue,
      idempotencyKey: input.idempotencyKey ?? `${input.type}:${randomUUID()}`,
    },
  });
}
