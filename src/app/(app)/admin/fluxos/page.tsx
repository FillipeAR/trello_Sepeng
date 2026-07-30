import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/actor";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { prisma } from "@/server/db";
import { getActiveWorkflowVersionId, loadSnapshot } from "@/modules/workflow/snapshot";
import { createDraftVersionAction } from "./actions";

export default async function FluxosPage() {
  const actor = await requireActor();
  if (!actor.permissions.includes(PERMISSIONS.WORKFLOW_READ)) redirect("/dashboard");
  const canManage = actor.permissions.includes(PERMISSIONS.WORKFLOW_MANAGE);

  const versionId = await getActiveWorkflowVersionId(actor.organizationId);
  const snapshot = await loadSnapshot(versionId);

  const departments = await prisma.department.findMany({
    where: { organizationId: actor.organizationId },
    select: { id: true, name: true },
  });
  const deptName = new Map(departments.map((d) => [d.id, d.name]));

  const versions = await prisma.workflowVersion.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: { version: "desc" },
    include: { definition: { select: { name: true } }, _count: { select: { instances: true } } },
  });

  const definition = await prisma.workflowDefinition.findFirst({
    where: { organizationId: actor.organizationId, isDefault: true, deletedAt: null },
    select: { id: true },
  });
  const draft = versions.find((v) => v.status === "DRAFT");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fluxo de trabalho</h1>
          <p className="text-sm text-muted">
            Etapas, campos e ações são configuração — não código. Reordenar ou inserir um
            departamento novo não exige deploy.
          </p>
        </div>

        {canManage && definition ? (
          draft ? (
            <Link href={`/admin/fluxos/${draft.id}/editar`} className="btn-primary">
              Continuar rascunho (v{draft.version})
            </Link>
          ) : (
            <form action={createDraftVersionAction}>
              <input type="hidden" name="definitionId" value={definition.id} />
              <button type="submit" className="btn-primary">
                Criar rascunho do fluxo
              </button>
            </form>
          )
        ) : null}
      </div>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">Versões</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="pb-2 font-medium">Fluxo</th>
              <th className="pb-2 font-medium">Versão</th>
              <th className="pb-2 font-medium">Situação</th>
              <th className="pb-2 text-right font-medium">Obras travadas nesta versão</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className="border-t border-border">
                <td className="py-2">{v.definition.name}</td>
                <td className="py-2 font-mono text-xs">v{v.version}</td>
                <td className="py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      v.status === "PUBLISHED"
                        ? "bg-success/10 text-success"
                        : v.status === "DRAFT"
                          ? "bg-warning/10 text-warning"
                          : "bg-surface-muted text-muted"
                    }`}
                  >
                    {v.status === "PUBLISHED" ? "Publicada" : v.status === "DRAFT" ? "Rascunho" : "Arquivada"}
                  </span>
                </td>
                <td className="py-2 text-right">{v._count.instances}</td>
                <td className="py-2 text-right">
                  {canManage && v.status === "DRAFT" ? (
                    <Link href={`/admin/fluxos/${v.id}/editar`} className="text-xs font-medium text-primary hover:underline">
                      Editar
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Etapas da versão publicada (v{snapshot.version})</h2>
        {snapshot.stages.map((stage) => (
          <div key={stage.id} className="card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
                  style={{ backgroundColor: `${stage.color}1a`, color: stage.color }}
                >
                  {stage.order + 1}
                </span>
                <div>
                  <span className="font-medium">{stage.name}</span>
                  <span className="ml-2 text-xs text-muted">
                    status “{stage.displayStatus}”
                  </span>
                </div>
              </div>
              <div className="text-xs text-muted">
                {stage.departmentId ? deptName.get(stage.departmentId) : "Sem departamento"}
                {stage.slaHours ? ` · SLA ${stage.slaHours}h` : " · sem SLA"}
                {stage.isInitial ? " · inicial" : ""}
                {stage.isFinal ? " · final" : ""}
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                  Campos ({stage.fields.length})
                </div>
                <ul className="space-y-1 text-xs">
                  {stage.fields.length === 0 ? (
                    <li className="text-muted">Nenhum campo configurado.</li>
                  ) : (
                    stage.fields.map((f) => (
                      <li key={f.id} className="flex justify-between gap-2">
                        <span>
                          {f.label}
                          {f.required ? <span className="text-danger"> *</span> : null}
                        </span>
                        <span className="font-mono text-muted">{f.type}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                  Ações ({stage.actions.length})
                </div>
                <ul className="space-y-1 text-xs">
                  {stage.actions.map((a) => (
                    <li key={a.id} className="flex justify-between gap-2">
                      <span>{a.label}</span>
                      <span className="font-mono text-muted">
                        {a.kind}
                        {a.requiresComment ? " · justificativa" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </section>

      {canManage ? (
        <p className="text-xs text-muted">
          Crie um rascunho para editar etapas, campos e ações pela tela. Publicar gera uma nova
          versão imutável — obras em andamento continuam na versão em que entraram.
        </p>
      ) : null}
    </div>
  );
}
