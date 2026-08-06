import type { SessionContext } from "@/server/actor";
import { prisma } from "@/server/db";

/** Contas de login da organização, com papel e departamento atuais. */
export async function listUsers(actor: SessionContext) {
  const memberships = await prisma.membership.findMany({
    where: { organizationId: actor.organizationId },
    include: { user: true, role: true, department: true },
    orderBy: { user: { name: "asc" } },
  });

  return memberships
    .filter((m) => !m.user.deletedAt)
    .map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      isActive: m.isActive,
      roleId: m.roleId,
      roleName: m.role.name,
      departmentId: m.departmentId,
      departmentName: m.department?.name ?? null,
    }));
}

export async function listRolesAndDepartments(organizationId: string) {
  const [roles, departments] = await Promise.all([
    prisma.role.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.department.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return { roles, departments };
}
