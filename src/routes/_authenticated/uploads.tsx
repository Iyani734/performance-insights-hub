import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  UploadCloud,
  FileSpreadsheet,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Download,
  Check,
  X,
  ShieldAlert,
  User as UserIcon,
} from "lucide-react";
import { formatWeek } from "@/lib/kpi";
import {
  readWorkbook,
  parseTicketsSheet,
  parseOpenJobsSheet,
  parseTicketQualityCountSheet,
  type ParseStats,
} from "@/lib/parse";
import { canEdit, useAuth } from "@/lib/useAuth";
import { useDemoMode } from "@/lib/demoMode";
import { isSeededDemoUpload } from "@/lib/liveData";
import {
  calculateTotalCycleTime,
  hasValue,
  isFinalEditTicket,
  normalizeTicketStatus,
} from "@/lib/kpiRules";
import {
  identifyReportKindFromFileName,
  identifyTicketQualitySourceFromFileName,
  identifyTicketQcStageFromFileName,
  REPORT_KINDS,
  reportKindHint,
  reportKindLabel,
  type ReportKind,
} from "@/lib/reportTypes";
import {
  defaultLast7DaysRange,
  demoUploads,
  loadDemoLocalUploads,
  saveDemoLocalUploads,
  type DemoUploadMetrics,
  type DemoUploadRecord,
} from "@/lib/demoData";
import { replaceSupersededUploads } from "@/lib/uploadReplacement";
import { syncOpenJobCustomers } from "@/lib/customersServer";

export const Route = createFileRoute("/_authenticated/uploads")({ component: UploadsPage });

const KINDS = REPORT_KINDS;
const DEMO_UPLOADERS = ["Ian", "Yvette"];
const INSERT_CONCURRENCY = 3;

function isExcelFile(file: File) {
  return /\.(xlsx|xls)$/i.test(file.name);
}

function requiresPairedFiles(kind: ReportKind) {
  return kind === "ticket_qc" || kind === "ticket_quality";
}

function pairedFileKey(kind: ReportKind, file: File) {
  if (kind === "ticket_qc") return identifyTicketQcStageFromFileName(file.name);
  if (kind === "ticket_quality") return identifyTicketQualitySourceFromFileName(file.name);
  return null;
}

function requiredPairKeys(kind: ReportKind) {
  if (kind === "ticket_qc") return ["review", "final"];
  if (kind === "ticket_quality") return ["errors", "total"];
  return [];
}

function selectedPairKeys(files: File[], kind: ReportKind) {
  return new Set(files.map((file) => pairedFileKey(kind, file)).filter(Boolean));
}

function hasRequiredPairedFiles(files: File[], kind: ReportKind) {
  if (!requiresPairedFiles(kind)) return true;
  const selected = selectedPairKeys(files, kind);
  return requiredPairKeys(kind).every((key) => selected.has(key));
}

function missingPairedFileMessage(files: File[], kind: ReportKind) {
  if (!requiresPairedFiles(kind) || hasRequiredPairedFiles(files, kind)) return null;
  const selected = selectedPairKeys(files, kind);

  if (kind === "ticket_qc") {
    const missing = [
      !selected.has("review") ? "TicketQC REVIEW" : null,
      !selected.has("final") ? "TicketQC FINAL" : null,
    ].filter(Boolean);
    return `Add ${missing.join(" and ")} before uploading.`;
  }

  const missing = [
    !selected.has("errors") ? "Ticket Quality Error" : null,
    !selected.has("total") ? "TCR Total" : null,
  ].filter(Boolean);
  return `Add ${missing.join(" and ")} before uploading.`;
}

