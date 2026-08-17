export interface ProjectCsvRow {
  code: string;
  name: string;
  client: string;
  location: string;
  stageName: string;
  displayStatus: string;
  departmentName: string;
  progressPercent: string;
  contractValue: string;
  plannedEndDate: string;
  isLate: string;
  manager: string;
}

const HEADERS: { key: keyof ProjectCsvRow; label: string }[] = [
  { key: "code", label: "Código" },
  { key: "name", label: "Obra" },
  { key: "client", label: "Cliente" },
  { key: "location", label: "Localização" },
  { key: "stageName", label: "Etapa atual" },
  { key: "displayStatus", label: "Status" },
  { key: "departmentName", label: "Departamento" },
  { key: "progressPercent", label: "Progresso" },
  { key: "contractValue", label: "Valor de contrato" },
  { key: "plannedEndDate", label: "Previsão de entrega" },
  { key: "isLate", label: "Atrasada" },
  { key: "manager", label: "Gerente" },
];

function escapeCell(value: string): string {
  if (/[";\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * `;` como delimitador (não `,`) e BOM UTF-8 no início — é o que o Excel em
 * português espera pra abrir o arquivo direto: com `,` ele tenta usar como
 * separador decimal e junta as colunas; sem o BOM, acentuação vira mojibake.
 */
export function buildProjectsCsv(rows: ProjectCsvRow[]): string {
  const lines = [HEADERS.map((h) => escapeCell(h.label)).join(";")];
  for (const row of rows) {
    lines.push(HEADERS.map((h) => escapeCell(row[h.key])).join(";"));
  }
  return "\uFEFF" + lines.join("\r\n");
}
