import { redirect } from "next/navigation";
import { requireActor } from "@/server/actor";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { listUsers, listRolesAndDepartments } from "@/modules/users/queries";
import { UsersList } from "./UsersList";

export default async function UsuariosPage() {
  const actor = await requireActor();
  if (!actor.permissions.includes(PERMISSIONS.USER_MANAGE)) redirect("/dashboard");

  const [users, { roles, departments }] = await Promise.all([
    listUsers(actor),
    listRolesAndDepartments(actor.organizationId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted">
          Contas de login da organização. Cada setor pode ter mais de uma pessoa com acesso
          próprio — não é mais preciso compartilhar um único login por departamento.
        </p>
      </div>

      <UsersList users={users} roles={roles} departments={departments} currentUserId={actor.userId} />
    </div>
  );
}
