import { describe, expect, it } from "vitest";
import { buildTeamTree, flattenWithDepth, wouldCreateCycle, type FlatTeamPosition } from "./tree";

function pos(over: Partial<FlatTeamPosition> & { id: string }): FlatTeamPosition {
  return {
    title: over.id,
    sector: null,
    parentId: null,
    professionalId: null,
    permissions: [],
    positionX: null,
    positionY: null,
    order: 0,
    ...over,
  };
}

describe("buildTeamTree", () => {
  it("agrupa filhos sob o pai e ordena por `order`", () => {
    const tree = buildTeamTree([
      pos({ id: "b", parentId: "root", order: 1 }),
      pos({ id: "root", order: 0 }),
      pos({ id: "a", parentId: "root", order: 0 }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("root");
    expect(tree[0].children.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("posição com pai inexistente vira raiz (órfã)", () => {
    const tree = buildTeamTree([pos({ id: "x", parentId: "nao-existe" })]);
    expect(tree.map((n) => n.id)).toEqual(["x"]);
  });

  it("várias raízes ficam lado a lado", () => {
    const tree = buildTeamTree([pos({ id: "d1", order: 0 }), pos({ id: "d2", order: 1 })]);
    expect(tree).toHaveLength(2);
  });
});

describe("flattenWithDepth", () => {
  it("preserva a profundidade de cada nó", () => {
    const tree = buildTeamTree([
      pos({ id: "root" }),
      pos({ id: "child", parentId: "root" }),
      pos({ id: "grandchild", parentId: "child" }),
    ]);

    const flat = flattenWithDepth(tree);
    expect(flat.map((f) => [f.node.id, f.depth])).toEqual([
      ["root", 0],
      ["child", 1],
      ["grandchild", 2],
    ]);
  });
});

describe("wouldCreateCycle", () => {
  const positions = [
    pos({ id: "root" }),
    pos({ id: "child", parentId: "root" }),
    pos({ id: "grandchild", parentId: "child" }),
    pos({ id: "other" }),
  ];

  it("nega mover um cargo pra debaixo de si mesmo", () => {
    expect(wouldCreateCycle(positions, "root", "root")).toBe(true);
  });

  it("nega mover um cargo pra debaixo de um descendente", () => {
    expect(wouldCreateCycle(positions, "root", "grandchild")).toBe(true);
    expect(wouldCreateCycle(positions, "child", "grandchild")).toBe(true);
  });

  it("permite mover pra debaixo de um cargo não-relacionado", () => {
    expect(wouldCreateCycle(positions, "grandchild", "other")).toBe(false);
  });

  it("permite virar raiz (sem pai)", () => {
    expect(wouldCreateCycle(positions, "grandchild", null)).toBe(false);
  });
});
