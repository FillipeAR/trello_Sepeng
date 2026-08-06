"use client";

import { useActionState } from "react";
import { assignOrgChartPositionAction, type ActionState } from "@/app/(app)/obras/actions";
import { buildOrgChartTree, type FlatPosition, type OrgChartTreeNode } from "@/modules/orgchart/tree";

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

function OrgChartNodeRow({
  projectId,
  node,
  depth,
  occupantByPositionId,
  professionals,
  canManage,
}: {
  projectId: string;
  node: OrgChartTreeNode;
  depth: number;
  occupantByPositionId: Record<string, OrgChartOccupant | null>;
  professionals: ProfessionalOption[];
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(assignOrgChartPositionAction, initial);
  const occupant = occupantByPositionId[node.id] ?? null;

  return (
    <li>
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm"
        style={{ marginLeft: depth * 20 }}
      >
        <span className="font-medium">{node.title}</span>

        {canManage ? (
          <form action={formAction} className="flex items-center gap-2">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="positionId" value={node.id} />
            <select
              name="professionalId"
              defaultValue={occupant?.id ?? ""}
              disabled={pending}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="input py-1 text-xs"
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
          <span className={occupant ? "text-xs" : "text-xs text-muted"}>
            {occupant ? `${occupant.name} — ${occupant.role}` : "Vago"}
          </span>
        )}
      </div>
      {state.errors?.length ? (
        <p className="mt-1 text-xs text-danger" style={{ marginLeft: depth * 20 }}>
          {state.errors.join(" ")}
        </p>
      ) : null}

      {node.children.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {node.children.map((child) => (
            <OrgChartNodeRow
              key={child.id}
              projectId={projectId}
              node={child}
              depth={depth + 1}
              occupantByPositionId={occupantByPositionId}
              professionals={professionals}
              canManage={canManage}
            />
          ))}
        </ul>
      ) : null}
    </li>
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
        <p className="text-sm text-muted">
          Nenhum cargo cadastrado no organograma da empresa ainda.
        </p>
      ) : (
        <ul className="space-y-2">
          {tree.map((node) => (
            <OrgChartNodeRow
              key={node.id}
              projectId={projectId}
              node={node}
              depth={0}
              occupantByPositionId={occupantByPositionId}
              professionals={professionals}
              canManage={canManage}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
