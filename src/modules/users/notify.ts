import { DOMAIN_EVENTS, enqueueEvent } from "@/server/outbox";
import type { Tx } from "@/server/db";

/**
 * Enfileira o aviso de credencial pra quem acabou de ganhar (ou teve
 * redefinida) uma conta em `/admin/usuarios` — chamado por `createUser` e
 * `updateUser` (só quando a senha muda). A senha em texto puro só vive no
 * payload até o dispatcher confirmar o envio — ver `dispatchUserCredentialsEmail`
 * em `src/modules/notifications/dispatcher.ts`, que redige o campo depois.
 */
export async function enqueueUserCredentialsEvent(
  tx: Tx,
  args: {
    organizationId: string;
    userId: string;
    name: string;
    email: string;
    password: string;
    reason: "created" | "password_reset";
  },
) {
  await enqueueEvent(tx, {
    organizationId: args.organizationId,
    type: DOMAIN_EVENTS.USER_CREDENTIALS_ISSUED,
    payload: {
      userId: args.userId,
      name: args.name,
      email: args.email,
      password: args.password,
      reason: args.reason,
    },
    // Não idempotente por design: cada criação/redefinição é um evento novo
    // (mesma pessoa pode ter a senha redefinida várias vezes).
  });
}
