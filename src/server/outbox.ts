import { randomUUID } from "node:crypto";
import type { JsonValue, Tx } from "./db";

/**
 * Outbox transacional. O engine nunca envia e-mail nem WhatsApp: ele grava o
 * evento junto da transição, e um worker separado entrega. Plugar um canal novo
 * (V2) não toca em nenhuma regra de negócio.
 */
import { DOMAIN_EVENTS } from "@/core/notifications/events";
import type { DomainEventType } from "@/core/notifications/events";

export { DOMAIN_EVENTS };
export type { DomainEventType };

export async function enqueueEvent(
  tx: Tx,
  input: {
    organizationId: string;
    type: DomainEventType;
    payload: Record<string, unknown>;
    /** Presente quando o evento é sobre uma obra específica — grava a coluna
     * denormalizada `OutboxEvent.projectId` (ver comentário no schema). */
    projectId?: string;
    /** Chave estável evita evento duplicado se o comando for reexecutado. */
    idempotencyKey?: string;
  },
) {
  return tx.outboxEvent.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      type: input.type,
      payload: input.payload as JsonValue,
      idempotencyKey: input.idempotencyKey ?? `${input.type}:${randomUUID()}`,
    },
  });
}
