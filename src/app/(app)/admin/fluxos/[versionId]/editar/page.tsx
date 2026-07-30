import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/server/actor";
import { PERMISSIONS, PERMISSION_CATALOG } from "@/core/rbac/permissions";
import { prisma } from "@/server/db";
import { StageCard } from "./StageCard";
import { NewStageForm } from "./NewStageForm";
import { PublishBar } from "./PublishBar";

export default async function EditarFluxoPage({
  params,
}: {
  params: Promise<{ versionId: string }>;
}) {
  const actor = await requireActor();
  if (!actor.permissions.includes(PERMISSIONS.WORKFLOW_MANAGE)) redirect("/admin/fluxos");

  const { versionId } = await params;

  const version = await prisma.workflowVersion.findFirst({
    where: { id: versionId, organizationId: actor.organizationId },
    include: {
      definition: { select: { name: true } },
      stages: {
        orderBy: { order: "asc" },
        include: {
          fields: { orderBy: { order: "asc" } },
          actions: { orderBy: { order: "asc" } },
        },
      },
    },
  });
  if (!version) notFound();

  // Versão publicada/arquivada é imutável — a leitura vive em /admin/fluxos.
  if (version.status !== "DRAFT") redirect("/admin/fluxos");

  const departments = await prisma.department.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const stageOptions = version.stages.map((s) => ({ id: s.id, name: s.name }));
  const permissionOptions = PERMISSION_CATALOG.filter((p) => p.category === "Fluxo");

  return (
    <div className="space-y-6 pb-16">
      <div>
        <Link href="/admin/fluxos" className="text-xs text-muted hover:underline">
          ← Fluxos
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {version.definition.name} · v{version.version}
        </h1>
        <p className="text-sm text-muted">
          Etapas, campos e ações deste rascunho. Nada aqui afeta obras em andamento.
        </p>
      </div>

      <PublishBar
        versionId={version.id}
        version={version.version}
        notes={version.notes ?? ""}
        stageCount={version.stages.length}
      />

      <div className="space-y-4">
        {version.stages.map((stage, index) => (
          <StageCard
            key={stage.id}
            versionId={version.id}
            stage={stage}
            index={index}
            isFirst={index === 0}
            isLast={index === version.stages.length - 1}
            departments={departments}
            stageOptions={stageOptions.filter((s) => s.id !== stage.id)}
            permissionOptions={permissionOptions}
          />
        ))}
      </div>

      <NewStageForm versionId={version.id} departments={departments} />
    </div>
  );
}
