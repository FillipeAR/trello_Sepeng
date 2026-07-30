import { describe, expect, it } from "vitest";
import { canActOnStage, canReadProject, type Actor } from "./can";
import { DEFAULT_ROLES, PERMISSIONS } from "./permissions";

function actor(over: Partial<Actor> = {}): Actor {
  return {
    userId: "u1",
    organizationId: "org1",
    roleSlug: "teste",
    departmentId: null,
    permissions: [],
    ...over,
  };
}

describe("canReadProject", () => {
  it("project:read:all vê tudo", () => {
    const a = actor({ permissions: [PERMISSIONS.PROJECT_READ_ALL] });
    expect(canReadProject(a, {})).toBe(true);
  });

  it("escopo de departamento vê a obra na sua etapa", () => {
    const a = actor({
      permissions: [PERMISSIONS.PROJECT_READ_DEPARTMENT],
      departmentId: "dep-rh",
    });
    expect(canReadProject(a, { currentStageDepartmentId: "dep-rh" })).toBe(true);
    expect(canReadProject(a, { currentStageDepartmentId: "dep-financeiro" })).toBe(false);
  });

  it("escopo de departamento vê obra por onde já passou", () => {
    const a = actor({
      permissions: [PERMISSIONS.PROJECT_READ_DEPARTMENT],
      departmentId: "dep-rh",
    });
    expect(
      canReadProject(a, {
        currentStageDepartmentId: "dep-financeiro",
        visitedDepartmentIds: ["dep-orcamento", "dep-rh"],
      }),
    ).toBe(true);
  });

  it("escopo de alocação vê só as obras em que participa", () => {
    const a = actor({ permissions: [PERMISSIONS.PROJECT_READ_ASSIGNED] });
    expect(canReadProject(a, { assignedUserIds: ["u1"] })).toBe(true);
    expect(canReadProject(a, { assignedUserIds: ["u2"] })).toBe(false);
  });

  it("sem permissão de leitura, nega", () => {
    expect(canReadProject(actor(), { assignedUserIds: ["u1"] })).toBe(false);
  });
});

describe("canActOnStage", () => {
  it("exige a permissão da ação", () => {
    const a = actor({ permissions: [], departmentId: "dep-rh" });
    expect(canActOnStage(a, { stageDepartmentId: "dep-rh" }).allowed).toBe(false);
  });

  it("exige pertencer ao departamento da etapa", () => {
    const a = actor({ permissions: [PERMISSIONS.STAGE_COMPLETE], departmentId: "dep-rh" });
    expect(canActOnStage(a, { stageDepartmentId: "dep-financeiro" }).allowed).toBe(false);
    expect(canActOnStage(a, { stageDepartmentId: "dep-rh" }).allowed).toBe(true);
  });

  it("etapa sem departamento é aberta a quem tem a permissão", () => {
    const a = actor({ permissions: [PERMISSIONS.STAGE_COMPLETE] });
    expect(canActOnStage(a, { stageDepartmentId: null }).allowed).toBe(true);
  });

  it("workflow:manage ignora o departamento", () => {
    const a = actor({ permissions: [PERMISSIONS.WORKFLOW_MANAGE], departmentId: "x" });
    expect(canActOnStage(a, { stageDepartmentId: "dep-rh" }).allowed).toBe(true);
  });
});

describe("papéis padrão", () => {
  it("administrador tem todas as permissões do catálogo", () => {
    const admin = DEFAULT_ROLES.find((r) => r.slug === "administrador");
    expect(admin?.permissions).toContain(PERMISSIONS.WORKFLOW_MANAGE);
    expect(admin?.permissions).toContain(PERMISSIONS.AUDIT_READ);
  });

  it("visualizador não consegue concluir etapa", () => {
    const viewer = DEFAULT_ROLES.find((r) => r.slug === "visualizador");
    expect(viewer?.permissions).not.toContain(PERMISSIONS.STAGE_COMPLETE);
  });

  it("todos os 9 papéis do briefing existem", () => {
    expect(DEFAULT_ROLES).toHaveLength(9);
  });
});
