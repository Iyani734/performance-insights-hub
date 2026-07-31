import { supabase } from "@/integrations/supabase/client";
import { isSeededDemoPayload } from "@/lib/liveData";
import {
  calculateInvoiceCycleTime,
  calculateReviewToFinalEdit,
  calculateTicketQuality,
  hasValue,
  normalizeTicketStatus,
} from "@/lib/kpiRules";

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
    supabase
      .from("tickets")
      .select("final_edited_by,void_reason,date_recv,kind,status,raw")
      .gte("week_start", from)
      .lte("week_start", to)
      .eq("kind", "tickets"),
    supabase
      .from("tickets")
      .select("final_edited_by,void_reason,date_recv,kind,status,raw")
      .gte("week_start", from)
      .lte("week_start", to)
      .eq("kind", "invoiced"),
  ]);
  const tickets = (ticketsRes.data ?? []).filter((row) => !isSeededDemoPayload(row.raw));
  const invoiced = (invRes.data ?? []).filter((row) => !isSeededDemoPayload(row.raw));

  const reviewFinal = calculateReviewToFinalEdit(tickets, from, to);
  const quality = calculateTicketQuality(invoiced, tickets);

  const dispatchCompletion = tickets.length
    ? (tickets.filter((r: any) => !hasValue(r.void_reason)).length / tickets.length) * 100
    : null;
  const statusMatches = (status: unknown, value: string) => normalizeTicketStatus(status) === value;
  const invoiceCycleTime = calculateInvoiceCycleTime(tickets, to);

  return {
    review_to_final_edit: reviewFinal,
    ticket_quality: quality.actual,
    invoice_cycle_time: invoiceCycleTime,
    dispatch_completion: dispatchCompletion,
    totals: {
      tickets: tickets.length,
      invoiced: invoiced.length,
      quality_issues: quality.issues,
      voided: tickets.filter((r: any) => hasValue(r.void_reason)).length,
      active_tickets: tickets.filter((r: any) => statusMatches(r.status, "active")).length,
      review_tickets: tickets.filter((r: any) => statusMatches(r.status, "review")).length,
      final_edit_tickets: tickets.filter((r: any) => statusMatches(r.status, "final edit")).length,
    },
  };
}
