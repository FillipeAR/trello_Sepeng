/**
 * Catálogo de eventos de domínio — puro, sem I/O. Fica em `core` porque é
 * usado tanto pelo lado de escrita (`src/server/outbox.ts`, que reexporta
 * daqui) quanto por lógica pura de leitura (`describe`, `preferences`), que
 * não pode depender de `src/server/**`.
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
  /** Conta criada por um admin (`/admin/usuarios`) ou senha redefinida por um admin — avisa a credencial por e-mail. */
  USER_CREDENTIALS_ISSUED: "user.credentials_issued",
} as const;

export type DomainEventType = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];
