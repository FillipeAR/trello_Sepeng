import { describe, expect, it } from "vitest";
import { buildTeamTree } from "./tree";
import { layoutTeamTree, NODE_HEIGHT, NODE_WIDTH } from "./layout";

describe("layoutTeamTree", () => {
  it("empilha por profundidade no eixo Y", () => {
    const tree = buildTeamTree([
      { id: "root", title: "r", sector: null, parentId: null, professionalId: null, permissions: [], positionX: null, positionY: null, order: 0 },
      { id: "child", title: "c", sector: null, parentId: "root", professionalId: null, permissions: [], positionX: null, positionY: null, order: 0 },
    ]);
    const layout = layoutTeamTree(tree);
    expect(layout.get("root")?.y).toBe(0);
    expect(layout.get("child")?.y).toBe(NODE_HEIGHT + 72);
  });

  it("centraliza o pai sobre a faixa dos filhos", () => {
    const tree = buildTeamTree([
      { id: "root", title: "r", sector: null, parentId: null, professionalId: null, permissions: [], positionX: null, positionY: null, order: 0 },
      { id: "a", title: "a", sector: null, parentId: "root", professionalId: null, permissions: [], positionX: null, positionY: null, order: 0 },
      { id: "b", title: "b", sector: null, parentId: "root", professionalId: null, permissions: [], positionX: null, positionY: null, order: 1 },
    ]);
    const layout = layoutTeamTree(tree);
    const ax = layout.get("a")!.x;
    const bx = layout.get("b")!.x;
    expect(bx).toBe(ax + NODE_WIDTH + 32);
    expect(layout.get("root")!.x).toBe((ax + bx) / 2);
  });
});
