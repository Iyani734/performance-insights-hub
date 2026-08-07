import { supabase } from "@/integrations/supabase/client";
import { isSeededDemoPayload, isSeededDemoUpload } from "@/lib/liveData";
import {
  calculateTotalCycleTime,
  hasValue,
  normalizeTicketStatus,
} from "@/lib/kpiRules";
import {
  isActiveReviewFinalUpload,
  isTicketQcFinalUpload,
  isTicketQcReviewUpload,
  isTicketQcUpload,
  isTicketQualityErrorUpload,
  isTicketQualityUpload,
  isTcrTotalUpload,
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
  const target = normalizeKpiTarget(t);
  if (actual == null || Number.isNaN(actual)) return "none";
  if (target.direction === "higher_is_better") {
    if (actual >= target.green_min) return "green";
    if (actual >= target.yellow_min) return "yellow";
    return "red";
  }
  // lower_is_better
  if (actual <= target.green_min) return "green";
  if (actual <= target.yellow_min) return "yellow";
  return "red";
}

export function formatKpi(actual: number | null | undefined, t: KpiTarget): string {
  const target = normalizeKpiTarget(t);
  if (actual == null || Number.isNaN(actual)) return "—";
  const digits = target.unit === "count" ? 0 : 1;
  const n = Number(actual).toFixed(digits);
  return target.unit === "%" ? `${n}%` : target.unit === "days" ? `${n} d` : n;
}

export function normalizeKpiTarget(target: KpiTarget): KpiTarget {
  if (target.kpi_key === "review_to_final_edit") {
    return {
      ...target,
      label: "Tickets QC'd - Review to Final Edit",
      unit: "%",
      direction: "higher_is_better",
      green_min: 95,
      yellow_min: 85,
      target_display: ">= 95%",
      auto: true,
    };
  }
  if (target.kpi_key === "ticket_quality") {
    return {
      ...target,
      label: "Ticket Quality",
      unit: "%",
      direction: "lower_is_better",
      green_min: 3,
      yellow_min: 5,
      target_display: "< 3%",
      auto: true,
    };
  }
  return target;
}

export function normalizeKpiTargets(targets: KpiTarget[]) {
  return targets.map(normalizeKpiTarget);
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
  const qualityUploads = uploads.filter(isTicketQualityUpload);
  const cycleUploads = uploads.filter(isTotalCycleTimeUpload);

  const [tickets, cycleRows] = await Promise.all([
    fetchTicketRowsByUploadIds(activeUploads.map((upload) => upload.id), "tickets"),
    fetchTicketRowsByUploadIds(cycleUploads.map((upload) => upload.id), "invoiced"),
  ]);

  const statusMatches = (status: unknown, value: string) => normalizeTicketStatus(status) === value;
  const ticketQc = calculateTicketQcReviewToFinal(qcUploads);
  const ticketQuality = calculateTicketQualityFromUploads(qualityUploads);
  const totalCycleTime = calculateTotalCycleTime(cycleRows);

  return {
    review_to_final_edit: ticketQc.actual,
    ticket_quality: ticketQuality.actual,
    invoice_cycle_time: totalCycleTime,
    dispatch_completion: null,
    totals: {
      tickets: tickets.length,
      invoiced: cycleRows.length,
      quality_issues: ticketQuality.errorRows,
      quality_total_tickets: ticketQuality.totalRows,
      qc_tickets: ticketQc.finalRows,
      qc_review_tickets: ticketQc.reviewRows,
      qc_final_tickets: ticketQc.finalRows,
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
  created_at: string | null;
};

async function fetchUploadsForRange(from: string, to: string): Promise<UploadLike[]> {
  const data = await fetchAllSupabaseRows<UploadLike>((rangeFrom, rangeTo) =>
    supabase
      .from("report_uploads")
      .select("id,kind,file_name,row_count,week_start,effective_from,effective_to,status,created_at")
      .order("created_at", { ascending: false })
      .range(rangeFrom, rangeTo),
  );

  return data.filter((upload) => {
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

function calculateTicketQcReviewToFinal(uploads: UploadLike[]) {
  const reviewUpload = latestUpload(uploads.filter(isTicketQcReviewUpload));
  const finalUpload = latestUpload(uploads.filter(isTicketQcFinalUpload));
  const reviewRows = reviewUpload ? sumImportedRows([reviewUpload]) : 0;
  const finalRows = finalUpload ? sumImportedRows([finalUpload]) : 0;

  return {
    reviewRows,
    finalRows,
    actual: reviewUpload && finalUpload && reviewRows > 0 ? (finalRows / reviewRows) * 100 : null,
  };
}

function calculateTicketQualityFromUploads(uploads: UploadLike[]) {
  const errorUpload = latestUpload(uploads.filter(isTicketQualityErrorUpload));
  const totalUpload = latestUpload(uploads.filter(isTcrTotalUpload));
  const errorRows = errorUpload ? sumImportedRows([errorUpload]) : 0;
  const totalRows = totalUpload ? sumImportedRows([totalUpload]) : 0;

  return {
    errorRows,
    totalRows,
    actual: errorUpload && totalUpload && totalRows > 0 ? (errorRows / totalRows) * 100 : null,
  };
}

function latestUpload(uploads: UploadLike[]) {
  return uploads
    .slice()
    .sort((a, b) => uploadTimestamp(b) - uploadTimestamp(a))[0] ?? null;
}

function uploadTimestamp(upload: UploadLike) {
  const value = Date.parse(upload.created_at ?? "");
  return Number.isFinite(value) ? value : 0;
}
