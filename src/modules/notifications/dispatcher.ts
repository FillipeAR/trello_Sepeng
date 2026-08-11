import { prisma } from "@/server/db";
import { getAppUrl } from "@/lib/url";
import { DOMAIN_EVENTS, type DomainEventType } from "@/server/outbox";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { resolveChannelEnabled } from "@/core/notifications/preferences";
import { describe, type EventPayload } from "@/core/notifications/describe";
import { createAutoNewsPost } from "@/modules/news/commands";
import { sendWhatsAppMessage } from "./whatsapp";
import { sendEmail } from "./email";

/**
 * Worker do outbox. Entrega notificação in-app (sempre) e WhatsApp
 * (opt-in, ver `resolveChannelEnabled`) — e-mail entra do mesmo jeito quando
 * for a vez dele. Falha ao enviar WhatsApp pra um destinatário não derruba o
 * evento inteiro: se derrubasse, o retry recriaria as notificações in-app já
 * gravadas via `createMany` (não é idempotente a esse nível).
 */

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
    // `prefs` é o lote de todos os destinatários — filtra pro usuário desta
    // iteração antes de resolver, senão a preferência de um usuário vaza pra
    // outro que nunca configurou nada (resolveChannelEnabled não sabe de quem
    // é cada linha, só recebe o que já veio filtrado).
    const userPrefs = prefs.filter((p) => p.userId === user.id);
    const enabled = resolveChannelEnabled(userPrefs, type, "WHATSAPP", { hasPhone: Boolean(user.phone) });
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
 * `project.created` — além do fluxo genérico (notificação in-app pro
 * departamento dono da etapa inicial + equipe alocada), toda obra nova
 * também avisa por e-mail uma lista fixa curada por admin
 * (`ExternalNotificationRecipient`, `/admin/avisos-externos`) — gente que
 * precisa saber que uma obra foi ganha mesmo sem ter login ou departamento
 * no sistema. Incondicional, mesmo padrão de `dispatchStaffAssignedEmail`
 * (não é opt-in por usuário).
 */
async function dispatchExternalProjectCreatedEmail(
  organizationId: string,
  payload: EventPayload,
): Promise<void> {
  const recipients = await prisma.externalNotificationRecipient.findMany({
    where: { organizationId, deletedAt: null },
    select: { email: true, name: true },
  });
  if (recipients.length === 0) return;

  const subject = `Obra ganha: ${payload.projectName}`;
  const html = `
    <p>Olá,</p>
    <p>A obra <strong>${payload.projectName}</strong> (${payload.projectCode}) acaba de ser
    cadastrada no ObraFlow — status "${payload.displayStatus ?? "Obra Ganha"}".</p>
    <p>Este é um aviso informativo — você não precisa acessar o sistema.</p>
  `;

  for (const recipient of recipients) {
    try {
      await sendEmail(recipient.email, subject, html);
    } catch (error) {
      console.error(`Falha ao enviar e-mail de obra ganha (contato ${recipient.email}):`, error);
    }
  }
}

/**
 * `stage.milestone_reached` — além do fluxo genérico (mesma notificação in-app
 * que `stage.entered` já geraria), publica automaticamente no Jornal Sepeng
 * quando a etapa alvo está marcada como marco (`WorkflowStage.postsToJournal`).
 * `createAutoNewsPost` é idempotente por `sourceEventId` — reprocessar este
 * evento não duplica o post.
 */
async function dispatchStageMilestoneNews(
  organizationId: string,
  eventId: string,
  payload: EventPayload,
): Promise<void> {
  if (!payload.actorId) return;

  const { title, body } = describe(DOMAIN_EVENTS.STAGE_MILESTONE_REACHED, payload);

  try {
    await createAutoNewsPost({
      organizationId,
      authorId: payload.actorId,
      sourceEventId: eventId,
      title,
      body,
    });
  } catch (error) {
    console.error(`Falha ao publicar post automático no Jornal (evento ${eventId}):`, error);
  }
}

/**
 * `news.published` — não segue `resolveRecipients` (que é escopado a
 * departamento/equipe de uma obra específica; o Jornal é org-wide) nem gera
 * `Notification` in-app (a página /jornal já é a superfície de leitura
 * "pull"). Só e-mail, só pra quem ligou a preferência em `/notificacoes`
 * (opt-in — sem linha explícita, `resolveChannelEnabled` mantém desligado).
 */
async function dispatchNewsEmail(organizationId: string, payload: EventPayload): Promise<void> {
  if (!payload.newsPostId) return;

  const post = await prisma.newsPost.findUnique({
    where: { id: payload.newsPostId },
    select: { title: true, body: true },
  });
  if (!post) return;

  const members = await prisma.membership.findMany({
    where: { organizationId, isActive: true },
    select: { userId: true },
  });
  if (members.length === 0) return;

  const userIds = members.map((m) => m.userId);
  const [users, prefs] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }),
    prisma.notificationPreference.findMany({
      where: { userId: { in: userIds }, eventType: DOMAIN_EVENTS.NEWS_PUBLISHED, channel: "EMAIL" },
    }),
  ]);

  const subject = `Jornal Sepeng: ${post.title}`;
  const html = `
    <h2>${post.title}</h2>
    <div>${post.body}</div>
  `;

  for (const user of users) {
    const userPrefs = prefs.filter((p) => p.userId === user.id);
    const enabled = resolveChannelEnabled(userPrefs, DOMAIN_EVENTS.NEWS_PUBLISHED, "EMAIL", { hasPhone: true });
    if (!enabled) continue;
    try {
      await sendEmail(user.email, subject, html);
    } catch (error) {
      console.error(`Falha ao enviar e-mail do Jornal (usuário ${user.id}):`, error);
    }
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
      } else if (event.type === DOMAIN_EVENTS.NEWS_PUBLISHED) {
        await dispatchNewsEmail(event.organizationId, payload);
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

        if (event.type === DOMAIN_EVENTS.PROJECT_CREATED) {
          await dispatchExternalProjectCreatedEmail(event.organizationId, payload);
        }

        if (event.type === DOMAIN_EVENTS.STAGE_MILESTONE_REACHED) {
          await dispatchStageMilestoneNews(event.organizationId, event.id, payload);
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
