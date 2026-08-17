import { describe, expect, it } from "vitest";
import { buildProjectsCsv, type ProjectCsvRow } from "./projects-csv";

function makeRow(over: Partial<ProjectCsvRow> = {}): ProjectCsvRow {
  return {
    code: "OBR-2026-0001",
    name: "Galpão Sepeng",
    client: "Cliente X",
    location: "Anápolis, GO",
    stageName: "Diretoria",
    displayStatus: "Planejamento Aprovado",
    departmentName: "Diretoria",
    progressPercent: "40%",
    contractValue: "R$ 1.500.000",
    plannedEndDate: "01/03/2027",
    isLate: "Não",
    manager: "—",
    ...over,
  };
}

describe("buildProjectsCsv", () => {
  it("começa com o BOM UTF-8 (Excel em português precisa disso pra não estragar acentos)", () => {
    const csv = buildProjectsCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("usa ; como delimitador e inclui o cabeçalho mesmo sem linhas", () => {
    const csv = buildProjectsCsv([]);
    const [header] = csv.slice(1).split("\r\n");
    expect(header).toBe(
      "CÓDIGO;OBRA;CLIENTE;LOCALIZAÇÃO;ETAPA ATUAL;STATUS;DEPARTAMENTO;PROGRESSO;VALOR DO CONTRATO (R$);PREVISÃO DE ENTREGA;ATRASADA;GERENTE",
    );
  });

  it("monta uma linha por obra, na ordem das colunas", () => {
    const csv = buildProjectsCsv([makeRow()]);
    const [, row] = csv.slice(1).split("\r\n");
    expect(row).toBe("OBR-2026-0001;Galpão Sepeng;Cliente X;Anápolis, GO;Diretoria;Planejamento Aprovado;Diretoria;40%;R$ 1.500.000;01/03/2027;Não;—");
  });

  it("escapa célula com ; entre aspas", () => {
    const csv = buildProjectsCsv([makeRow({ client: "Cliente; Filial 2" })]);
    expect(csv).toContain('"Cliente; Filial 2"');
  });

  it("escapa aspas duplicando-as", () => {
    const csv = buildProjectsCsv([makeRow({ name: 'Obra "Especial"' })]);
    expect(csv).toContain('"Obra ""Especial"""');
  });

  it("escapa quebra de linha dentro de uma célula", () => {
    const csv = buildProjectsCsv([makeRow({ location: "Linha 1\nLinha 2" })]);
    expect(csv).toContain('"Linha 1\nLinha 2"');
  });
});
