"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { LayoutGrid, List, Rows3, Sparkles, X } from "lucide-react";
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

/** Aviso próprio da tela, no lugar de `window.alert` — some sozinho, não trava a interface. */
function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-danger/30 bg-surface px-3 py-2 text-xs text-danger shadow-lg">
        {message}
        <button type="button" onClick={onDismiss} className="text-danger/70 hover:text-danger">
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
}: {
  projectId: string;
  positions: FlatTeamPosition[];
  occupantByPositionId: Record<string, TeamOccupant | null>;
  professionals: TeamProfessional[];
  canManage: boolean;
}) {
  const [view, setView] = useState<"chart" | "list">("chart");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapseAll, setCollapseAll] = useState(false);
  const [newPositionOpen, setNewPositionOpen] = useState(false);
  const [newPersonOpen, setNewPersonOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast(message);
    toastTimeout.current = setTimeout(() => setToast(null), 5000);
  }, []);

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
        {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}

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
