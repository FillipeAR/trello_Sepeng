"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List, Rows3, Send, Sparkles, X } from "lucide-react";
import { buildTeamTree, type FlatTeamPosition } from "../tree";
import type { TeamOccupant, TeamProfessional } from "../queries";
import { TeamCanvas } from "./TeamCanvas";
import { TeamListView } from "./TeamListView";
import { PeoplePanel } from "./PeoplePanel";
import { PositionInspector } from "./PositionInspector";
import { NewPositionModal } from "./NewPositionModal";
import { NewPersonModal } from "./NewPersonModal";
import {
  applyTemplateAction,
  assignProfessionalDirect,
  type ActionState,
} from "@/app/(app)/obras/[id]/equipe/actions";
import { executeStageActionForm } from "@/app/(app)/obras/actions";

const initialActionState: ActionState = {};

function ApplyTemplateButton({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(applyTemplateAction, initialActionState);

  return (
    <form action={formAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <button
        type="submit"
        disabled={pending}
        className="btn-ghost gap-1.5 text-xs"
        title="Cria a estrutura padrão da Sepeng (Diretor → Gerente de Contrato → gerências → departamentos) — soma aos cargos que já existem, não apaga nada"
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
        {pending ? "Aplicando…" : "Usar organograma padrão"}
      </button>
      {state.errors?.length ? <p className="mt-1 text-xs text-danger">{state.errors.join(" ")}</p> : null}
    </form>
  );
}

/**
 * Botão genérico "concluir etapa a partir daqui" — não sabe que a etapa se chama
 * Diretoria nem que a ação se chama "avancar", só que existe uma ação de avanço
 * pendente pra essa obra que aponta pra esta rota (`getPendingExternalCompletion`,
 * `src/modules/projects/queries.ts`). Reaproveita `executeStageActionForm`
 * (`src/app/(app)/obras/actions.ts`) sem nenhum campo — mesmo mecanismo genérico
 * que qualquer ação de etapa já usa.
 *
 * Chamada direta (mesmo padrão de `assignProfessionalDirect`/`deletePositionDirect`
 * nesta tela), não `useActionState` + `<form>`: o sucesso da ação faz a etapa
 * deixar de existir como "conclusão pendente" — o Next revalida a rota atual
 * automaticamente depois de qualquer Server Action, o que zera `pendingCompletion`
 * no próximo render do servidor e desmonta este botão. Com `useActionState`, esse
 * desmonte competia com o efeito que dispara o toast/redirect e às vezes vencia a
 * corrida (toast e redirecionamento nunca aconteciam). Chamando a action direto no
 * `onClick`, o aviso de sucesso roda na sequência do próprio clique, não depende
 * do componente continuar montado depois.
 */
function SendTeamButton({
  projectId,
  pendingCompletion,
  canSendTeam,
  onSent,
  onError,
}: {
  projectId: string;
  pendingCompletion: { stageId: string; actionKey: string; label: string };
  canSendTeam: boolean;
  onSent: () => void;
  onError: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);

  const handleClick = useCallback(async () => {
    setPending(true);
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("stageId", pendingCompletion.stageId);
    formData.set("actionKey", pendingCompletion.actionKey);
    const result = await executeStageActionForm(initialActionState, formData);
    setPending(false);
    if (result.success) {
      onSent();
    } else {
      onError(result.errors?.join(" ") ?? "Não foi possível enviar a equipe.");
    }
  }, [projectId, pendingCompletion, onSent, onError]);

  return (
    <button
      type="button"
      data-testid="send-team-button"
      onClick={handleClick}
      disabled={!canSendTeam || pending}
      title={canSendTeam ? undefined : "Atribua ao menos uma pessoa a um cargo antes de enviar."}
      className="btn-primary gap-1.5 text-xs"
    >
      <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
      {pending ? "Enviando…" : pendingCompletion.label || "Enviar equipe"}
    </button>
  );
}

/** Aviso próprio da tela, no lugar de `window.alert` — some sozinho, não trava a interface. */
function Toast({
  message,
  variant = "danger",
  onDismiss,
}: {
  message: string;
  variant?: "danger" | "success";
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
      <div
        className={
          variant === "success"
            ? "pointer-events-auto flex items-center gap-2 rounded-lg border border-success/30 bg-surface px-3 py-2 text-xs text-success shadow-lg"
            : "pointer-events-auto flex items-center gap-2 rounded-lg border border-danger/30 bg-surface px-3 py-2 text-xs text-danger shadow-lg"
        }
      >
        {message}
        <button
          type="button"
          onClick={onDismiss}
          className={variant === "success" ? "text-success/70 hover:text-success" : "text-danger/70 hover:text-danger"}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function TeamPageShell({
  projectId,
  positions,
  occupantByPositionId,
  professionals,
  canManage,
  pendingCompletion,
  canSendTeam,
}: {
  projectId: string;
  positions: FlatTeamPosition[];
  occupantByPositionId: Record<string, TeamOccupant | null>;
  professionals: TeamProfessional[];
  canManage: boolean;
  pendingCompletion: { stageId: string; actionKey: string; label: string } | null;
  canSendTeam: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"chart" | "list">("chart");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapseAll, setCollapseAll] = useState(false);
  const [newPositionOpen, setNewPositionOpen] = useState(false);
  const [newPersonOpen, setNewPersonOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "danger" | "success" } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, variant: "danger" | "success" = "danger") => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({ message, variant });
    toastTimeout.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const handleTeamSent = useCallback(() => {
    showToast("Equipe enviada — a obra avançou pra próxima etapa.", "success");
    setTimeout(() => router.push(`/obras/${projectId}`), 1500);
  }, [showToast, router, projectId]);

  useEffect(() => () => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
  }, []);

  const tree = buildTeamTree(positions);
  const selected = positions.find((p) => p.id === selectedId) ?? null;

  const handleAssign = useCallback(
    (positionId: string, professionalId: string) => {
      void assignProfessionalDirect({ positionId, professionalId, projectId }).then((result) => {
        if (!result.ok) showToast(result.error ?? "Não foi possível atribuir essa pessoa.");
      });
    },
    [projectId, showToast],
  );

  return (
    <div className="flex flex-1 gap-4 overflow-hidden">
      {canManage && selected ? (
        <PositionInspector
          projectId={projectId}
          position={selected}
          occupant={occupantByPositionId[selected.id] ?? null}
          tree={tree}
          onClose={() => setSelectedId(null)}
        />
      ) : null}

      <div ref={containerRef} className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface">
        {toast ? <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} /> : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
          <div className="flex items-center gap-1 rounded-lg bg-surface-muted p-1">
            <button
              type="button"
              onClick={() => setView("chart")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                view === "chart" ? "bg-surface shadow-sm" : "text-muted"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.75} />
              Organograma
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                view === "list" ? "bg-surface shadow-sm" : "text-muted"
              }`}
            >
              <List className="h-3.5 w-3.5" strokeWidth={1.75} />
              Lista
            </button>
          </div>

          <div className="flex items-center gap-2">
            {view === "chart" ? (
              <button type="button" onClick={() => setCollapseAll((v) => !v)} className="btn-ghost gap-1.5 text-xs">
                <Rows3 className="h-3.5 w-3.5" strokeWidth={1.75} />
                {collapseAll ? "Expandir tudo" : "Recolher tudo"}
              </button>
            ) : null}
            {canManage ? <ApplyTemplateButton projectId={projectId} /> : null}
            {canManage ? (
              <button type="button" onClick={() => setNewPositionOpen(true)} className="btn-primary text-xs">
                + Adicionar função
              </button>
            ) : null}
            {pendingCompletion ? (
              <SendTeamButton
                projectId={projectId}
                pendingCompletion={pendingCompletion}
                canSendTeam={canSendTeam}
                onSent={handleTeamSent}
                onError={showToast}
              />
            ) : null}
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden">
          {view === "chart" ? (
            <TeamCanvas
              projectId={projectId}
              positions={positions}
              occupantByPositionId={occupantByPositionId}
              canManage={canManage}
              selectedId={selectedId}
              collapseAll={collapseAll}
              onSelect={setSelectedId}
              onAssign={handleAssign}
              onError={showToast}
              containerRef={containerRef}
            />
          ) : (
            <TeamListView tree={tree} occupantByPositionId={occupantByPositionId} />
          )}
        </div>
      </div>

      {canManage ? <PeoplePanel professionals={professionals} onAddPerson={() => setNewPersonOpen(true)} /> : null}

      {newPositionOpen ? (
        <NewPositionModal projectId={projectId} tree={tree} onClose={() => setNewPositionOpen(false)} />
      ) : null}
      {newPersonOpen ? <NewPersonModal projectId={projectId} onClose={() => setNewPersonOpen(false)} /> : null}
    </div>
  );
}
