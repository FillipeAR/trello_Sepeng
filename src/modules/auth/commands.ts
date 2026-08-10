import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { DOMAIN_EVENTS, enqueueEvent } from "@/server/outbox";
import { CommandError } from "@/modules/projects/commands";

/**
 * Cadastro próprio (`/cadastro`) — sem `actor`, quem cria a própria conta
 * ainda não tem identidade nenhuma no sistema. Conta nasce em dois estados
 * pendentes, sem nenhuma trava pra pular: `emailVerifiedAt: null` (precisa
 * confirmar o link) e `Membership.isActive: false` (precisa de aprovação de
 * um admin em `/admin/usuarios`, mesmo toggle de sempre — `setUserActive`).
 * Só entra com as duas coisas resolvidas.
 *
 * Organização é resolvida por `findFirstOrThrow` — hoje só existe uma
 * (Sepeng), mesma simplificação pragmática que todo script de migração desta
 * base já assume (`slug: "sepeng"`). Se um dia existir mais de uma
 * organização de verdade, este é o primeiro lugar a revisar.
 */

const VERIFICATION_TOKEN_TTL_HOURS = 24;

const signUpSchema = z
  .object({
    name: z.string().min(2, "Informe o nome."),
    email: z.string().email("E-mail inválido."),
    password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export async function signUp(input: { data: unknown }) {
  const data = signUpSchema.parse(input.data);
  const email = data.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new CommandError("E-mail já cadastrado.", {
      errors: ["Já existe uma conta com este e-mail. Use \"Entrar\" ou fale com um administrador."],
      fieldErrors: [{ fieldKey: "email", message: "Já existe uma conta com este e-mail." }],
    });
  }

  const org = await prisma.organization.findFirstOrThrow();
  const role = await prisma.role.findFirstOrThrow({ where: { organizationId: org.id, slug: "visualizador" } });

  const passwordHash = await bcrypt.hash(data.password, 10);
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 3_600_000);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: data.name, email, passwordHash, emailVerifiedAt: null },
    });

    await tx.membership.create({
      data: { organizationId: org.id, userId: user.id, roleId: role.id, departmentId: null, isActive: false },
    });

    await tx.emailVerificationToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    await writeAudit(tx, {
      organizationId: org.id,
      actorId: null,
      action: "user.signed_up",
      entityType: "User",
      entityId: user.id,
      summary: `"${user.name}" (${email}) criou a própria conta — aguardando confirmação de e-mail e aprovação.`,
      after: { name: user.name, email: user.email },
    });

    await enqueueEvent(tx, {
      organizationId: org.id,
      type: DOMAIN_EVENTS.EMAIL_VERIFICATION_REQUESTED,
      payload: { userId: user.id, name: user.name, email: user.email, token },
      idempotencyKey: `email-verification:${user.id}`,
    });

    return { email: user.email };
  });
}

export async function verifyEmail(input: { token: string }) {
  const record = await prisma.emailVerificationToken.findUnique({
    where: { token: input.token },
    include: { user: { include: { memberships: true } } },
  });

  if (!record) {
    throw new CommandError("Link inválido.", { errors: ["Este link de confirmação não existe."] });
  }
  if (record.usedAt) {
    throw new CommandError("Link já usado.", { errors: ["Este link de confirmação já foi usado."] });
  }
  if (record.expiresAt < new Date()) {
    throw new CommandError("Link expirado.", {
      errors: ["Este link de confirmação expirou. Cadastre-se novamente para receber um novo."],
    });
  }

  const organizationId = record.user.memberships[0]?.organizationId;
  if (!organizationId) {
    throw new CommandError("Conta inconsistente.", { errors: ["Esta conta não tem organização associada."] });
  }

  return prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

    const user = await tx.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    });

    await writeAudit(tx, {
      organizationId,
      actorId: null,
      action: "user.email_verified",
      entityType: "User",
      entityId: user.id,
      summary: `"${user.name}" confirmou o e-mail — falta aprovação de um administrador.`,
      after: { emailVerifiedAt: user.emailVerifiedAt },
    });

    await enqueueEvent(tx, {
      organizationId,
      type: DOMAIN_EVENTS.SIGNUP_PENDING_APPROVAL,
      payload: { userId: user.id, name: user.name, email: user.email },
      idempotencyKey: `signup-pending-approval:${user.id}`,
    });

    return { name: user.name, email: user.email };
  });
}
