import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/server/actor";
import { prisma } from "@/server/db";
import { hasPermission } from "@/core/rbac/can";
import { PERMISSIONS } from "@/core/rbac/permissions";
import { getProjectDetail } from "@/modules/projects/queries";
import { listProjectTasks } from "@/modules/tasks/queries";
import { listProfessionals } from "@/modules/staff/queries";
import { listProjectComments } from "@/modules/comments/queries";
import { getProjectMeasurements } from "@/modules/measurements/queries";
import { getProjectDocuments } from "@/modules/documents/queries";
import { getProjectPurchaseOrders, listSuppliers } from "@/modules/procurement/queries";
import { StageTimeline } from "@/modules/projects/components/StageTimeline";
import { DynamicStageForm } from "@/modules/projects/components/DynamicStageForm";
import { TasksSection } from "@/modules/projects/components/TasksSection";
import { CommentsSection } from "@/modules/projects/components/CommentsSection";
import { MeasurementsSection } from "@/modules/projects/components/MeasurementsSection";
import { DocumentsSection } from "@/modules/projects/components/DocumentsSection";
import { ProcurementSection } from "@/modules/projects/components/ProcurementSection";
import { ProgressUpdateForm } from "@/modules/projects/components/ProgressUpdateForm";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

export default async function ObraPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;

  const detail = await getProjectDetail(actor, id);
  if (!detail) notFound();

  const { project, activeStages, timeline, progress, updates } = detail;
  const canUpdateProgress = hasPermission(actor, PERMISSIONS.PROJECT_UPDATE_PROGRESS);

  const [users, tasks, professionals, comments, measurements, documents, purchaseOrders, suppliers] =
    await Promise.all([
      prisma.membership.findMany({
        where: { organizationId: actor.organizationId, isActive: true },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { user: { name: "asc" } },
      }),
      listProjectTasks(actor, project.id),
      listProfessionals(actor),
      listProjectComments(actor, project.id),
      getProjectMeasurements(actor, project.id),
      getProjectDocuments(actor, project.id),
      getProjectPurchaseOrders(actor, project.id),
      listSuppliers(actor),
    ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs text-muted">{project.code}</div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="text-sm text-muted">
            {project.client} · {project.location}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/obras/${project.id}/historico`} className="btn-ghost text-xs">
            Histórico completo
          </Link>
          <Link href="/obras" className="btn-ghost text-xs">
            Voltar
          </Link>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <div className="text-xs text-muted">Status atual</div>
          {activeStages.length > 0 ? (
            <div className="mt-1 space-y-0.5">
              {activeStages.map(({ stage }) => (
                <div key={stage.id} className="font-semibold" style={{ color: stage.color }}>
                  {stage.displayStatus}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-1 font-semibold">Obra Finalizada</div>
          )}
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">Valor do contrato</div>
          <div className="mt-1 font-semibold">
            {project.contractValue === null ? "Restrito" : formatCurrency(project.contractValue)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">Prazo</div>
          <div className="mt-1 font-semibold">
            {formatDate(project.plannedStartDate)} → {formatDate(project.plannedEndDate)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">Progresso da obra</div>
          <div className="mt-1 font-semibold">{project.progressPercent}%</div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <StageTimeline projectId={project.id} steps={timeline} progress={progress} />

          <section className="card p-6">
            <h2 className="mb-3 text-sm font-semibold">Escopo resumido</h2>
            <p className="whitespace-pre-wrap text-sm text-muted">{project.scopeSummary}</p>
            <p className="mt-4 text-xs text-muted">
              Cadastrada por {project.createdByName} em {formatDateTime(project.createdAt)} ·
              fluxo v{detail.workflowVersion}
            </p>
          </section>

          <TasksSection
            projectId={project.id}
            tasks={tasks}
            users={users.map((m) => ({ id: m.user.id, name: m.user.name }))}
          />

          {measurements ? (
            <MeasurementsSection projectId={project.id} rows={measurements.rows} summary={measurements.summary} />
          ) : null}

          {documents ? <DocumentsSection projectId={project.id} documents={documents} /> : null}

          {purchaseOrders ? (
            <ProcurementSection projectId={project.id} orders={purchaseOrders} suppliers={suppliers} />
          ) : null}

          {canUpdateProgress ? <ProgressUpdateForm projectId={project.id} /> : null}

          {updates.length > 0 ? (
            <section className="card p-6">
              <h2 className="mb-3 text-sm font-semibold">Atualizações da execução</h2>
              <ul className="space-y-3">
                {updates.map((u) => (
                  <li key={u.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                    <div className="flex items-baseline justify-between text-xs text-muted">
                      <span>
                        {u.authorName} · {u.type === "INCIDENT" ? "Ocorrência" : u.type === "NOTE" ? "Nota" : "Progresso"}
                      </span>
                      <span>{formatDateTime(u.occurredAt)}</span>
                    </div>
                    <p className="mt-1 text-sm">{u.description}</p>
                    {u.progressPercent !== null ? (
                      <p className="mt-1 text-xs text-muted">Progresso: {u.progressPercent}%</p>
                    ) : null}
                    {u.photo ? (
                      <a
                        href={`/api/anexos?url=${encodeURIComponent(u.photo.url)}&projectId=${project.id}`}
                        className="mt-1 inline-block text-xs text-primary hover:underline"
                      >
                        {u.photo.name}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <CommentsSection
            projectId={project.id}
            comments={comments}
            members={users.map((m) => ({ id: m.user.id, name: m.user.name }))}
          />
        </div>

        <div className="space-y-6">
          {activeStages.length > 0 ? (
            activeStages.map(({ stage, actions }) => (
              <DynamicStageForm
                key={stage.id}
                projectId={project.id}
                stage={stage}
                actions={actions}
                users={users.map((m) => ({ id: m.user.id, name: m.user.name }))}
                professionals={professionals.map((p) => ({ id: p.id, name: p.name, role: p.role }))}
              />
            ))
          ) : (
            <div className="card p-6">
              <h2 className="text-sm font-semibold">Obra finalizada</h2>
              <p className="mt-2 text-sm text-muted">
                O fluxo desta obra foi encerrado. O histórico permanece disponível.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
