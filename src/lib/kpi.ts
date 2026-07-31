import { supabase } from "@/integrations/supabase/client";
import { isSeededDemoPayload } from "@/lib/liveData";

export type KpiTarget = {
  id: string;
  kpi_key: string;
  label: string;
  owner: string | null;
  cadence: string | null;
  unit: string | null;
  direction: string;
  green_min: number;
  yellow_min: number;
  target_display: string | null;
  auto: boolean;
  sort_order: number;
};

export type KpiStatus = "green" | "yellow" | "red" | "none";

export function computeStatus(actual: number | null | undefined, t: KpiTarget): KpiStatus {
  if (actual == null || Number.isNaN(actual)) return "none";
  if (t.direction === "higher_is_better") {
    if (actual >= t.green_min) return "green";
    if (actual >= t.yellow_min) return "yellow";
    return "red";
  }
  // lower_is_better
  if (actual <= t.green_min) return "green";
  if (actual <= t.yellow_min) return "yellow";
  return "red";
}

export function formatKpi(actual: number | null | undefined, t: KpiTarget): string {
  if (actual == null || Number.isNaN(actual)) return "—";
  const digits = t.unit === "count" ? 0 : 1;
  const n = Number(actual).toFixed(digits);
  return t.unit === "%" ? `${n}%` : t.unit === "days" ? `${n} d` : n;
}

// ISO week Monday
export function weekStartOf(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  if (day !== 1) date.setUTCDate(date.getUTCDate() - (day - 1));
  return date.toISOString().slice(0, 10);
}

export function formatWeek(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function addDaysUtc(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function computeAutoKpis(week: string) {
  return computeAutoKpisForRange(week, addDaysUtc(week, 6));
}

export async function computeAutoKpisForRange(from: string, to: string) {
  const [ticketsRes, invRes] = await Promise.all([
    supabase.from("tickets").select("final_edited_by,void_reason,date_recv,kind,status,raw").gte("week_start", from).lte("week_start", to).eq("kind", "tickets"),
    supabase.from("tickets").select("final_edited_by,void_reason,date_recv,kind,status,raw").gte("week_start", from).lte("week_start", to).eq("kind", "invoiced"),
  ]);
  const tickets = (ticketsRes.data ?? []).filter((row) => !isSeededDemoPayload(row.raw));
  const invoiced = (invRes.data ?? []).filter((row) => !isSeededDemoPayload(row.raw));

  const reviewFinal = tickets.length
    ? (tickets.filter((r: any) => r.final_edited_by).length / tickets.length) * 100
    : null;

  const qualityRows = invoiced.length > 0 ? invoiced : tickets;
  const qualityIssues = qualityRows.filter((r: any) => hasValue(r.void_reason)).length;
  const ticketQuality = qualityRows.length ? (qualityIssues / qualityRows.length) * 100 : null;

  const dispatchCompletion = tickets.length
    ? (tickets.filter((r: any) => !hasValue(r.void_reason)).length / tickets.length) * 100
    : null;
  const statusMatches = (status: unknown, value: string) => normalizeTicketStatus(status) === value;
  const invoiceCycleRows = invoiced.length > 0
    ? invoiced
    : tickets.filter((r: any) => statusMatches(r.status, "invoiced"));
  const invoiceCycleDays = invoiceCycleRows
    .map((row: any) => invoiceCycleDaysFromRow(row))
    .filter((days): days is number => days != null && Number.isFinite(days));
  const invoiceCycleTime = invoiceCycleDays.length ? average(invoiceCycleDays) : null;

  return {
    review_to_final_edit: reviewFinal,
    ticket_quality: ticketQuality,
    invoice_cycle_time: invoiceCycleTime,
    dispatch_completion: dispatchCompletion,
    totals: {
      tickets: tickets.length,
      invoiced: invoiced.length,
      quality_issues: qualityIssues,
      voided: tickets.filter((r: any) => hasValue(r.void_reason)).length,
      active_tickets: tickets.filter((r: any) => statusMatches(r.status, "active")).length,
      review_tickets: tickets.filter((r: any) => statusMatches(r.status, "review")).length,
      final_edit_tickets: tickets.filter((r: any) => statusMatches(r.status, "final edit")).length,
    },
  };
}

function hasValue(value: unknown) {
  return String(value ?? "").trim() !== "";
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeTicketStatus(status: unknown) {
  const value = String(status ?? "").trim().toLowerCase();
  const compact = value.replace(/[\s_-]+/g, "");

  if (compact === "a" || compact === "active") return "active";
  if (compact === "r" || compact === "review") return "review";
  if (compact === "f" || compact === "finaledit" || compact === "finaledited") return "final edit";
  if (compact === "i" || compact === "invoiced" || compact === "invoice") return "invoiced";
  if (compact === "v" || compact === "void" || compact === "voided") return "voided";

  return value;
}

const FINAL_EDIT_DATE_KEYS = [
  "Final Edit Date",
  "Final Edited Date",
  "Final Edit Time",
  "Final Edited At",
  "Final Edit Timestamp",
  "Date Final Edited",
  "Date Final Edit",
  "Date Recv",
];

const INVOICE_DATE_KEYS = [
  "Invoice Date",
  "Invoiced Date",
  "Date Invoiced",
  "Invoice Created",
  "Invoice Timestamp",
  "Billed Date",
  "Billing Date",
  "Deliver/Pickup",
];

function invoiceCycleDaysFromRow(row: any): number | null {
  const finalEditDate = dateFromRaw(row.raw, FINAL_EDIT_DATE_KEYS) ?? toDate(row.date_recv);
  const invoiceDate = dateFromRaw(row.raw, INVOICE_DATE_KEYS);
  if (!finalEditDate || !invoiceDate) return null;
  return Math.max(0, (invoiceDate.getTime() - finalEditDate.getTime()) / 86400000);
}

function dateFromRaw(raw: unknown, keys: string[]): Date | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  for (const key of keys) {
    const exact = toDate(record[key]);
    if (exact) return exact;
  }

  const normalized = new Map(Object.keys(record).map((key) => [normalizeHeader(key), key]));
  for (const key of keys) {
    const actual = normalized.get(normalizeHeader(key));
    const value = actual ? toDate(record[actual]) : null;
    if (value) return value;
  }
  return null;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function toDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const text = String(value).trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}
