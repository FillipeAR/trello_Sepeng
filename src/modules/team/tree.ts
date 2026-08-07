export interface FlatTeamPosition {
  id: string;
  title: string;
  sector: string | null;
  parentId: string | null;
  professionalId: string | null;
  permissions: string[];
  positionX: number | null;
  positionY: number | null;
  order: number;
}

export interface TeamPositionTreeNode extends FlatTeamPosition {
  children: TeamPositionTreeNode[];
}

/** Monta a árvore a partir da lista plana. Pai inexistente (removido, id errado) vira raiz. */
export function buildTeamTree(positions: FlatTeamPosition[]): TeamPositionTreeNode[] {
  const byId = new Map<string, TeamPositionTreeNode>();
  for (const p of positions) byId.set(p.id, { ...p, children: [] });

  const roots: TeamPositionTreeNode[] = [];
  for (const p of positions) {
    const node = byId.get(p.id)!;
    const parent = p.parentId ? byId.get(p.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (nodes: TeamPositionTreeNode[]) => {
    nodes.sort((a, b) => a.order - b.order);
    for (const n of nodes) sortChildren(n.children);
  };
  sortChildren(roots);

  return roots;
}

/** Lista achatada em pré-ordem, com profundidade — "Nível hierárquico" é isso + 1. */
export function flattenWithDepth(
  nodes: TeamPositionTreeNode[],
  depth = 0,
): { node: TeamPositionTreeNode; depth: number }[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flattenWithDepth(node.children, depth + 1),
  ]);
}

/** Todos os ids na subárvore de `positionId` (incluindo ele mesmo) — usado pra impedir ciclo. */
function subtreeIds(positions: FlatTeamPosition[], positionId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const p of positions) {
    if (!p.parentId) continue;
    const list = childrenByParent.get(p.parentId) ?? [];
    list.push(p.id);
    childrenByParent.set(p.parentId, list);
  }

  const ids = new Set<string>();
  const stack = [positionId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (ids.has(current)) continue;
    ids.add(current);
    for (const child of childrenByParent.get(current) ?? []) stack.push(child);
  }
  return ids;
}

/** `newParentId` não pode ser o próprio cargo nem um dos seus descendentes. */
export function wouldCreateCycle(
  positions: FlatTeamPosition[],
  positionId: string,
  newParentId: string | null,
): boolean {
  if (!newParentId) return false;
  return subtreeIds(positions, positionId).has(newParentId);
}
