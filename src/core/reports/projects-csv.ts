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

/**
 * Rótulos em caixa alta — mesmo estilo da planilha "Acompanhamento de
 * Orçamentos" da Sepeng, que este export tenta ficar parecido. Não dá pra
 * ir além de rótulo: campos da planilha sobre a fase de proposta (status
 * da proposta, responsável pelo orçamento, datas de recebimento/visita/
 * envio, valor final enviado) não existem no ObraFlow — são dado de antes
 * da obra ser cadastrada no sistema, fora do escopo deste export.
 */
const HEADERS: { key: keyof ProjectCsvRow; label: string }[] = [
  { key: "code", label: "CÓDIGO" },
  { key: "name", label: "OBRA" },
  { key: "client", label: "CLIENTE" },
  { key: "location", label: "LOCALIZAÇÃO" },
  { key: "stageName", label: "ETAPA ATUAL" },
  { key: "displayStatus", label: "STATUS" },
  { key: "departmentName", label: "DEPARTAMENTO" },
  { key: "progressPercent", label: "PROGRESSO" },
  { key: "contractValue", label: "VALOR DO CONTRATO (R$)" },
  { key: "plannedEndDate", label: "PREVISÃO DE ENTREGA" },
  { key: "isLate", label: "ATRASADA" },
  { key: "manager", label: "GERENTE" },
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
