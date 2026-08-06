import { redirect } from "next/navigation";
import { requireActor } from "@/server/actor";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { listOrgChartPositions } from "@/modules/orgchart/queries";
import { OrgChartEditor } from "./OrgChartEditor";

export default async function OrganogramaPage() {
  const actor = await requireActor();
  if (!actor.permissions.includes(PERMISSIONS.STAFF_MANAGE)) redirect("/dashboard");

  const positions = await listOrgChartPositions(actor);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organograma</h1>
        <p className="text-sm text-muted">
          Template de cargos da empresa — adicione, renomeie, reordene ou remova à vontade.
          Em cada obra, a diretoria escolhe qual profissional ocupa cada cargo (aba
          &quot;Organograma&quot; da obra).
        </p>
      </div>

      <OrgChartEditor positions={positions} />
    </div>
  );
}
