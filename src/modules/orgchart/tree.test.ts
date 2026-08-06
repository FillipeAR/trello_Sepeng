import { describe, expect, it } from "vitest";
import { buildOrgChartTree, flattenWithDepth } from "./tree";

describe("buildOrgChartTree", () => {
  it("agrupa filhos sob o pai e ordena por `order`", () => {
    const tree = buildOrgChartTree([
      { id: "b", title: "Gerente B", parentId: "root", order: 1 },
      { id: "root", title: "Diretor", parentId: null, order: 0 },
      { id: "a", title: "Gerente A", parentId: "root", order: 0 },
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("root");
    expect(tree[0].children.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("posição com pai inexistente vira raiz (órfã)", () => {
    const tree = buildOrgChartTree([{ id: "x", title: "Órfão", parentId: "nao-existe", order: 0 }]);
    expect(tree.map((n) => n.id)).toEqual(["x"]);
  });

  it("várias raízes ficam lado a lado", () => {
    const tree = buildOrgChartTree([
      { id: "d1", title: "Diretor 1", parentId: null, order: 0 },
      { id: "d2", title: "Diretor 2", parentId: null, order: 1 },
    ]);
    expect(tree).toHaveLength(2);
  });
});

describe("flattenWithDepth", () => {
  it("preserva a profundidade de cada nó", () => {
    const tree = buildOrgChartTree([
      { id: "root", title: "Diretor", parentId: null, order: 0 },
      { id: "child", title: "Gerente", parentId: "root", order: 0 },
      { id: "grandchild", title: "Encarregado", parentId: "child", order: 0 },
    ]);

    const flat = flattenWithDepth(tree);
    expect(flat.map((f) => [f.node.id, f.depth])).toEqual([
      ["root", 0],
      ["child", 1],
      ["grandchild", 2],
    ]);
  });
});
