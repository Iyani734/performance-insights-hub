export type ReportKind =
  | "active_review_final"
  | "ticket_qc"
  | "total_cycle_time"
  | "open_jobs";

export type TicketQcStage = "review" | "final";

export const REPORT_KINDS: { value: ReportKind; label: string; hint: string }[] = [
  {
    value: "active_review_final",
    label: "Active / Review / Final",
    hint: "File name must include active, review, and final.",
  },
  {
    value: "ticket_qc",
    label: "Ticket QC",
    hint: "Upload TicketQC REVIEW and TicketQC FINAL. Both are required before the KPI calculates.",
  },
  {
    value: "total_cycle_time",
    label: "Invoice Cycle Time",
    hint: "File name must include invoice cycle time or total cycle time.",
  },
  {
    value: "open_jobs",
    label: "Open Jobs",
    hint: "File name must include open jobs.",
  },
];

export function reportKindLabel(kind: string | null | undefined) {
  return REPORT_KINDS.find((item) => item.value === kind)?.label ?? legacyReportKindLabel(kind);
}

export function reportKindHint(kind: ReportKind) {
  return REPORT_KINDS.find((item) => item.value === kind)?.hint ?? "";
}

export function identifyReportKindFromFileName(fileName: string): ReportKind | null {
  const words = normalizedWords(fileName);
  const compact = words.join("");

  if (hasAll(words, ["active", "review", "final"]) || compact.includes("activereviewfinal")) {
    return "active_review_final";
  }

  if (words.includes("qc") || compact.includes("ticketqc")) {
    return "ticket_qc";
  }

  if (
    hasAll(words, ["invoice", "cycle", "time"]) ||
    hasAll(words, ["total", "cycle", "time"]) ||
    compact.includes("invoicecycletime") ||
    compact.includes("totalcycletime")
  ) {
    return "total_cycle_time";
  }

  if (hasAll(words, ["open", "jobs"]) || compact.includes("openjobs")) {
    return "open_jobs";
  }

  return null;
}

export function identifyTicketQcStageFromFileName(fileName: string): TicketQcStage | null {
  const words = normalizedWords(fileName);
  const compact = words.join("");
  const hasQc = words.includes("qc") || words.includes("ticketqc") || compact.includes("ticketqc");
  if (!hasQc) return null;

  const hasReview = words.includes("review") || compact.includes("review");
  const hasFinal = words.includes("final") || compact.includes("final");

  if (hasReview && !hasFinal) return "review";
  if (hasFinal && !hasReview) return "final";
  return null;
}

export function reportKindMatchesFileName(kind: ReportKind, fileName: string) {
  return identifyReportKindFromFileName(fileName) === kind;
}

export function isActiveReviewFinalUpload(upload: { kind?: string | null; file_name?: string | null }) {
  return upload.kind === "active_review_final" || identifyReportKindFromFileName(upload.file_name ?? "") === "active_review_final";
}

export function isTicketQcUpload(upload: { kind?: string | null; file_name?: string | null }) {
  return upload.kind === "ticket_qc" || identifyReportKindFromFileName(upload.file_name ?? "") === "ticket_qc";
}

export function isTicketQcReviewUpload(upload: { kind?: string | null; file_name?: string | null }) {
  return isTicketQcUpload(upload) && identifyTicketQcStageFromFileName(upload.file_name ?? "") === "review";
}

export function isTicketQcFinalUpload(upload: { kind?: string | null; file_name?: string | null }) {
  return isTicketQcUpload(upload) && identifyTicketQcStageFromFileName(upload.file_name ?? "") === "final";
}

export function isTotalCycleTimeUpload(upload: { kind?: string | null; file_name?: string | null }) {
  return upload.kind === "total_cycle_time" || identifyReportKindFromFileName(upload.file_name ?? "") === "total_cycle_time";
}

export function isOpenJobsUpload(upload: { kind?: string | null; file_name?: string | null }) {
  return upload.kind === "open_jobs" || identifyReportKindFromFileName(upload.file_name ?? "") === "open_jobs";
}

function legacyReportKindLabel(kind: string | null | undefined) {
  if (kind === "total_tickets") return "Total Tickets";
  if (kind === "total_invoiced") return "Invoice Cycle Time";
  if (kind === "open_jobs") return "Open Jobs";
  return kind ?? "Unknown";
}

function normalizedWords(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

function hasAll(words: string[], expected: string[]) {
  return expected.every((word) => words.includes(word));
}