function fileIdentity(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function mergeSelectedFiles(kind: ReportKind, current: File[], incoming: File[]) {
  if (!requiresPairedFiles(kind)) return incoming.slice(0, 1);

  const byKey = new Map<string, File>();
  for (const file of current) {
    byKey.set(pairedFileKey(kind, file) ?? fileIdentity(file), file);
  }
  for (const file of incoming) {
    byKey.set(pairedFileKey(kind, file) ?? fileIdentity(file), file);
  }
  return Array.from(byKey.values());
}

function validateUploadSelection(files: File[], kind: ReportKind) {
  if (!files.length) throw new Error("Choose an Excel file before uploading.");
  if (files.some((file) => !isExcelFile(file))) throw new Error("Upload .xlsx or .xls files only.");
  if (kind !== "ticket_qc" && kind !== "ticket_quality" && files.length > 1) {
    throw new Error(`${reportKindLabel(kind)} accepts one file per upload.`);
  }

  const stages = new Set<string>();
  for (const file of files) {
    const inferredKind = identifyReportKindFromFileName(file.name);
    if (!inferredKind) {
      throw new Error(
    "The file name must include active review final, TicketQC REVIEW, TicketQC FINAL, ticket quality, TCR total, invoice cycle time, total cycle time, or open jobs.",
      );
    }
    if (inferredKind !== kind) {
      throw new Error(
        `This file name matches ${reportKindLabel(inferredKind)}. Select ${reportKindLabel(inferredKind)} or rename the file.`,
      );
    }
    if (kind === "ticket_qc") {
      const stage = identifyTicketQcStageFromFileName(file.name);
      if (!stage) {
        throw new Error("Ticket QC file names must include TicketQC REVIEW or TicketQC FINAL.");
      }
      if (stages.has(stage)) {
        throw new Error("Upload only one TicketQC REVIEW file and one TicketQC FINAL file at a time.");
      }
      stages.add(stage);
    }
    if (kind === "ticket_quality") {
      const source = identifyTicketQualitySourceFromFileName(file.name);
      if (!source) {
        throw new Error("Ticket Quality file names must include Ticket Quality or TCR Total.");
      }
      if (stages.has(source)) {
        throw new Error("Upload only one Ticket Quality Error file and one TCR Total file at a time.");
      }
      stages.add(source);
    }
  }

  if (kind === "ticket_qc" && !hasRequiredPairedFiles(files, kind)) {
    throw new Error("Ticket QC requires two files: TicketQC REVIEW and TicketQC FINAL.");
  }

  if (kind === "ticket_quality" && !hasRequiredPairedFiles(files, kind)) {
    throw new Error("Ticket Quality requires two files: Ticket Quality Error and TCR Total.");
  }
}

function mergeStats(stats: ParseStats[]): ParseStats {
  return stats.reduce<ParseStats>(
    (total, current) => ({
      source_rows: total.source_rows + current.source_rows,
      sheet_rows:
        total.sheet_rows != null || current.sheet_rows != null
          ? (total.sheet_rows ?? 0) + (current.sheet_rows ?? 0)
          : undefined,
      imported: total.imported + current.imported,
      skipped: total.skipped + current.skipped,
      errors: total.errors + current.errors,
      error_details: [...total.error_details, ...current.error_details],
    }),
    { source_rows: 0, sheet_rows: undefined, imported: 0, skipped: 0, errors: 0, error_details: [] },
  );
}

async function insertBatches<T>(rows: T[], insert: (batch: T[]) => Promise<void>) {
  const batches = chunk(rows, 500);
  let nextBatch = 0;
  const workers = Array.from({ length: Math.min(INSERT_CONCURRENCY, batches.length) }, async () => {
    while (nextBatch < batches.length) {
      const batch = batches[nextBatch++];
      await insert(batch);
    }
  });
  await Promise.all(workers);
}

function buildDemoUploadMetrics(
  kind: ReportKind,
  rows: any[],
  _effectiveFrom: string,
  _effectiveTo: string,
  fileName: string,
): DemoUploadMetrics | undefined {
  if (kind === "open_jobs") return undefined;
  if (kind === "active_review_final") {
    const statusRows = rows.map((row) => normalizeTicketStatus(row.status));
    return {
      tickets: rows.length,
      finalEdited: rows.some((row) => isFinalEditTicket(row))
        ? rows.filter((row) => isFinalEditTicket(row)).length
        : rows.filter((row) => hasValue(row.final_edited_by)).length,
      ticketVoids: rows.filter((row) => hasValue(row.void_reason)).length,
      activeTickets: statusRows.filter((status) => status === "active").length,
      reviewTickets: statusRows.filter((status) => status === "review").length,
      finalEditTickets: statusRows.filter((status) => status === "final edit").length,
    };
  }
  if (kind === "ticket_qc") {
    const stage = identifyTicketQcStageFromFileName(fileName);
    return {
      qcTickets: rows.length,
      qcReviewTickets: stage === "review" ? rows.length : undefined,
      qcFinalTickets: stage === "final" ? rows.length : undefined,
      reviewToFinalEdit: null,
    };
  }
  if (kind === "ticket_quality") {
    const source = identifyTicketQualitySourceFromFileName(fileName);
    return {
      qualityIssues: source === "errors" ? rows.length : undefined,
      qualityTotalTickets: source === "total" ? rows.length : undefined,
      ticketQuality: null,
    };
  }
  return {
    invoiced: rows.length,
    invoiceCycleTime: calculateTotalCycleTime(rows),
  };
}

function UploadsPage() {
  const qc = useQueryClient();
  const auth = useAuth();
  const { user, isSuperAdmin, loading: authLoading } = auth;
  const demoMode = useDemoMode();
  const canDeleteUploads = isSuperAdmin || canEdit(auth, "uploads");
  const defaultRange = defaultLast7DaysRange();
  const [kind, setKind] = useState<ReportKind>("active_review_final");
  const [effectiveFrom, setEffectiveFrom] = useState<string>(defaultRange.from);
  const [effectiveTo, setEffectiveTo] = useState<string>(defaultRange.to);
  const [files, setFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [demoUploadedRows, setDemoUploadedRows] =
    useState<DemoUploadRecord[]>(loadDemoLocalUploads);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [uploadStage, setUploadStage] = useState("");
  const isSnapshotUpload = kind === "active_review_final" || kind === "total_cycle_time";
  const snapshotUploadLabel =
    kind === "active_review_final"
      ? "Active/Review/Final"
      : kind === "total_cycle_time"
        ? "Invoice Cycle Time"
        : "snapshot";
  const uploadBucket = isSnapshotUpload ? defaultRange.to : effectiveFrom;
  const uploadEffectiveFrom = isSnapshotUpload ? defaultRange.to : effectiveFrom;
  const uploadEffectiveTo = isSnapshotUpload ? defaultRange.to : effectiveTo;

  const uploadsQ = useQuery({
    queryKey: ["uploads"],
    enabled: !demoMode,
    queryFn: async () => {
      const { data } = await supabase
        .from("report_uploads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []).filter((row) => !isSeededDemoUpload(row.file_name));
    },
  });

  const profilesQ = useQuery({
    queryKey: ["profiles_all", demoMode],
    queryFn: async () =>
      demoMode ? [] : ((await supabase.from("profiles").select("id,full_name,email")).data ?? []),
  });

  const requestsQ = useQuery({
    queryKey: ["delete_requests", demoMode],
    queryFn: async () =>
      demoMode
        ? []
        : ((
            await supabase
              .from("upload_delete_requests")
              .select("*")
              .order("created_at", { ascending: false })
          ).data ?? []),
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, { name: string; email: string }>();
    for (const p of (profilesQ.data ?? []) as any[])
      m.set(p.id, { name: p.full_name ?? p.email ?? "Unknown", email: p.email ?? "" });
    return m;
  }, [profilesQ.data]);

  const pendingByUpload = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of (requestsQ.data ?? []) as any[]) {
      if (r.status === "pending") m.set(r.upload_id, r);
    }
    return m;
  }, [requestsQ.data]);

  const uploads = useMemo(
    () => (demoMode ? [...demoUploadedRows, ...demoUploads()] : (uploadsQ.data ?? [])),
    [demoMode, demoUploadedRows, uploadsQ.data],
  );

  const upload = useMutation({
    mutationFn: async (selectedFiles: File[]) => {
      validateUploadSelection(selectedFiles, kind);
      const completedUploadIds: string[] = [];

      const processOneFile = async (selectedFile: File) => {
        const t0 = performance.now();
        setUploadStage(`Reading ${selectedFile.name}...`);
        const workbookPromise = readWorkbook(selectedFile);
        if (demoMode) {
          const wb = await workbookPromise;
          setUploadStage(`Checking rows in ${selectedFile.name}...`);
          const qualitySource = identifyTicketQualitySourceFromFileName(selectedFile.name);
          const parsed =
            kind === "open_jobs"
              ? parseOpenJobsSheet(wb)
              : kind === "ticket_quality"
                ? parseTicketQualityCountSheet(wb, qualitySource ?? "errors")
                : parseTicketsSheet(wb);
          const dt = Math.round(performance.now() - t0);
          return {
            stats: parsed.stats,
            demoUpload: {
              id: `demo-local-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              kind,
              week_start: uploadBucket,
              effective_from: uploadEffectiveFrom,
              effective_to: uploadEffectiveTo,
              file_name: selectedFile.name,
              file_path: null,
              row_count: parsed.stats.imported,
              uploaded_by: null,
              created_at: new Date().toISOString(),
              rows_skipped: parsed.stats.skipped,
              errors_count: parsed.stats.errors,
              processing_ms: dt,
              error_details: parsed.stats.error_details,
              status: parsed.stats.errors > 0 ? "partial" : "success",
              metrics: buildDemoUploadMetrics(kind, parsed.rows, uploadEffectiveFrom, uploadEffectiveTo, selectedFile.name),
            } satisfies DemoUploadRecord,
            customerSyncWarning: null,
            ticketQcWaiting: false,
          };
        }

        if (!user) throw new Error("Sign in to upload files.");
        const filePath = `${uploadBucket}/${Date.now()}-${selectedFile.name}`;
        setUploadStage(`Uploading ${selectedFile.name}...`);
        const storageUpload = supabase.storage
          .from("report-files")
          .upload(filePath, selectedFile, { upsert: false });
        let parsed;
        try {
          const wb = await workbookPromise;
          setUploadStage(`Checking rows in ${selectedFile.name}...`);
          const qualitySource = identifyTicketQualitySourceFromFileName(selectedFile.name);
          parsed =
            kind === "open_jobs"
              ? parseOpenJobsSheet(wb)
              : kind === "ticket_quality"
                ? parseTicketQualityCountSheet(wb, qualitySource ?? "errors")
                : parseTicketsSheet(wb);
        } catch (error) {
          const { error: storageError } = await storageUpload;
          if (!storageError) await supabase.storage.from("report-files").remove([filePath]);
          throw error;
        }
        const { error: storageError } = await storageUpload;
        if (storageError)
          throw new Error(`Could not store the original file: ${storageError.message}`);
        const { data: up, error: reportError } = await supabase
          .from("report_uploads")
          .insert({
            kind: kind as any,
            week_start: uploadBucket,
            file_name: selectedFile.name,
            uploaded_by: user.id,
            row_count: 0,
            status: "processing",
            file_path: filePath,
            effective_from: uploadEffectiveFrom,
            effective_to: uploadEffectiveTo,
          } as any)
          .select()
          .single();
        if (reportError || !up) {
          await supabase.storage.from("report-files").remove([filePath]);
          throw reportError ?? new Error("Could not create the upload record.");
        }

        let stats;
        let customerSyncWarning: string | null = null;
        let ticketQcWaiting = false;
        try {
          stats = parsed.stats;
          if (kind === "open_jobs") {
            const payload = parsed.rows.map((r) => ({
              ...r,
              upload_id: up.id,
              week_start: uploadBucket,
            }));
            setUploadStage(`Importing ${payload.length} rows from ${selectedFile.name}...`);
            await insertBatches(payload, async (batch) => {
              const { error } = await supabase.from("open_jobs").insert(batch as any);
              if (error) throw error;
            });
            const customerPairs = parsed.rows.reduce((map, row) => {
              if (row.customer_key && row.customer_name) {
                map.set(row.customer_key, row.customer_name);
              }
              return map;
            }, new Map<string, string>());
            if (customerPairs.size) {
              setUploadStage(`Updating ${customerPairs.size} customers...`);
              await syncOpenJobCustomers({
                data: {
                  uploadId: up.id,
                  customers: Array.from(customerPairs, ([key, name]) => ({ key, name })),
                },
              });
            }
          } else if (kind === "ticket_quality") {
            const qualitySource = identifyTicketQualitySourceFromFileName(selectedFile.name);
            if (qualitySource === "errors") {
              const payload = parsed.rows.map((r) => ({
                upload_id: up.id,
                week_start: uploadBucket,
                kind: "tickets",
                date_recv: r.occurrence_date,
                raw: { ...r.raw, source_type: "ticket_quality_error" },
              }));
              setUploadStage(`Importing ${payload.length} quality error rows from ${selectedFile.name}...`);
              await insertBatches(payload, async (batch) => {
                const { error } = await supabase.from("tickets").insert(batch as any);
                if (error) throw error;
              });
            }
          } else if (kind !== "ticket_qc") {
            const tKind = kind === "active_review_final" ? "tickets" : "invoiced";
            const payload = parsed.rows.map((r) => ({
              ...r,
              upload_id: up.id,
              week_start: uploadBucket,
              kind: tKind,
              raw: r.raw,
            }));
            setUploadStage(`Importing ${payload.length} rows from ${selectedFile.name}...`);
            await insertBatches(payload, async (batch) => {
              const { error } = await supabase.from("tickets").insert(batch as any);
              if (error) throw error;
            });
          }

          const dt = Math.round(performance.now() - t0);
          setUploadStage(`Saving results for ${selectedFile.name}...`);
          const { error: reportUpdateError } = await supabase
            .from("report_uploads")
            .update({
              row_count: stats.imported,
              rows_skipped: stats.skipped,
              errors_count: stats.errors,
              processing_ms: dt,
              error_details: stats.error_details as any,
              status: stats.errors > 0 ? "partial" : "success",
            })
            .eq("id", up.id);
          if (reportUpdateError) throw reportUpdateError;
          completedUploadIds.push(up.id);

          if (kind !== "open_jobs") {
            setUploadStage("Calculating dashboard metrics...");
            const { computeAutoKpisForRange } = await import("@/lib/kpi");
            const auto = await computeAutoKpisForRange(uploadEffectiveFrom, uploadEffectiveTo);
            ticketQcWaiting =
              (kind === "ticket_qc" && auto.review_to_final_edit == null) ||
              (kind === "ticket_quality" && auto.ticket_quality == null);
            const upserts = [
              { kpi_key: "review_to_final_edit", actual: auto.review_to_final_edit },
              { kpi_key: "ticket_quality", actual: auto.ticket_quality },
              { kpi_key: "invoice_cycle_time", actual: auto.invoice_cycle_time },
            ]
              .filter((v) => v.actual != null)
              .map((v) => ({ ...v, week_start: uploadBucket, source: "auto", entered_by: user.id }));
            if (upserts.length) {
              const { error: kpiError } = await supabase
                .from("kpi_values")
                .upsert(upserts, { onConflict: "kpi_key,week_start" });
              if (kpiError) throw kpiError;
            }
          }
          return { stats, demoUpload: undefined, customerSyncWarning, ticketQcWaiting };
        } catch (error: any) {
          const reason = error?.message ?? "Upload processing failed";
          const details = [...(stats?.error_details ?? []), { row: 0, reason }];
          const { error: failedStatusError } = await supabase
            .from("report_uploads")
            .update({
              status: "failed",
              errors_count: Math.max(1, stats?.errors ?? 0),
              error_details: details,
              processing_ms: Math.round(performance.now() - t0),
            })
            .eq("id", up.id);
          if (failedStatusError) {
            throw new Error(
              `${reason}. The upload could not be marked as failed: ${failedStatusError.message}`,
            );
          }
          throw error;
        }
      };

      const results = [];
      for (const selectedFile of selectedFiles) {
        results.push(await processOneFile(selectedFile));
      }

      let replacedUploads = 0;
      let replacementWarnings: string[] = [];
      if (!demoMode && completedUploadIds.length) {
        setUploadStage(
          isSnapshotUpload
            ? `Replacing older ${snapshotUploadLabel} snapshot...`
            : "Replacing older files for this date range...",
        );
        try {
          const replacement = await replaceSupersededUploads({
            data: { uploadIds: completedUploadIds },
          });
          replacedUploads = replacement.deleted;
          replacementWarnings = replacement.storageErrors ?? [];
        } catch (error: any) {
          replacementWarnings = [
            `The new upload succeeded, but older matching uploads were not removed: ${error?.message ?? "Unknown error"}`,
          ];
        }
      }

      if (!demoMode && kind !== "open_jobs") {
        setUploadStage("Refreshing dashboard metrics...");
        const { computeAutoKpisForRange } = await import("@/lib/kpi");
        const auto = await computeAutoKpisForRange(uploadEffectiveFrom, uploadEffectiveTo);
        const upserts = [
          { kpi_key: "review_to_final_edit", actual: auto.review_to_final_edit },
          { kpi_key: "ticket_quality", actual: auto.ticket_quality },
          { kpi_key: "invoice_cycle_time", actual: auto.invoice_cycle_time },
        ]
          .filter((value) => value.actual != null)
          .map((value) => ({ ...value, week_start: uploadBucket, source: "auto", entered_by: user!.id }));
        if (upserts.length) {
          const { error: kpiError } = await supabase
            .from("kpi_values")
            .upsert(upserts, { onConflict: "kpi_key,week_start" });
          if (kpiError) throw kpiError;
        }
      }

      return {
        stats: mergeStats(results.map((result) => result.stats)),
        demoUploads: results.map((result) => result.demoUpload).filter(Boolean) as DemoUploadRecord[],
        customerSyncWarnings: results
          .map((result) => result.customerSyncWarning)
          .filter((message): message is string => !!message),
        ticketQcWaiting: results.some((result) => result.ticketQcWaiting),
        replacedUploads,
        replacementWarnings,
      };
    },
    onSuccess: ({
      stats: s,
      demoUploads: uploadedDemoRows,
      customerSyncWarnings,
      ticketQcWaiting,
      replacedUploads,
      replacementWarnings,
    }) => {
      if (uploadedDemoRows.length) {
        setDemoUploadedRows((prev) => {
          const next = [...uploadedDemoRows, ...prev].slice(0, 25);
          saveDemoLocalUploads(next);
          return next;
        });
      }
      const workbookRows =
        s.sheet_rows && s.sheet_rows !== s.imported
          ? ` (${s.sheet_rows} Excel rows including headers)`
          : "";
      const rowSummary =
        s.source_rows === s.imported
          ? `${s.imported} data rows imported${workbookRows}`
          : `${s.source_rows} data rows found; ${s.imported} imported${s.skipped ? `, ${s.skipped} skipped` : ""}${s.errors ? `, ${s.errors} errors` : ""}${workbookRows}`;
      toast.success(rowSummary);
      if (replacedUploads) {
        toast.success(
          isSnapshotUpload
            ? `Replaced ${replacedUploads} older ${snapshotUploadLabel} snapshot${replacedUploads === 1 ? "" : "s"}.`
            : `Replaced ${replacedUploads} older upload${replacedUploads === 1 ? "" : "s"} for this date range.`,
        );
      }
      for (const warning of Array.from(new Set(customerSyncWarnings))) toast.warning(warning);
      for (const warning of Array.from(new Set(replacementWarnings))) toast.warning(warning);
      if (ticketQcWaiting) {
        toast.warning("Upload imported. The KPI will calculate after both required source files exist for this date range.");
      }
      setUploadStage("");
      setFiles([]);
      setFileInputKey((v) => v + 1);
      qc.invalidateQueries();
    },
    onError: (e: any) => {
      setUploadStage("");
      toast.error(e.message ?? "Upload failed");
    },
  });

  // Users with upload edit access delete directly. View-only users cannot delete.
  const requestDelete = useMutation({
    mutationFn: async () => {
      if (!deleteTarget || !user) return;
      const { error } = await supabase.from("upload_delete_requests").insert({
        upload_id: deleteTarget.id,
        requested_by: user.id,
        requested_by_name: profileMap.get(user.id)?.name ?? user.email,
        reason: deleteReason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deletion requested — awaiting admin approval");
      setDeleteTarget(null);
      setDeleteReason("");
      qc.invalidateQueries({ queryKey: ["delete_requests"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const adminDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("report_uploads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Upload deleted");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resolveReq = useMutation({
    mutationFn: async ({ req, approve }: { req: any; approve: boolean }) => {
      if (approve) {
        const { error: dErr } = await supabase
          .from("report_uploads")
          .delete()
          .eq("id", req.upload_id);
        if (dErr) throw dErr;
      }
      const { error } = await supabase
        .from("upload_delete_requests")
        .update({
          status: approve ? "approved" : "rejected",
          resolved_by: user?.id ?? null,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", req.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Approved & deleted" : "Rejected");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function downloadFile(u: any) {
    if (!u.file_path) {
      toast.error("Original file not stored");
      return;
    }
    const { data, error } = await supabase.storage
      .from("report-files")
      .createSignedUrl(u.file_path, 60);
    if (error) {
      toast.error(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  const pendingCount = (requestsQ.data ?? []).filter((r: any) => r.status === "pending").length;
  const fileError = files.some((selectedFile) => !isExcelFile(selectedFile))
    ? "Upload .xlsx or .xls files only."
    : null;
  const pairedFileMessage = missingPairedFileMessage(files, kind);
  const uploadDisabled =
    upload.isPending ||
    files.length === 0 ||
    !!fileError ||
    !hasRequiredPairedFiles(files, kind) ||
    (!isSnapshotUpload && (!effectiveFrom || !effectiveTo || effectiveFrom > effectiveTo)) ||
    (!demoMode && !canEdit(auth, "uploads")) ||
    (!demoMode && authLoading);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header>
        <h1 className="font-display text-3xl font-semibold">Report Uploads</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload Active/Review/Final, Ticket QC, Invoice Cycle Time, or Open Jobs exports.
        </p>
      </header>

      <Card className="p-6">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Report type</Label>
            <Select
              value={kind}
              onValueChange={(v: any) => {
                setKind(v);
                setFiles([]);
                setFileInputKey((value) => value + 1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{reportKindHint(kind)}</p>
          </div>
          {!isSnapshotUpload && (
            <>
              <div className="space-y-2">
                <Label>Effective from</Label>
                <Input
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Effective to</Label>
                <Input
                  type="date"
                  value={effectiveTo}
                  onChange={(e) => setEffectiveTo(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="space-y-2 md:col-span-3">
            <Label>File (.xlsx / .xls)</Label>
            <Input
              key={fileInputKey}
              type="file"
              accept=".xlsx,.xls"
              multiple={kind === "ticket_qc" || kind === "ticket_quality"}
              onChange={(e) => {
                const incoming = Array.from(e.target.files ?? []);
                setFiles((current) => mergeSelectedFiles(kind, current, incoming));
                setFileInputKey((value) => value + 1);
              }}
            />
            <p className="text-xs text-muted-foreground">
              {isSnapshotUpload
                ? `This is a current snapshot. Uploading a new ${snapshotUploadLabel} file replaces the previous snapshot. The header row is not counted as imported data.`
                : "Pick the date range this file's data covers. The header row is not counted as imported data."}
              {kind === "ticket_qc"
                ? " Ticket QC can accept TicketQC REVIEW and TicketQC FINAL together, or one at a time."
                : kind === "ticket_quality"
                  ? " Ticket Quality can accept Ticket Quality Error and TCR Total together, or one at a time."
                : ""}
            </p>
            {fileError && <p className="text-xs text-destructive">{fileError}</p>}
            {pairedFileMessage && (
              <p className="text-xs text-warning">{pairedFileMessage}</p>
            )}
          </div>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <Button onClick={() => upload.mutate(files)} disabled={uploadDisabled}>
            <UploadCloud className="w-4 h-4 mr-2" />
            {upload.isPending ? "Processing…" : demoMode ? "Process Demo File" : "Upload & Process"}
          </Button>
          {files.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {files.map((selectedFile) => selectedFile.name).join(", ")}
            </span>
          )}
          {files.length > 0 && !upload.isPending && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setFiles([]);
                setFileInputKey((value) => value + 1);
              }}
            >
              Clear
            </Button>
          )}
          {upload.isPending && (
            <span className="text-sm text-muted-foreground">
              {uploadStage || "Starting upload..."}
            </span>
          )}
        </div>
      </Card>

      {canDeleteUploads && pendingCount > 0 && (
        <Card className="p-6 border-warning/40 bg-warning/5">
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-warning" />
            Pending deletion requests{" "}
            <span className="text-xs font-normal text-muted-foreground">({pendingCount})</span>
          </h2>
          <div className="space-y-2">
            {(requestsQ.data ?? [])
              .filter((r: any) => r.status === "pending")
              .map((r: any) => {
                const u = uploads.find((x: any) => x.id === r.upload_id);
                return (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center gap-3 p-3 rounded-md bg-card border"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {u?.file_name ?? "Deleted file"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Requested by <b>{r.requested_by_name ?? "Unknown"}</b> ·{" "}
                        {new Date(r.created_at).toLocaleString()}
                        {r.reason ? ` · "${r.reason}"` : ""}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolveReq.mutate({ req: r, approve: false })}
                      disabled={resolveReq.isPending}
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => resolveReq.mutate({ req: r, approve: true })}
                      disabled={resolveReq.isPending}
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      Approve & delete
                    </Button>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      <Card>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Upload history</h2>
          <span className="text-xs text-muted-foreground">{uploads.length} uploads</span>
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/70 text-xs uppercase text-muted-foreground sticky top-0 backdrop-blur z-10">
              <tr>
                <th className="text-left px-4 py-3 font-medium">When</th>
                <th className="text-left px-4 py-3 font-medium">Uploaded by</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Week</th>
                <th className="text-left px-4 py-3 font-medium">File</th>
                <th className="text-right px-4 py-3 font-medium">Imported</th>
                <th className="text-right px-4 py-3 font-medium">Errors</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {uploads.map((u: any, index: number) => {
                const uploader = u.uploaded_by ? profileMap.get(u.uploaded_by) : null;
                const uploaderName =
                  uploader?.name ??
                  (u.file_name?.startsWith("demo-")
                    ? DEMO_UPLOADERS[index % DEMO_UPLOADERS.length]
                    : "Unknown");
                const pending = pendingByUpload.get(u.id);
                const isMine = user?.id === u.uploaded_by;
                const uploadStatus =
                  u.status === "processing" &&
                  Date.now() - new Date(u.created_at).getTime() > 5 * 60 * 1000
                    ? "failed"
                    : u.status;
                return (
                  <tr key={u.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {new Date(u.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-semibold">
                          {uploaderName.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="font-medium">{uploaderName}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <FileSpreadsheet className="w-4 h-4 text-primary" />
                        {reportKindLabel(u.kind)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatWeek(u.week_start)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground max-w-[220px] truncate">
                      {u.file_name}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">{u.row_count ?? 0}</td>
                    <td
                      className={`px-4 py-2.5 text-right ${(u.errors_count ?? 0) > 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}
                    >
                      {u.errors_count ?? 0}
                    </td>
                    <td className="px-4 py-2.5">
                      {uploadStatus === "success" && (
                        <span className="inline-flex items-center gap-1 text-success text-xs font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Success
                        </span>
                      )}
                      {uploadStatus === "partial" && (
                        <span className="inline-flex items-center gap-1 text-warning text-xs font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Partial
                        </span>
                      )}
                      {uploadStatus === "failed" && (
                        <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Failed
                        </span>
                      )}
                      {uploadStatus === "processing" && (
                        <span className="text-muted-foreground text-xs">Processing…</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {u.file_path && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => downloadFile(u)}
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                      {pending ? (
                        <span className="text-xs text-warning font-medium ml-1">
                          Deletion pending
                        </span>
                      ) : canDeleteUploads ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            confirm("Delete this upload and its data?") && adminDelete.mutate(u.id)
                          }
                          title="Delete upload"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      ) : isMine ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled
                          onClick={() => {
                            setDeleteTarget(u);
                            setDeleteReason("");
                          }}
                          title="Ask an admin to enable Uploads edit access before deleting"
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {uploads.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-sm text-muted-foreground">
                    No uploads yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setDeleteReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request deletion</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This request goes to an admin for approval. On approval,{" "}
              <b>{deleteTarget?.file_name}</b> and all its imported rows will be permanently
              removed.
            </p>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. Wrong date range selected, corrupted data…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => requestDelete.mutate()} disabled={requestDelete.isPending}>
              {requestDelete.isPending ? "Sending…" : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
