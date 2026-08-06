import { DOMAIN_EVENTS } from "@/server/outbox";
import { enqueueEvent } from "@/server/outbox";
import type { Tx } from "@/server/db";

/**
 * Enfileira o aviso de seleção pra um `Professional` — usado tanto pelo campo
 * STAFF da etapa (`executeStageAction`) quanto pela atribuição no organograma
 * (`assignPosition`). Profissional não tem login, então isso não vira
 * `Notification` in-app: o dispatcher resolve o e-mail direto pelo
 * `professionalId` do payload (ver `src/modules/notifications/dispatcher.ts`).
 */
export async function enqueueStaffAssignedEvent(
  tx: Tx,
  args: {
    organizationId: string;
    professionalId: string;
    projectId: string;
    projectName: string;
    projectCode: string;
    /** Ex.: "Gerente responsável" (campo) ou "Engenheiro Residente" (cargo do organograma). */
    contextLabel: string;
    /**
     * Só passe uma chave estável quando o chamador tiver uma entidade de
     * uso único pra ancorar nela (ex.: `StageInstance`, fechada pra sempre
     * depois desta chamada). Pra atribuições que podem repetir o mesmo
     * profissional depois de trocado (ex.: organograma), omita — cada
     * seleção deve gerar um aviso novo, não ser deduplicada contra o
     * histórico.
     */
    idempotencyKey?: string;
  },
) {
  await enqueueEvent(tx, {
    organizationId: args.organizationId,
    type: DOMAIN_EVENTS.STAFF_ASSIGNED,
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
