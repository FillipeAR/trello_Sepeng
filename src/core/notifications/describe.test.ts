import { describe as suite, expect, it } from "vitest";
import { describe as describeEvent } from "./describe";
import { DOMAIN_EVENTS } from "./events";

suite("describeEvent", () => {
  it("narra project.created com o displayStatus da etapa inicial", () => {
    const { title, body } = describeEvent(DOMAIN_EVENTS.PROJECT_CREATED, {
      projectId: "p1",
      projectName: "Residencial Alfa",
      projectCode: "OBR-2026-0001",
      displayStatus: "Obra Ganha",
    });
    expect(title).toContain("Residencial Alfa");
    expect(body).toContain("OBR-2026-0001");
    expect(body).toContain("Obra Ganha");
  });

  it("narra stage.entered citando quem concluiu a etapa anterior", () => {
    const { title, body } = describeEvent(DOMAIN_EVENTS.STAGE_ENTERED, {
      projectId: "p1",
      projectName: "Residencial Alfa",
      projectCode: "OBR-2026-0001",
      stageName: "RH",
      fromStageName: "Diretoria",
      displayStatus: "RH Concluído",
      actorName: "Maria",
    });
    expect(title).toContain("RH");
    expect(body).toContain("Maria");
    expect(body).toContain("Diretoria");
  });

  it("narra stage.milestone_reached com o mesmo formato de stage.entered", () => {
    const payload = {
      projectId: "p1",
      projectName: "Residencial Alfa",
      projectCode: "OBR-2026-0001",
      stageName: "Execução",
      fromStageName: "Financeiro",
      displayStatus: "Obra em Execução",
      actorName: "João",
    };
    expect(describeEvent(DOMAIN_EVENTS.STAGE_MILESTONE_REACHED, payload)).toEqual(
      describeEvent(DOMAIN_EVENTS.STAGE_ENTERED, payload),
    );
  });

  it("narra stage.milestone_reached sem etapa anterior (marco na criação da obra)", () => {
    const { title, body } = describeEvent(DOMAIN_EVENTS.STAGE_MILESTONE_REACHED, {
      projectId: "p1",
      projectName: "Residencial Alfa",
      projectCode: "OBR-2026-0001",
      stageName: "Orçamento",
      displayStatus: "Obra Ganha",
      actorName: "Erika",
    });
    expect(title).toContain("Residencial Alfa");
    expect(body).toBe('Status: "Obra Ganha".');
  });

  it("cai num texto genérico para um tipo de evento desconhecido, sem lançar", () => {
    const { title, body } = describeEvent("evento.inexistente", {
      projectId: "p1",
      projectName: "Residencial Alfa",
      projectCode: "OBR-2026-0001",
    });
    expect(title).toBe("Residencial Alfa");
    expect(body).toContain("evento.inexistente");
  });

  it("usa fallback quando actorName não vem no payload", () => {
    const { body } = describeEvent(DOMAIN_EVENTS.STAGE_RETURNED, {
      projectId: "p1",
      projectName: "Residencial Alfa",
      projectCode: "OBR-2026-0001",
      stageName: "Diretoria",
      fromStageName: "RH",
    });
    expect(body).toContain("Um usuário");
  });
});
