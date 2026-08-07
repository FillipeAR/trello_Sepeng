import type { TeamPositionTreeNode } from "./tree";

/**
 * Layout automático em árvore, sem lib de grafos — só usado pra cargos que
 * ainda não têm posição salva no canvas (`positionX`/`positionY` nulos).
 * Folha por folha da esquerda pra direita; pai fica centralizado sobre a
 * faixa dos próprios filhos.
 */

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 96;
const H_GAP = 32;
const V_GAP = 72;

export interface NodeLayout {
  x: number;
  y: number;
}

export function layoutTeamTree(roots: TeamPositionTreeNode[]): Map<string, NodeLayout> {
  const layout = new Map<string, NodeLayout>();
  let cursor = 0;

  function place(node: TeamPositionTreeNode, depth: number): number {
    if (node.children.length === 0) {
      const x = cursor * (NODE_WIDTH + H_GAP);
      cursor += 1;
      layout.set(node.id, { x, y: depth * (NODE_HEIGHT + V_GAP) });
      return x;
    }
    const childXs = node.children.map((child) => place(child, depth + 1));
    const x = (childXs[0] + childXs[childXs.length - 1]) / 2;
    layout.set(node.id, { x, y: depth * (NODE_HEIGHT + V_GAP) });
    return x;
  }

  for (const root of roots) place(root, 0);
  return layout;
}
