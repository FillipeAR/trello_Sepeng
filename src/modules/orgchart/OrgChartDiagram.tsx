import type { ReactNode } from "react";
import type { OrgChartTreeNode } from "./tree";

/**
 * Diagrama de caixas conectadas por linha — CSS puro (classes `.orgchart-*`
 * em `globals.css`), sem lib de diagrama. `renderBox` decide o conteúdo de
 * cada caixa (só o título, ou título + quem ocupa + um seletor pra trocar).
 */
export function OrgChartDiagram({
  nodes,
  renderBox,
}: {
  nodes: OrgChartTreeNode[];
  /** `depth` conta a partir de 0 (raiz) — usado pra estilizar por nível (executivo/depto/cargo). */
  renderBox: (node: OrgChartTreeNode, depth: number) => ReactNode;
}) {
  if (nodes.length === 0) return null;

  return (
    <div className="overflow-x-auto pb-2">
      <ul className="orgchart-tree w-max min-w-full">
        {nodes.map((node) => (
          <OrgChartDiagramNode key={node.id} node={node} depth={0} renderBox={renderBox} />
        ))}
      </ul>
    </div>
  );
}

function OrgChartDiagramNode({
  node,
  depth,
  renderBox,
}: {
  node: OrgChartTreeNode;
  depth: number;
  renderBox: (node: OrgChartTreeNode, depth: number) => ReactNode;
}) {
  return (
    <li>
      {renderBox(node, depth)}
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => (
            <OrgChartDiagramNode key={child.id} node={child} depth={depth + 1} renderBox={renderBox} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
