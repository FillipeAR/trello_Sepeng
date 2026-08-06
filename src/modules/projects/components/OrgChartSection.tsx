"use client";

import { useActionState } from "react";
import { assignOrgChartPositionAction, type ActionState } from "@/app/(app)/obras/actions";
import { buildOrgChartTree, type FlatPosition, type OrgChartTreeNode } from "@/modules/orgchart/tree";
import { OrgChartDiagram } from "@/modules/orgchart/OrgChartDiagram";

const initial: ActionState = {};

export interface OrgChartOccupant {
  id: string;
  name: string;
  role: string;
}

export interface ProfessionalOption {
  id: string;
  name: string;
  role: string;
}

function PositionBox({
  projectId,
  node,
  occupant,
  professionals,
  canManage,
}: {
  projectId: string;
  node: OrgChartTreeNode;
  occupant: OrgChartOccupant | null;
  professionals: ProfessionalOption[];
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(assignOrgChartPositionAction, initial);

  return (
    <div className="orgchart-box space-y-1">
      <div className="font-semibold">{node.title}</div>

      {canManage ? (
        <form action={formAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="positionId" value={node.id} />
          <select
            name="professionalId"
            defaultValue={occupant?.id ?? ""}
            disabled={pending}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="input py-1 text-[11px]"
          >
            <option value="">— Vago —</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.role}
              </option>
            ))}
          </select>
        </form>
      ) : (
        <div className={occupant ? "text-[11px]" : "text-[11px] text-muted"}>
          {occupant ? `${occupant.name} — ${occupant.role}` : "Vago"}
        </div>
      )}

      {state.errors?.length ? <p className="text-[10px] text-danger">{state.errors.join(" ")}</p> : null}
    </div>
  );
}

export function OrgChartSection({
  projectId,
  positions,
  occupantByPositionId,
  professionals,
  canManage,
}: {
  projectId: string;
  positions: FlatPosition[];
  occupantByPositionId: Record<string, OrgChartOccupant | null>;
  professionals: ProfessionalOption[];
  canManage: boolean;
}) {
  const tree = buildOrgChartTree(positions);

  return (
    <section className="card p-6">
      <h2 className="mb-1 text-sm font-semibold">Organograma</h2>
      <p className="mb-4 text-xs text-muted">
        {canManage
          ? "Escolha quem ocupa cada cargo nesta obra. O template de cargos é editado em Configurações → Organograma."
          : "Equipe alocada nesta obra, por cargo."}
      </p>

      {tree.length === 0 ? (
        <p className="text-sm text-muted">Nenhum cargo cadastrado no organograma da empresa ainda.</p>
      ) : (
        <OrgChartDiagram
          nodes={tree}
          renderBox={(node) => (
            <PositionBox
              key={node.id}
              projectId={projectId}
              node={node}
              occupant={occupantByPositionId[node.id] ?? null}
              professionals={professionals}
              canManage={canManage}
            />
          )}
        />
      )}
    </section>
  );
}
