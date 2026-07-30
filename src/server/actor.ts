import { cache } from "react";
import { redirect } from "next/navigation";
import type { Actor } from "@/core/rbac/can";
import { auth } from "./auth";
import { prisma } from "./db";

export interface SessionContext extends Actor {
  userName: string;
  userEmail: string;
  organizationName: string;
  departmentName: string | null;
  roleName: string;
}

/**
 * Identidade efetiva do usuário na organização ativa. Memoizado por request —
 * todo Server Component pode chamar sem multiplicar queries.
 */
export const getActor = cache(async (): Promise<SessionContext | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, isActive: true },
    include: {
      user: true,
      organization: true,
      department: true,
      role: { include: { permissions: { include: { permission: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) return null;

  return {
    userId: membership.userId,
    organizationId: membership.organizationId,
    roleSlug: membership.role.slug,
    departmentId: membership.departmentId,
    permissions: membership.role.permissions.map((rp) => rp.permission.key),
    userName: membership.user.name,
    userEmail: membership.user.email,
    organizationName: membership.organization.name,
    departmentName: membership.department?.name ?? null,
    roleName: membership.role.name,
  };
});

/** Para páginas protegidas: devolve o ator ou manda para o login. */
export async function requireActor(): Promise<SessionContext> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}
