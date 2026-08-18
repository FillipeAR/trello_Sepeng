/**
 * Narra um evento de domínio em texto legível (título + corpo), em português.
 * Pura — sem I/O — reaproveitada tanto pelo worker do outbox (notificação
 * in-app/WhatsApp) quanto pelo feed de atualizações por obra
 * (`src/modules/projects/activity.ts`).
 */
import { formatDateTime } from "@/lib/format";
import { DOMAIN_EVENTS } from "@/core/notifications/events";

export interface EventPayload {
  projectId: string;
  projectName: string;
  projectCode: string;
  stageId?: string | null;
  stageName?: string | null;
  fromStageName?: string | null;
  departmentId?: string | null;
  displayStatus?: string;
  actorName?: string;
  actorId?: string;
  taskId?: string;
  taskTitle?: string;
  dueAt?: string | null;
  assigneeId?: string;
  commentId?: string;
  excerpt?: string;
  mentionedUserIds?: string[];
  /** staff.assigned — profissional (sem login) selecionado numa obra. */
  professionalId?: string;
  contextLabel?: string;
  /** email_verification.requested / signup.pending_approval — cadastro próprio. */
  userId?: string;
  name?: string;
  email?: string;
  token?: string;
  /** user.credentials_issued — nunca persiste além do envio, ver dispatcher. */
  password?: string;
  /** user.credentials_issued — "created" (conta nova) ou "password_reset" (admin redefiniu). */
  reason?: "created" | "password_reset";
}

export function describe(type: string, p: EventPayload): { title: string; body: string } {
  switch (type) {
    case DOMAIN_EVENTS.PROJECT_CREATED:
      return {
        title: `Nova obra: ${p.projectName}`,
        body: `${p.projectCode} foi cadastrada e está em "${p.displayStatus}".`,
      };
    case DOMAIN_EVENTS.STAGE_ENTERED:
      return {
        title: `${p.projectName} chegou em ${p.stageName}`,
        body: `${p.actorName ?? "Um usuário"} concluiu ${p.fromStageName}. Status: "${p.displayStatus}".`,
      };
    case DOMAIN_EVENTS.STAGE_RETURNED:
      return {
        title: `${p.projectName} foi devolvida para ${p.stageName}`,
        body: `${p.actorName ?? "Um usuário"} devolveu a obra a partir de ${p.fromStageName}.`,
      };
    case DOMAIN_EVENTS.PROJECT_REJECTED:
      return {
        title: `${p.projectName} foi reprovada`,
        body: `Reprovação registrada em ${p.fromStageName} por ${p.actorName ?? "um usuário"}.`,
      };
    case DOMAIN_EVENTS.PROJECT_FINISHED:
      return {
        title: `${p.projectName} foi finalizada`,
        body: `A obra ${p.projectCode} concluiu o fluxo completo.`,
      };
    case DOMAIN_EVENTS.TASK_ASSIGNED:
      return {
        title: `Novo lembrete: ${p.taskTitle}`,
        body: `${p.actorName ?? "Alguém"} atribuiu um lembrete pra você em ${p.projectName}${
          p.dueAt ? ` — prazo ${formatDateTime(p.dueAt)}` : ""
        }.`,
      };
    case DOMAIN_EVENTS.MENTION_CREATED:
      return {
        title: `${p.actorName ?? "Alguém"} mencionou você em ${p.projectName}`,
        body: p.excerpt ?? "Você foi marcado num comentário.",
      };
    case DOMAIN_EVENTS.SLA_BREACHED:
      return {
        title: `SLA vencido: ${p.projectName}`,
        body: `A etapa "${p.stageName}" está com o prazo estourado${
          p.dueAt ? ` desde ${formatDateTime(p.dueAt)}` : ""
        }.`,
      };
    default:
      return {
        title: p.projectName,
        body: `Evento ${type} registrado.`,
      };
  }
}
