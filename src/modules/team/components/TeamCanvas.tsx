"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { Maximize2, ZoomIn } from "lucide-react";
import { buildTeamTree, wouldCreateCycle, type FlatTeamPosition } from "../tree";
import { layoutTeamTree } from "../layout";
import { PositionNode, type PositionNodeType } from "./PositionNode";
import type { TeamOccupant } from "../queries";
import { moveNodeOnCanvasAction, reparentPositionAction } from "@/app/(app)/obras/[id]/equipe/actions";

const nodeTypes = { position: PositionNode };

function buildNodesAndEdges(
  positions: FlatTeamPosition[],
  occupantByPositionId: Record<string, TeamOccupant | null>,
  canManage: boolean,
  collapseAll: boolean,
  selectedId: string | null,
  onSelect: (id: string) => void,
  onDropProfessional: (positionId: string, professionalId: string) => void,
): { nodes: PositionNodeType[]; edges: Edge[] } {
  const tree = buildTeamTree(positions);
  const autoLayout = layoutTeamTree(tree);
  const rootIds = new Set(tree.map((n) => n.id));

  const visible = positions.filter((p) => !collapseAll || rootIds.has(p.id));

  const nodes: PositionNodeType[] = visible.map((position) => {
    const fallback = autoLayout.get(position.id) ?? { x: 0, y: 0 };
    return {
      id: position.id,
      type: "position",
      position: { x: position.positionX ?? fallback.x, y: position.positionY ?? fallback.y },
      selected: position.id === selectedId,
      data: {
        position,
        occupant: occupantByPositionId[position.id] ?? null,
        canManage,
        onSelect,
        onDropProfessional,
      },
      draggable: canManage,
    };
  });

  const visibleIds = new Set(visible.map((p) => p.id));
  const edges: Edge[] = visible
    .filter((p) => p.parentId && visibleIds.has(p.parentId))
    .map((p) => ({
      id: `e-${p.parentId}-${p.id}`,
      source: p.parentId as string,
      target: p.id,
      type: "smoothstep",
      style: { strokeWidth: 2 },
    }));

  return { nodes, edges };
}

function ZoomToFitButton() {
  const { zoomTo } = useReactFlow();
  return (
    <button type="button" onClick={() => zoomTo(1)} className="btn-ghost gap-1 px-2 py-1.5 text-xs" title="Zoom 100%">
      <ZoomIn className="h-3.5 w-3.5" strokeWidth={1.75} />
      100%
    </button>
  );
}

function FullscreenButton({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <button
      type="button"
      onClick={() => containerRef.current?.requestFullscreen()}
      className="btn-ghost gap-1 px-2 py-1.5 text-xs"
      title="Tela cheia"
    >
      <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.75} />
    </button>
  );
}

interface TeamCanvasProps {
  projectId: string;
  positions: FlatTeamPosition[];
  occupantByPositionId: Record<string, TeamOccupant | null>;
  canManage: boolean;
  selectedId: string | null;
  collapseAll: boolean;
  onSelect: (id: string | null) => void;
  onAssign: (positionId: string, professionalId: string) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * `nodes`/`edges` do React Flow são estado controlado local (precisa ser, pra
 * arrastar funcionar) — mas precisam recomeçar do zero quando o dado do
 * servidor muda de verdade (revalidatePath). Em vez de `useEffect` +
 * `setState` (gera religadas em cascata, o linter deste projeto já pegou
 * esse mesmo problema uma vez no organograma anterior), a `key` computada
 * em `TeamCanvas` força o React a remontar este componente do zero quando
 * o dado muda — sem efeito nenhum.
 */
function TeamCanvasInner({
  projectId,
  positions,
  occupantByPositionId,
  canManage,
  selectedId,
  collapseAll,
  onSelect,
  onAssign,
  containerRef,
}: TeamCanvasProps) {
  const handleSelect = useCallback((id: string) => onSelect(id), [onSelect]);

  const initial = useMemo(
    () =>
      buildNodesAndEdges(positions, occupantByPositionId, canManage, collapseAll, selectedId, handleSelect, onAssign),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [nodes, setNodes] = useState(initial.nodes);
  const [edges, setEdges] = useState(initial.edges);

  const onNodesChange = useCallback((changes: NodeChange<PositionNodeType>[]) => {
    setNodes((current) => {
      const next = [...current];
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          const idx = next.findIndex((n) => n.id === change.id);
          if (idx >= 0) next[idx] = { ...next[idx], position: change.position };
        }
      }
      return next;
    });
  }, []);

  const onNodeDragStop = useCallback(
    (_event: unknown, node: PositionNodeType) => {
      if (!canManage) return;
      void moveNodeOnCanvasAction({ positionId: node.id, positionX: node.position.x, positionY: node.position.y });
    },
    [canManage],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => current.filter((e) => !changes.some((c) => c.type === "remove" && c.id === e.id)));
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!canManage || !connection.source || !connection.target) return;
      if (connection.source === connection.target) return;
      if (wouldCreateCycle(positions, connection.target, connection.source)) {
        window.alert("Não é possível: isso criaria um ciclo na hierarquia.");
        return;
      }
      void reparentPositionAction({ positionId: connection.target, parentId: connection.source, projectId }).then(
        (result) => {
          if (!result.ok) window.alert(result.error ?? "Não foi possível reatribuir o superior.");
        },
      );
    },
    [canManage, positions, projectId],
  );

  return (
    <ReactFlow<PositionNodeType>
      className="team-canvas"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onPaneClick={() => onSelect(null)}
      fitView
      minZoom={0.2}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeStrokeWidth={2} />
      <Panel position="top-right" className="flex gap-1.5">
        <ZoomToFitButton />
        <FullscreenButton containerRef={containerRef} />
      </Panel>
    </ReactFlow>
  );
}

export function TeamCanvas(props: TeamCanvasProps) {
  const dataKey = useMemo(() => {
    const posKey = props.positions
      .map(
        (p) =>
          `${p.id}:${p.parentId ?? ""}:${p.professionalId ?? ""}:${p.positionX ?? ""}:${p.positionY ?? ""}:${
            props.occupantByPositionId[p.id]?.name ?? ""
          }`,
      )
      .join("|");
    return `${posKey}::${props.selectedId ?? ""}::${props.collapseAll}::${props.canManage}`;
  }, [props.positions, props.occupantByPositionId, props.selectedId, props.collapseAll, props.canManage]);

  return (
    <ReactFlowProvider>
      <TeamCanvasInner key={dataKey} {...props} />
    </ReactFlowProvider>
  );
}
