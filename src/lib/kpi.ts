import { supabase } from "@/integrations/supabase/client";

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
  const digits = t.unit === "days" ? 1 : 1;
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

export async function computeAutoKpis(week: string) {
  const [ticketsRes, invRes] = await Promise.all([
    supabase.from("tickets").select("final_edited_by,void_reason,date_recv,kind").eq("week_start", week).eq("kind", "tickets"),
    supabase.from("tickets").select("final_edited_by,void_reason,date_recv,kind").eq("week_start", week).eq("kind", "invoiced"),
  ]);
  const tickets = ticketsRes.data ?? [];
  const invoiced = invRes.data ?? [];

  const reviewFinal = tickets.length
    ? (tickets.filter((r: any) => r.final_edited_by).length / tickets.length) * 100
    : null;

  const qualityIssues = invoiced.filter((r: any) => r.void_reason && String(r.void_reason).trim() !== "").length;
  const ticketQuality = invoiced.length ? (qualityIssues / invoiced.length) * 100 : null;

  const now = new Date(week + "T00:00:00Z").getTime() + 7 * 86400000;
  const cycleDays = invoiced
    .map((r: any) => r.date_recv ? (now - new Date(r.date_recv).getTime()) / 86400000 : null)
    .filter((n: number | null): n is number => n != null && n >= 0);
  const invoiceCycle = cycleDays.length ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : null;

  const dispatchCompletion = tickets.length
    ? (tickets.filter((r: any) => !r.void_reason || String(r.void_reason).trim() === "").length / tickets.length) * 100
    : null;

  return {
    review_to_final_edit: reviewFinal,
    ticket_quality: ticketQuality,
    invoice_cycle_time: invoiceCycle,
    dispatch_completion: dispatchCompletion,
    totals: {
      tickets: tickets.length,
      invoiced: invoiced.length,
      quality_issues: qualityIssues,
      voided: tickets.filter((r: any) => r.void_reason).length,
    },
  };
}
