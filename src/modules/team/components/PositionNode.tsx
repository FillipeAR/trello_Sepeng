"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { UserPlus } from "lucide-react";
import type { FlatTeamPosition } from "../tree";
import type { TeamOccupant } from "../queries";

export interface PositionNodeData extends Record<string, unknown> {
  position: FlatTeamPosition;
  occupant: TeamOccupant | null;
  canManage: boolean;
  onSelect: (positionId: string) => void;
  onDropProfessional: (positionId: string, professionalId: string) => void;
}

export type PositionNodeType = Node<PositionNodeData, "position">;

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={name} className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  }
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "?";
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
      {initials}
    </div>
  );
}

function PositionNodeComponent({ data, selected }: NodeProps<PositionNodeType>) {
  const { position, occupant, canManage, onSelect, onDropProfessional } = data;

  return (
    <div
      className={`card w-[220px] cursor-pointer border p-3 transition ${
        selected ? "border-primary shadow-[0_0_0_2px_var(--primary)]" : "border-border"
      }`}
      onClick={() => onSelect(position.id)}
      onDragOver={(e) => {
        if (!canManage) return;
        e.preventDefault();
      }}
      onDrop={(e) => {
        if (!canManage) return;
        e.preventDefault();
        const professionalId = e.dataTransfer.getData("text/plain");
        if (professionalId) onDropProfessional(position.id, professionalId);
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted" />
      <Handle type="source" position={Position.Bottom} className="!bg-muted" />

      <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-primary">
        {position.title}
      </div>

      {occupant ? (
        <div className="mt-2 flex items-center gap-2">
          <Avatar name={occupant.name} avatarUrl={occupant.avatarUrl} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{occupant.name}</div>
            <div className="truncate text-xs text-muted">{occupant.role}</div>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-3 text-center">
          <UserPlus className="h-4 w-4 text-muted" strokeWidth={1.75} />
          <span className="text-[11px] leading-tight text-muted">
            {canManage ? "Arraste alguém para este cargo" : "Vago"}
          </span>
        </div>
      )}

      {position.sector ? <div className="mt-2 text-[11px] text-muted">{position.sector}</div> : null}
    </div>
  );
}

export const PositionNode = memo(PositionNodeComponent);
