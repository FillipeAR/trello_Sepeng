const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

/** "AAAA-MM-DD" vira meia-noite UTC no `Date` — em BRT isso volta um dia. */
function toLocalDate(value: Date | string): Date {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }
  return new Date(value);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return dateFormatter.format(toLocalDate(value));
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return dateTimeFormatter.format(new Date(value));
}

export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} dias`;
}

export function daysUntil(date: Date | string): number {
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

/** Renderiza o valor de um campo dinâmico para leitura humana. */
export function formatFieldValue(value: unknown, type: string): string {
  if (value === null || value === undefined || value === "") return "—";

  switch (type) {
    case "CHECKBOX":
      return value ? "Sim" : "Não";
    case "CURRENCY":
      return formatCurrency(Number(value));
    case "DATE":
      return formatDate(String(value));
    case "MULTISELECT":
    case "USER_MULTI":
      return Array.isArray(value) ? value.join(", ") : String(value);
    default:
      return String(value);
  }
}
