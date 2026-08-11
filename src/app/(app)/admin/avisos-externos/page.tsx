import { redirect } from "next/navigation";
import { requireActor } from "@/server/actor";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { listExternalRecipients } from "@/modules/recipients/queries";
import { ExternalRecipientsList } from "./ExternalRecipientsList";

export default async function AvisosExternosPage() {
  const actor = await requireActor();
  if (!actor.permissions.includes(PERMISSIONS.RECIPIENTS_MANAGE)) redirect("/dashboard");

  const recipients = await listExternalRecipients(actor);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Avisos de obra ganha</h1>
        <p className="text-sm text-muted">
          Toda vez que uma obra nova é cadastrada (&quot;Obra Ganha&quot;), todo mundo nesta lista recebe
          um e-mail de aviso — independente de ter login no sistema ou de estar em algum
          departamento.
        </p>
      </div>

      <ExternalRecipientsList recipients={recipients} />
    </div>
  );
}
