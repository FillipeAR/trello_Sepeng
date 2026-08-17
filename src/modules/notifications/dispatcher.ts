import { prisma } from "@/server/db";
import { getAppUrl } from "@/lib/url";
import { DOMAIN_EVENTS, type DomainEventType } from "@/server/outbox";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { resolveChannelEnabled } from "@/core/notifications/preferences";
import { describe, type EventPayload } from "@/core/notifications/describe";
import { sendWhatsAppMessage } from "./whatsapp";
import { sendEmail } from "./email";
import { triggerObraGanhaRoutine } from "./sinricpro";

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
 * Base pra todo e-mail opt-in org-wide (ex.: Obra Ganha): destinatário é
 * qualquer usuário com login (não uma lista externa curada), filtrado pela
 * própria preferência em `/notificacoes` — sem linha explícita, fica
 * desligado (`resolveChannelEnabled`). Não usa `resolveRecipients` (escopado
 * a departamento/equipe de uma obra; este evento é org-wide).
 * `prefs` vem em lote pra todos os membros, mas é filtrado por usuário antes
 * de resolver — mesmo cuidado de `dispatchWhatsApp`, senão a preferência de
 * um vaza pra outro que nunca configurou nada.
 */
async function dispatchOptInEmail(
  organizationId: string,
  eventType: DomainEventType,
  subject: string,
  html: string,
): Promise<void> {
  const members = await prisma.membership.findMany({
    where: { organizationId, isActive: true },
    select: { userId: true },
  });
  if (members.length === 0) return;

  const userIds = members.map((m) => m.userId);
  const [users, prefs] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }),
    prisma.notificationPreference.findMany({
      where: { userId: { in: userIds }, eventType, channel: "EMAIL" },
    }),
  ]);

  for (const user of users) {
    const userPrefs = prefs.filter((p) => p.userId === user.id);
    const enabled = resolveChannelEnabled(userPrefs, eventType, "EMAIL", { hasPhone: true });
    if (!enabled) continue;
    try {
      await sendEmail(user.email, subject, html);
    } catch (error) {
      console.error(`Falha ao enviar e-mail (evento ${eventType}, usuário ${user.id}):`, error);
    }
  }
}

/**
 * `project.created` por e-mail — opt-in por usuário em `/notificacoes`
 * (ver `EMAIL_EVENTS` em `queries.ts`), não uma lista externa curada por
 * admin. Além do fluxo genérico (notificação in-app pro departamento dono
 * da etapa inicial + equipe alocada), que continua intocado.
 */
async function dispatchProjectCreatedEmail(organizationId: string, payload: EventPayload): Promise<void> {
  const subject = `Obra ganha: ${payload.projectName}`;
  const html = `
    <p>A obra <strong>${payload.projectName}</strong> (${payload.projectCode}) acaba de ser
    cadastrada no ObraFlow — status "${payload.displayStatus ?? "Obra Ganha"}".</p>
  `;
  await dispatchOptInEmail(organizationId, DOMAIN_EVENTS.PROJECT_CREATED, subject, html);
}

/**
 * `project.created` → rotina da Alexa do escritório (via SinricPro, ver
 * `sinricpro.ts`). Nunca lança: uma falha aqui (credencial ausente, API
 * fora do ar) não deve derrubar o evento nem os outros efeitos colaterais
 * de "obra ganha" — mesmo padrão de "falha no WhatsApp não derruba o
 * evento" já usado no resto deste worker.
 */
async function dispatchAlexaRoutine(): Promise<void> {
  try {
    await triggerObraGanhaRoutine();
  } catch (error) {
    console.error("Falha ao acionar rotina da Alexa (SinricPro):", error);
  }
}

/**
 * `user.credentials_issued` — conta criada ou senha redefinida por um admin em
 * `/admin/usuarios`. A pessoa ainda não consegue logar até receber a senha (e
 * `Notification` in-app exigiria ela já estar logada, contraditório aqui), então
 * o aviso só chega por e-mail — nunca passa pela preferência opt-in (não é
 * opcional, é a própria credencial de acesso).
 *
 * A senha em texto puro só existe no payload até este ponto: depois de
 * confirmar o envio, `eventId` é usado pra redigir o campo diretamente no
 * `OutboxEvent` (ele não é apagado, então sem isso a senha ficaria em texto
 * puro na tabela pra sempre).
 */
async function dispatchUserCredentialsEmail(eventId: string, payload: EventPayload): Promise<void> {
  if (!payload.email || !payload.password) return;

  const isReset = payload.reason === "password_reset";
  const subject = isReset ? "Sua senha no ObraFlow foi redefinida" : "Sua conta no ObraFlow foi criada";
  const loginUrl = `${getAppUrl()}/login`;
  const html = `
    <p>Olá, ${payload.name ?? ""},</p>
    <p>${isReset ? "Um administrador redefiniu a senha da sua conta no ObraFlow." : "Um administrador criou uma conta pra você no ObraFlow."}</p>
    <p>E-mail: <strong>${payload.email}</strong><br>
    Senha: <strong>${payload.password}</strong></p>
    <p><a href="${loginUrl}">${loginUrl}</a></p>
    <p>Se quiser trocar a senha depois, peça a um administrador.</p>
  `;

  try {
    await sendEmail(payload.email, subject, html);
    await prisma.outboxEvent.update({
      where: { id: eventId },
      data: { payload: { ...payload, password: "[enviado — redigido após o envio]" } },
    });
  } catch (error) {
    console.error(`Falha ao enviar e-mail de credenciais (usuário ${payload.userId}):`, error);
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
      } else if (event.type === DOMAIN_EVENTS.USER_CREDENTIALS_ISSUED) {
        await dispatchUserCredentialsEmail(event.id, payload);
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
          await dispatchProjectCreatedEmail(event.organizationId, payload);
          await dispatchAlexaRoutine();
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
