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
  isTotalCycleTimeUpload,
} from "@/lib/reportTypes";
import { fetchAllSupabaseRows } from "@/lib/supabasePagination";
import { formatDateOnly } from "@/lib/dateLabels";

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

function finiteNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatTargetNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

export function deriveYellowMin(target: KpiTarget) {
  const greenMin = finiteNumber(target.green_min, 0);
  if (target.direction !== "higher_is_better") return greenMin;
  if (target.unit === "%") return Math.max(0, greenMin - 10);
  return Math.max(0, greenMin * 0.9);
}

export function deriveTargetDisplay(target: KpiTarget) {
  const greenMin = finiteNumber(target.green_min, 0);
  const symbol = target.direction === "higher_is_better" ? ">=" : "<=";
  const value = formatTargetNumber(greenMin);
  if (target.unit === "%") return `${symbol} ${value}%`;
  if (target.unit === "days") return `${symbol} ${value} days`;
  return `${symbol} ${value}`;
}

function withDerivedTargetFields(target: KpiTarget, fallbackGreenMin = 0): KpiTarget {
  const normalized = {
    ...target,
    green_min: finiteNumber(target.green_min, fallbackGreenMin),
  };
  return {
    ...normalized,
    yellow_min: deriveYellowMin(normalized),
    target_display: deriveTargetDisplay(normalized),
  };
}

function isLegacyTicketQualityTarget(target: KpiTarget) {
  return (
    target.unit === "%" ||
    /%/.test(target.target_display ?? "") ||
    finiteNumber(target.green_min, 10) > 50
  );
}

export function normalizeKpiTarget(target: KpiTarget): KpiTarget {
  if (target.kpi_key === "review_to_final_edit") {
    return withDerivedTargetFields({
      ...target,
      label: "Tickets QC'd - Review to Final Edit",
      unit: "%",
      direction: "higher_is_better",
      green_min: finiteNumber(target.green_min, 95),
      auto: true,
    }, 95);
  }
  if (target.kpi_key === "ticket_quality") {
    return withDerivedTargetFields({
      ...target,
      label: "Ticket Quality",
      unit: "count",
      direction: "lower_is_better",
      green_min: isLegacyTicketQualityTarget(target) ? 10 : finiteNumber(target.green_min, 10),
      auto: true,
    }, 10);
  }
  return withDerivedTargetFields(target, target.green_min);
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
  return formatDateOnly(iso);
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
  const uploads = await fetchAvailableUploads();
  const rangeUploads = uploads.filter((upload) => uploadOverlapsRange(upload, from, to));
  // Active/Review/Final and Invoice Cycle Time are current snapshots. Their newest
  // upload must be visible regardless of the Dashboard or Analytics date range.
  const activeUpload = latestUpload(uploads.filter(isActiveReviewFinalUpload));
  const cycleUpload = latestUpload(uploads.filter(isTotalCycleTimeUpload));
  const activeUploads = activeUpload ? [activeUpload] : [];
  const qcUploads = rangeUploads.filter(isTicketQcUpload);
  const qualityUploads = rangeUploads.filter(isTicketQualityUpload);
  // A replacement Ticket Quality Error file supersedes every older error file
  // for this KPI. Using every overlapping upload double-counts an issue when a
  // user uploads a corrected/broader version of the report.
  const qualityErrorUpload = latestUpload(qualityUploads.filter(isTicketQualityErrorUpload));
  const cycleUploads = cycleUpload ? [cycleUpload] : [];

  const [tickets, cycleRows, qualityErrorRows] = await Promise.all([
    fetchTicketRowsByUploadIds(activeUploads.map((upload) => upload.id), "tickets"),
    fetchTicketRowsByUploadIds(cycleUploads.map((upload) => upload.id), "invoiced"),
    fetchQualityErrorRowsByUploadIds(
      qualityErrorUpload ? [qualityErrorUpload.id] : [],
      from,
      to,
    ),
  ]);

  const statusMatches = (status: unknown, value: string) => normalizeTicketStatus(status) === value;
  const ticketQc = calculateTicketQcReviewToFinal(qcUploads);
  const ticketQuality = calculateTicketQualityFromUploads(qualityUploads, qualityErrorRows.length);
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

async function fetchAvailableUploads(): Promise<UploadLike[]> {
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
    return true;
  });
}

function uploadOverlapsRange(upload: UploadLike, from: string, to: string) {
  const uploadFrom = upload.effective_from ?? upload.week_start;
  const uploadTo = upload.effective_to ?? addDaysUtc(upload.week_start, 6);
  return uploadFrom <= to && uploadTo >= from;
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

function calculateTicketQualityFromUploads(uploads: UploadLike[], errorRowsInRange: number) {
  const errorUpload = latestUpload(uploads.filter(isTicketQualityErrorUpload));
  const errorRows = errorUpload ? errorRowsInRange : 0;

  return {
    errorRows,
    totalRows: 0,
    actual: errorUpload ? errorRows : null,
  };
}

async function fetchQualityErrorRowsByUploadIds(uploadIds: string[], fromIso: string, toIso: string) {
  if (!uploadIds.length) return [];
  const data = await fetchAllSupabaseRows<any>((from, to) =>
    supabase
      .from("tickets")
      .select("upload_id,date_recv,raw")
      .in("upload_id", uploadIds)
      .gte("date_recv", `${fromIso}T00:00:00.000Z`)
      .lte("date_recv", `${toIso}T23:59:59.999Z`)
      .range(from, to),
  );

  return data.filter((row) => !isSeededDemoPayload(row.raw));
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
