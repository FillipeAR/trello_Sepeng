import { prisma } from "@/server/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { getAppUrl } from "@/lib/url";
import { DOMAIN_EVENTS, type DomainEventType } from "@/server/outbox";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { resolveChannelEnabled } from "@/core/notifications/preferences";
import { sendWhatsAppMessage } from "./whatsapp";
import { sendEmail } from "./email";

/**
 * Worker do outbox. Entrega notificação in-app (sempre) e WhatsApp
 * (opt-in, ver `resolveChannelEnabled`) — e-mail entra do mesmo jeito quando
 * for a vez dele. Falha ao enviar WhatsApp pra um destinatário não derruba o
 * evento inteiro: se derrubasse, o retry recriaria as notificações in-app já
 * gravadas via `createMany` (não é idempotente a esse nível).
 */

interface EventPayload {
  projectId: string;
  projectName: string;
  projectCode: string;
  stageId?: string | null;
  stageName?: string | null;
  fromStageName?: string | null;
  departmentId?: string | null;
  displayStatus?: string;
  actorName?: string;
  taskId?: string;
  taskTitle?: string;
  dueAt?: string | null;
  assigneeId?: string;
  commentId?: string;
  excerpt?: string;
  mentionedUserIds?: string[];
  /** Destinatário único de um evento pessoal (ex.: medição decidida — avisa quem registrou). */
  recipientId?: string;
  measurementReferenceDate?: string;
  measuredValue?: string;
  rejectionReason?: string;
  documentType?: string;
  documentExpiresAt?: string;
  /** staff.assigned — profissional (sem login) selecionado numa obra. */
  professionalId?: string;
  contextLabel?: string;
  /** email_verification.requested / signup.pending_approval — cadastro próprio. */
  userId?: string;
  name?: string;
  email?: string;
  token?: string;
}

function describe(type: string, p: EventPayload): { title: string; body: string } {
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
    case DOMAIN_EVENTS.MEASUREMENT_APPROVED:
      return {
        title: `Medição aprovada: ${p.projectName}`,
        body: `${p.actorName ?? "Alguém"} aprovou a medição de ${
          p.measurementReferenceDate ? formatDateTime(p.measurementReferenceDate) : "referência"
        } (${p.measuredValue ?? "—"}).`,
      };
    case DOMAIN_EVENTS.MEASUREMENT_REJECTED:
      return {
        title: `Medição reprovada: ${p.projectName}`,
        body: `${p.actorName ?? "Alguém"} reprovou a medição de ${
          p.measurementReferenceDate ? formatDateTime(p.measurementReferenceDate) : "referência"
        }${p.rejectionReason ? ` — ${p.rejectionReason}` : ""}.`,
      };
    case DOMAIN_EVENTS.DOCUMENT_EXPIRING_SOON:
      return {
        title: `Documento vencendo: ${p.projectName}`,
        body: `"${p.documentType}" vence em ${
          p.documentExpiresAt ? formatDate(p.documentExpiresAt) : "breve"
        } — providencie a renovação.`,
      };
    case DOMAIN_EVENTS.DOCUMENT_EXPIRED:
      return {
        title: `Documento vencido: ${p.projectName}`,
        body: `"${p.documentType}" venceu em ${
          p.documentExpiresAt ? formatDate(p.documentExpiresAt) : "data passada"
        }.`,
      };
    default:
      return {
        title: p.projectName,
        body: `Evento ${type} registrado.`,
      };
  }
}

/** Quem precisa saber: o departamento que recebeu a obra e a equipe alocada. */
async function resolveRecipients(
  organizationId: string,
  type: DomainEventType,
  payload: EventPayload,
): Promise<string[]> {
  // Lembrete e menção são pessoais: só quem foi designado/marcado, nunca o
  // departamento inteiro.
  if (type === DOMAIN_EVENTS.TASK_ASSIGNED) {
    return payload.assigneeId ? [payload.assigneeId] : [];
  }
  if (type === DOMAIN_EVENTS.MENTION_CREATED) {
    return payload.mentionedUserIds ?? [];
  }
  if (type === DOMAIN_EVENTS.MEASUREMENT_APPROVED || type === DOMAIN_EVENTS.MEASUREMENT_REJECTED) {
    return payload.recipientId ? [payload.recipientId] : [];
  }
  // Vencimento de documento não tem departamento dono nem equipe alocada
  // como destinatário natural — avisa quem tem a permissão de cuidar disso.
  if (type === DOMAIN_EVENTS.DOCUMENT_EXPIRING_SOON || type === DOMAIN_EVENTS.DOCUMENT_EXPIRED) {
    const managers = await prisma.membership.findMany({
      where: {
        organizationId,
        isActive: true,
        role: { permissions: { some: { permission: { key: PERMISSIONS.DOCUMENT_MANAGE } } } },
      },
      select: { userId: true },
    });
    return managers.map((m) => m.userId);
  }

  const recipients = new Set<string>();

  if (payload.departmentId) {
    const members = await prisma.membership.findMany({
      where: { organizationId, departmentId: payload.departmentId, isActive: true },
      select: { userId: true },
    });
    for (const m of members) recipients.add(m.userId);
  }

  const team = await prisma.projectTeamAssignment.findMany({
    where: { projectId: payload.projectId },
    select: { userId: true },
  });
  for (const t of team) recipients.add(t.userId);

  return [...recipients];
}

