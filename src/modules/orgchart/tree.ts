export interface FlatPosition {
  id: string;
  title: string;
  parentId: string | null;
  order: number;
}

export interface OrgChartTreeNode extends FlatPosition {
  children: OrgChartTreeNode[];
}

/** Monta a árvore a partir da lista plana. Pai inexistente (removido, id errado) vira raiz. */
export function buildOrgChartTree(positions: FlatPosition[]): OrgChartTreeNode[] {
  const byId = new Map<string, OrgChartTreeNode>();
  for (const p of positions) byId.set(p.id, { ...p, children: [] });

  const roots: OrgChartTreeNode[] = [];
  for (const p of positions) {
    const node = byId.get(p.id)!;
    const parent = p.parentId ? byId.get(p.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (nodes: OrgChartTreeNode[]) => {
    nodes.sort((a, b) => a.order - b.order);
    for (const n of nodes) sortChildren(n.children);
  };
  sortChildren(roots);

  return roots;
}

/**
 * Classe CSS da caixa do diagrama por nível — mesmo critério nos dois lugares
 * que desenham o organograma (editor e seção da obra), pra não divergir.
 * Baseado em profundidade, não no título (cargos são livremente editáveis,
 * não dá pra amarrar estilo a um nome específico).
 */
export function orgChartBoxClassName(depth: number): string {
  if (depth <= 2) return "orgchart-box--exec";
  if (depth === 3) return "orgchart-box--dept";
  return "orgchart-box";
}

/** Lista achatada em pré-ordem, com profundidade — pra montar um <select> indentado. */
export function flattenWithDepth(nodes: OrgChartTreeNode[], depth = 0): { node: OrgChartTreeNode; depth: number }[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flattenWithDepth(node.children, depth + 1),
  ]);
}
