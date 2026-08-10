import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/server/actor";
import { prisma } from "@/server/db";
import { hasPermission } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { getTeamStructure } from "@/modules/team/queries";
import { getPendingExternalCompletion } from "@/modules/projects/queries";
import { TeamPageShell } from "@/modules/team/components/TeamPageShell";

export default async function EquipeDaObraPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, organizationId: actor.organizationId, deletedAt: null },
    select: { id: true, name: true, code: true },
  });
  if (!project) notFound();

  const structure = await getTeamStructure(actor, project.id);
  if (!structure) notFound();

  const pendingCompletion = await getPendingExternalCompletion(actor, project.id, "equipe");
  const canSendTeam = structure.positions.some((p) => p.professionalId);

  return (
    <div className="flex h-[calc(100vh-5.5rem)] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted">
            <Link href="/obras" className="hover:text-primary">
              Obras
            </Link>{" "}
            /{" "}
            <Link href={`/obras/${project.id}`} className="hover:text-primary">
              {project.name}
            </Link>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Estrutura da Equipe da Obra</h1>
        </div>
        <Link href={`/obras/${project.id}`} className="btn-ghost text-xs">
          Voltar pra obra
        </Link>
      </div>

      <TeamPageShell
        projectId={project.id}
        positions={structure.positions}
        occupantByPositionId={structure.occupantByPositionId}
        professionals={structure.professionals}
        canManage={hasPermission(actor, PERMISSIONS.STAFF_MANAGE)}
        pendingCompletion={pendingCompletion}
        canSendTeam={canSendTeam}
      />
    </div>
  );
}
