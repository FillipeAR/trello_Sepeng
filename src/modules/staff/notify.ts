import { DOMAIN_EVENTS } from "@/server/outbox";
import { enqueueEvent } from "@/server/outbox";
import type { Tx } from "@/server/db";

/**
 * Enfileira o aviso de seleção pra um `Professional` — chamado por
 * `executeStageAction` quando um campo STAFF muda de profissional.
 * Profissional não tem login, então isso não vira `Notification` in-app: o
 * dispatcher resolve o e-mail direto pelo `professionalId` do payload (ver
 * `src/modules/notifications/dispatcher.ts`).
 */
export async function enqueueStaffAssignedEvent(
  tx: Tx,
  args: {
    organizationId: string;
    professionalId: string;
    projectId: string;
    projectName: string;
    projectCode: string;
    /** Ex.: "Gerente responsável" — o rótulo do campo STAFF preenchido. */
    contextLabel: string;
    /**
     * Chave estável ancorada numa entidade de uso único (ex.: `StageInstance`,
     * fechada pra sempre depois desta chamada) — evita evento duplicado se o
     * comando for reexecutado. Omita só se o chamador puder repetir o mesmo
     * profissional depois de trocado; aí cada seleção deve gerar um aviso
     * novo, não ser deduplicada contra o histórico.
     */
    idempotencyKey?: string;
  },
) {
  await enqueueEvent(tx, {
    organizationId: args.organizationId,
    type: DOMAIN_EVENTS.STAFF_ASSIGNED,
    projectId: args.projectId,
    payload: {
      professionalId: args.professionalId,
      projectId: args.projectId,
      projectName: args.projectName,
      projectCode: args.projectCode,
      contextLabel: args.contextLabel,
    },
    ...(args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : {}),
  });
}
