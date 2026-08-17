import bcrypt from "bcryptjs";
import { z } from "zod";
import { hasPermission } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { CommandError } from "@/modules/projects/commands";
import { enqueueUserCredentialsEvent } from "./notify";

/**
 * Contas de login (`User` + `Membership`) por setor. Antes só existiam via
 * `prisma/seed.ts` — um login compartilhado por departamento. Esta tela deixa
 * o administrador criar quantas contas nomeadas quiser por setor.
 */

function requireManage(actor: SessionContext) {
  if (!hasPermission(actor, PERMISSIONS.USER_MANAGE)) {
    throw new CommandError("Você não tem permissão para gerenciar usuários.", {
      errors: ["Permissão user:manage ausente."],
    });
  }
}

const createUserSchema = z.object({
  name: z.string().min(2, "Informe o nome."),
  email: z.string().email("E-mail inválido."),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
  roleId: z.string().min(1, "Selecione um papel."),
  departmentId: z.string().optional().nullable(),
});

const updateUserSchema = z.object({
  name: z.string().min(2, "Informe o nome."),
  roleId: z.string().min(1, "Selecione um papel."),
  departmentId: z.string().optional().nullable(),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres.").optional().or(z.literal("")),
});

async function assertRoleAndDepartment(
  organizationId: string,
  roleId: string,
  departmentId: string | null | undefined,
) {
  const role = await prisma.role.findFirst({ where: { id: roleId, organizationId } });
  if (!role) {
    throw new CommandError("Papel inválido.", { errors: ["Papel não encontrado nesta organização."] });
  }
  if (departmentId) {
    const department = await prisma.department.findFirst({
      where: { id: departmentId, organizationId, deletedAt: null },
    });
    if (!department) {
      throw new CommandError("Departamento inválido.", {
        errors: ["Departamento não encontrado nesta organização."],
      });
    }
  }
  return role;
}

export async function createUser(actor: SessionContext, input: { data: unknown }) {
  requireManage(actor);
  const data = createUserSchema.parse(input.data);
  const email = data.email.trim().toLowerCase();

  const role = await assertRoleAndDepartment(actor.organizationId, data.roleId, data.departmentId);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new CommandError("E-mail já cadastrado.", {
      errors: ["Já existe uma conta com este e-mail."],
      fieldErrors: [{ fieldKey: "email", message: "Já existe uma conta com este e-mail." }],
    });
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      // Admin criou = admin está vouching pelo e-mail. Sem isso, conta criada aqui
      // ficaria bloqueada no login pela mesma checagem que existe pro cadastro
      // próprio (`src/modules/auth/commands.ts:signUp`).
      data: { name: data.name, email, passwordHash, emailVerifiedAt: new Date() },
    });

    await tx.membership.create({
      data: {
        organizationId: actor.organizationId,
        userId: user.id,
        roleId: role.id,
        departmentId: data.departmentId || null,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "user.created",
      entityType: "User",
      entityId: user.id,
      summary: `Usuário "${user.name}" (${email}) criado com papel "${role.name}".`,
      after: { name: user.name, email: user.email, roleId: role.id, departmentId: data.departmentId ?? null },
    });

    await enqueueUserCredentialsEvent(tx, {
      organizationId: actor.organizationId,
      userId: user.id,
      name: user.name,
      email: user.email,
      password: data.password,
      reason: "created",
    });

    return user;
  });
}

export async function updateUser(actor: SessionContext, input: { userId: string; data: unknown }) {
  requireManage(actor);
  const data = updateUserSchema.parse(input.data);

  const membership = await prisma.membership.findFirst({
    where: { userId: input.userId, organizationId: actor.organizationId },
    include: { user: true, role: true },
  });
  if (!membership) {
    throw new CommandError("Usuário não encontrado.", { errors: ["Usuário inexistente nesta organização."] });
  }

  const role = await assertRoleAndDepartment(actor.organizationId, data.roleId, data.departmentId);

  return prisma.$transaction(async (tx) => {
    const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : undefined;

    const user = await tx.user.update({
      where: { id: membership.userId },
      data: { name: data.name, ...(passwordHash ? { passwordHash } : {}) },
    });

    await tx.membership.update({
      where: { id: membership.id },
      data: { roleId: role.id, departmentId: data.departmentId || null },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "user.updated",
      entityType: "User",
      entityId: user.id,
      summary: `Usuário "${user.name}" atualizado.${passwordHash ? " Senha redefinida." : ""}`,
      before: { name: membership.user.name, roleId: membership.roleId, departmentId: membership.departmentId },
      after: { name: user.name, roleId: role.id, departmentId: data.departmentId ?? null },
    });

    if (passwordHash && data.password) {
      await enqueueUserCredentialsEvent(tx, {
        organizationId: actor.organizationId,
        userId: user.id,
        name: user.name,
        email: user.email,
        password: data.password,
        reason: "password_reset",
      });
    }

    return user;
  });
}

export async function setUserActive(actor: SessionContext, input: { userId: string; isActive: boolean }) {
  requireManage(actor);

  if (input.userId === actor.userId && !input.isActive) {
    throw new CommandError("Você não pode desativar a própria conta.", {
      errors: ["Peça para outro administrador desativar sua conta, se necessário."],
    });
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: input.userId, organizationId: actor.organizationId },
    include: { user: true },
  });
  if (!membership) {
    throw new CommandError("Usuário não encontrado.", { errors: ["Usuário inexistente nesta organização."] });
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.membership.update({
      where: { id: membership.id },
      data: { isActive: input.isActive },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: input.isActive ? "user.activated" : "user.deactivated",
      entityType: "User",
      entityId: membership.userId,
      summary: `Usuário "${membership.user.name}" ${input.isActive ? "reativado" : "desativado"}.`,
      before: { isActive: membership.isActive },
      after: { isActive: updated.isActive },
    });

    return updated;
  });
}
