import { redirect } from "next/navigation";
import { requireActor } from "@/server/actor";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { listSuppliers } from "@/modules/procurement/queries";
import { SuppliersList } from "./SuppliersList";

export default async function FornecedoresPage() {
  const actor = await requireActor();
  if (!actor.permissions.includes(PERMISSIONS.PROCUREMENT_MANAGE)) redirect("/dashboard");

  const suppliers = await listSuppliers(actor);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fornecedores</h1>
        <p className="text-sm text-muted">
          Cadastro de fornecedores da organização — aparecem como opção ao registrar um pedido
          de compra em qualquer obra.
        </p>
      </div>

      <SuppliersList suppliers={suppliers} />
    </div>
  );
}