/** Envia WhatsApp pra quem tem telefone + preferência habilitada pra este evento. Nunca lança. */
async function dispatchWhatsApp(
  type: DomainEventType,
  recipients: string[],
  title: string,
  body: string,
): Promise<void> {
  if (recipients.length === 0) return;

  const users = await prisma.user.findMany({
    where: { id: { in: recipients }, phone: { not: null } },
    select: { id: true, phone: true },
  });
  if (users.length === 0) return;

  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: { in: users.map((u) => u.id) }, eventType: type, channel: "WHATSAPP" },
  });

  for (const user of users) {
    const enabled = resolveChannelEnabled(prefs, type, "WHATSAPP", { hasPhone: Boolean(user.phone) });
    if (!enabled || !user.phone) continue;
    try {
      await sendWhatsAppMessage(user.phone, title, body);
    } catch (error) {
      console.error(`Falha ao enviar WhatsApp (evento ${type}, usuário ${user.id}):`, error);
    }
  }
}

/**
 * `staff.assigned` não segue o fluxo genérico acima: o destinatário é um
 * `Professional` (sem login, sem `Notification` in-app possível) — o e-mail é
 * a única entrega, sempre que houver endereço cadastrado, sem passar pela
 * preferência opt-in por usuário (que só existe pra quem tem conta).
 */
async function dispatchStaffAssignedEmail(payload: EventPayload): Promise<void> {
  if (!payload.professionalId) return;

  const professional = await prisma.professional.findUnique({
    where: { id: payload.professionalId },
    select: { name: true, email: true },
  });
  if (!professional?.email) return;

  const subject = `Você foi selecionado para a obra ${payload.projectName}`;
  const html = `
    <p>Olá, ${professional.name},</p>
    <p>Você foi selecionado(a) como <strong>${payload.contextLabel ?? "responsável"}</strong>
    na obra <strong>${payload.projectName}</strong> (${payload.projectCode}).</p>
    <p>Este é um aviso informativo do ObraFlow — você não precisa acessar o sistema.</p>
  `;

  try {
    await sendEmail(professional.email, subject, html);
  } catch (error) {
    console.error(`Falha ao enviar e-mail de seleção (profissional ${payload.professionalId}):`, error);
  }
}

/**
 * `email_verification.requested` — cadastro próprio (`/cadastro`). A pessoa ainda
 * não consegue logar (sem `Notification` in-app possível), então o link só chega
 * por e-mail.
 */
async function dispatchEmailVerificationEmail(payload: EventPayload): Promise<void> {
  if (!payload.email || !payload.token) return;

  const link = `${getAppUrl()}/verificar-email/${payload.token}`;
  const subject = "Confirme seu e-mail — ObraFlow";
  const html = `
    <p>Olá, ${payload.name ?? ""},</p>
    <p>Confirme seu e-mail pra continuar o cadastro no ObraFlow:</p>
    <p><a href="${link}">${link}</a></p>
    <p>Depois de confirmar, um administrador ainda precisa liberar seu acesso.</p>
    <p>Se você não pediu esse cadastro, ignore este e-mail.</p>
  `;

  try {
    await sendEmail(payload.email, subject, html);
  } catch (error) {
    console.error(`Falha ao enviar e-mail de verificação (usuário ${payload.userId}):`, error);
  }
}

/**
 * `signup.pending_approval` — e-mail já confirmado, falta um admin aprovar em
 * `/admin/usuarios`. Avisa in-app quem tem `user:manage` — não é sobre uma obra,
 * então não segue `resolveRecipients` (que é por departamento/equipe da obra).
 */
async function dispatchSignupPendingApproval(organizationId: string, payload: EventPayload): Promise<void> {
  if (!payload.name || !payload.email) return;

  const admins = await prisma.membership.findMany({
    where: {
      organizationId,
      isActive: true,
      role: { permissions: { some: { permission: { key: PERMISSIONS.USER_MANAGE } } } },
    },
    select: { userId: true },
  });
  if (admins.length === 0) return;

  await prisma.notification.createMany({
    data: admins.map((a) => ({
      organizationId,
      userId: a.userId,
      type: DOMAIN_EVENTS.SIGNUP_PENDING_APPROVAL,
      title: "Novo cadastro aguardando aprovação",
      body: `${payload.name} (${payload.email}) confirmou o e-mail e espera liberação de acesso.`,
      linkUrl: "/admin/usuarios",
    })),
  });
}

export async function processOutbox(limit = 50): Promise<number> {
  const events = await prisma.outboxEvent.findMany({
    where: { status: "PENDING", availableAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let processed = 0;

  for (const event of events) {
    try {
      const payload = event.payload as unknown as EventPayload;

      if (event.type === DOMAIN_EVENTS.STAFF_ASSIGNED) {
        await dispatchStaffAssignedEmail(payload);
      } else if (event.type === DOMAIN_EVENTS.EMAIL_VERIFICATION_REQUESTED) {
        await dispatchEmailVerificationEmail(payload);
      } else if (event.type === DOMAIN_EVENTS.SIGNUP_PENDING_APPROVAL) {
        await dispatchSignupPendingApproval(event.organizationId, payload);
      } else {
        const recipients = await resolveRecipients(event.organizationId, event.type as DomainEventType, payload);
        const { title, body } = describe(event.type, payload);

        if (recipients.length > 0) {
          await prisma.notification.createMany({
            data: recipients.map((userId) => ({
              organizationId: event.organizationId,
              userId,
              type: event.type,
              title,
              body,
              linkUrl: `/obras/${payload.projectId}`,
            })),
          });

          await dispatchWhatsApp(event.type as DomainEventType, recipients, title, body);
        }
      }

      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: "DONE", processedAt: new Date(), attempts: { increment: 1 } },
      });
      processed += 1;
    } catch (error) {
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: event.attempts >= 4 ? "FAILED" : "PENDING",
          attempts: { increment: 1 },
          error: error instanceof Error ? error.message : String(error),
          // Backoff exponencial simples.
          availableAt: new Date(Date.now() + 2 ** event.attempts * 60_000),
        },
      });
    }
  }

  return processed;
}
