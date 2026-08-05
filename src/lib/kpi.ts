import { supabase } from "@/integrations/supabase/client";
import { isSeededDemoPayload, isSeededDemoUpload } from "@/lib/liveData";
import {
  calculateTotalCycleTime,
  hasValue,
  normalizeTicketStatus,
} from "@/lib/kpiRules";
import {
  isActiveReviewFinalUpload,
  isTicketQcUpload,
  isTotalCycleTimeUpload,
} from "@/lib/reportTypes";
import { fetchAllSupabaseRows } from "@/lib/supabasePagination";

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
  const uploads = await fetchUploadsForRange(from, to);
  const activeUploads = uploads.filter(isActiveReviewFinalUpload);
  const qcUploads = uploads.filter(isTicketQcUpload);
  const cycleUploads = uploads.filter(isTotalCycleTimeUpload);

  const [tickets, cycleRows] = await Promise.all([
    fetchTicketRowsByUploadIds(activeUploads.map((upload) => upload.id), "tickets"),
    fetchTicketRowsByUploadIds(cycleUploads.map((upload) => upload.id), "invoiced"),
  ]);

  const statusMatches = (status: unknown, value: string) => normalizeTicketStatus(status) === value;
  const qcTickets = sumImportedRows(qcUploads);
  const totalCycleTime = calculateTotalCycleTime(cycleRows);

  return {
    review_to_final_edit: qcTickets > 0 ? qcTickets : null,
    ticket_quality: null,
    invoice_cycle_time: totalCycleTime,
    dispatch_completion: null,
    totals: {
      tickets: tickets.length,
      invoiced: cycleRows.length,
      quality_issues: 0,
      qc_tickets: qcTickets,
      cycle_time_rows: cycleRows.length,
      voided: tickets.filter((r: any) => hasValue(r.void_reason)).length,
      active_tickets: tickets.filter((r: any) => statusMatches(r.status, "active")).length,
      review_tickets: tickets.filter((r: any) => statusMatches(r.status, "review")).length,
      final_edit_tickets: tickets.filter((r: any) => statusMatches(r.status, "final edit")).length,
    },
  };
}

type UploadLike = {
  id: string;
  kind: string | null;
  file_name: string | null;
  row_count: number | null;
  week_start: string;
  effective_from: string | null;
  effective_to: string | null;
  status: string | null;
};

async function fetchUploadsForRange(from: string, to: string): Promise<UploadLike[]> {
  const { data } = await supabase
    .from("report_uploads")
    .select("id,kind,file_name,row_count,week_start,effective_from,effective_to,status")
    .order("created_at", { ascending: false })
    .limit(1000);

  return ((data ?? []) as UploadLike[]).filter((upload) => {
    if (isSeededDemoUpload(upload.file_name)) return false;
    if (upload.status === "failed" || upload.status === "processing") return false;
    const uploadFrom = upload.effective_from ?? upload.week_start;
    const uploadTo = upload.effective_to ?? addDaysUtc(upload.week_start, 6);
    return uploadFrom <= to && uploadTo >= from;
  });
}

async function fetchTicketRowsByUploadIds(uploadIds: string[], kind: "tickets" | "invoiced") {
  if (!uploadIds.length) return [];
  const data = await fetchAllSupabaseRows<any>((from, to) =>
    supabase
      .from("tickets")
      .select("upload_id,final_edited_by,void_reason,date_recv,kind,status,raw")
      .in("upload_id", uploadIds)
      .eq("kind", kind)
      .range(from, to),
  );

  return data.filter((row) => !isSeededDemoPayload(row.raw));
}

function sumImportedRows(uploads: UploadLike[]) {
  return uploads.reduce((sum, upload) => sum + Math.max(0, Number(upload.row_count ?? 0)), 0);
}
