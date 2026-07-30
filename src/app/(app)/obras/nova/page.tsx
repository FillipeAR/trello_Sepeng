import { redirect } from "next/navigation";
import { requireActor } from "@/server/actor";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { NewProjectForm } from "./NewProjectForm";

export default async function NovaObraPage() {
  const { getActor } = await import("@/server/actor");
  const debugActor = await getActor();
  if (!debugActor) {
    return <div style={{ padding: 40, fontSize: 20 }}>DEBUG: página viu getActor() = null</div>;
  }
  const actor = debugActor;
  if (!actor.permissions.includes(PERMISSIONS.PROJECT_CREATE)) redirect("/obras");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nova obra</h1>
        <p className="text-sm text-muted">
          Ao concluir o cadastro, a obra entra na esteira com o status{" "}
          <strong>Obra Ganha</strong> e segue para a Diretoria.
        </p>
      </div>
      <NewProjectForm />
    </div>
  );
}
