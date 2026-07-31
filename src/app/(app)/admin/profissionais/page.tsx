import { redirect } from "next/navigation";
import { requireActor } from "@/server/actor";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { listProfessionals } from "@/modules/staff/queries";
import { ProfessionalsList } from "./ProfessionalsList";

export default async function ProfissionaisPage() {
  const actor = await requireActor();
  if (!actor.permissions.includes(PERMISSIONS.STAFF_MANAGE)) redirect("/dashboard");

  const professionals = await listProfessionals(actor);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Engenheiros e encarregados</h1>
        <p className="text-sm text-muted">
          Cadastro de profissionais de campo — não precisam de login no sistema. Aparecem
          como opção nos campos &quot;Gerente responsável&quot; e &quot;Encarregado responsável&quot; da obra.
        </p>
      </div>

      <ProfessionalsList professionals={professionals} />
    </div>
  );
}
