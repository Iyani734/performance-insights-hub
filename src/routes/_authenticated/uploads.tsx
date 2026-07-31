import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { UploadCloud, FileSpreadsheet, Trash2, CheckCircle2, AlertTriangle, Download, Check, X, ShieldAlert, User as UserIcon } from "lucide-react";
import { formatWeek } from "@/lib/kpi";
import { readWorkbook, parseTicketsSheet, parseOpenJobsSheet } from "@/lib/parse";
import { useAuth } from "@/lib/useAuth";
import { useDemoMode } from "@/lib/demoMode";
import { isSeededDemoUpload } from "@/lib/liveData";
import {
  defaultLast7DaysRange,
  demoUploads,
  loadDemoLocalUploads,
  saveDemoLocalUploads,
  type DemoUploadKind,
  type DemoUploadMetrics,
  type DemoUploadRecord,
} from "@/lib/demoData";

export const Route = createFileRoute("/_authenticated/uploads")({ component: UploadsPage });

const KINDS = [
  { value: "total_tickets", label: "Total Tickets" },
  { value: "total_invoiced", label: "Total Invoiced" },
  { value: "open_jobs", label: "Open Jobs" },
] as const;
const DEMO_UPLOADERS = ["Ian", "Yvette"];
const INSERT_CONCURRENCY = 3;

function isExcelFile(file: File) {
  return /\.(xlsx|xls)$/i.test(file.name);
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

function buildDemoUploadMetrics(kind: DemoUploadKind, rows: any[], effectiveTo: string): DemoUploadMetrics | undefined {
  if (kind === "open_jobs") return undefined;
  const completedRows = rows.filter((row) => !row.void_reason || String(row.void_reason).trim() === "");
  if (kind === "total_tickets") {
    return {
      tickets: rows.length,
      finalEdited: rows.filter((row) => row.final_edited_by).length,
      ticketVoids: rows.length - completedRows.length,
    };
  }
  const endMs = new Date(`${effectiveTo}T00:00:00`).getTime() + 86400000;
  const cycleDays = rows
    .map((row) => row.date_recv ? Math.max(0, (endMs - new Date(row.date_recv).getTime()) / 86400000) : null)
    .filter((days): days is number => days != null && Number.isFinite(days));
  return {
    invoiced: rows.length,
    invoiceQualityIssues: rows.filter((row) => row.void_reason && String(row.void_reason).trim() !== "").length,
    invoiceCycleDaysTotal: cycleDays.reduce((sum, days) => sum + days, 0),
    invoiceCycleCount: cycleDays.length,
  };
}

function UploadsPage() {
  const qc = useQueryClient();
  const { user, role, isSuperAdmin, loading: authLoading } = useAuth();
  const demoMode = useDemoMode();
  const isAdmin = isSuperAdmin || role === "admin";
  const defaultRange = defaultLast7DaysRange();
  const [kind, setKind] = useState<DemoUploadKind>("total_tickets");
  const [effectiveFrom, setEffectiveFrom] = useState<string>(defaultRange.from);
  const [effectiveTo, setEffectiveTo] = useState<string>(defaultRange.to);
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [demoUploadedRows, setDemoUploadedRows] = useState<DemoUploadRecord[]>(loadDemoLocalUploads);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [uploadStage, setUploadStage] = useState("");
  const uploadBucket = effectiveFrom;

  const uploadsQ = useQuery({
    queryKey: ["uploads"],
    enabled: !demoMode,
    queryFn: async () => {
      const { data } = await supabase.from("report_uploads").select("*").order("created_at", { ascending: false }).limit(50);
      return (data ?? []).filter((row) => !isSeededDemoUpload(row.file_name));
    },
  });

  const profilesQ = useQuery({
    queryKey: ["profiles_all", demoMode],
    queryFn: async () => demoMode ? [] : (await supabase.from("profiles").select("id,full_name,email")).data ?? [],
  });

  const requestsQ = useQuery({
    queryKey: ["delete_requests", demoMode],
    queryFn: async () => demoMode ? [] : (await supabase.from("upload_delete_requests").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, { name: string; email: string }>();
    for (const p of (profilesQ.data ?? []) as any[]) m.set(p.id, { name: p.full_name ?? p.email ?? "Unknown", email: p.email ?? "" });
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
    () => demoMode ? [...demoUploadedRows, ...demoUploads()] : (uploadsQ.data ?? []),
    [demoMode, demoUploadedRows, uploadsQ.data],
  );

  const upload = useMutation({
    mutationFn: async (selectedFile: File | null) => {
      if (!selectedFile) throw new Error("Choose an Excel file before uploading.");
      if (!isExcelFile(selectedFile)) throw new Error("Upload a .xlsx or .xls file.");
      const t0 = performance.now();
      setUploadStage("Reading spreadsheet...");
      const workbookPromise = readWorkbook(selectedFile);
      if (demoMode) {
        const wb = await workbookPromise;
        setUploadStage("Checking rows...");
        const parsed = kind === "open_jobs" ? parseOpenJobsSheet(wb) : parseTicketsSheet(wb);
        const dt = Math.round(performance.now() - t0);
        return {
          stats: parsed.stats,
          demoUpload: {
            id: `demo-local-upload-${Date.now()}`,
            kind,
            week_start: uploadBucket,
            effective_from: effectiveFrom,
            effective_to: effectiveTo,
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
            metrics: buildDemoUploadMetrics(kind, parsed.rows, effectiveTo),
          } satisfies DemoUploadRecord,
        };
      }
      if (!user) throw new Error("Sign in to upload files.");
      const filePath = `${uploadBucket}/${Date.now()}-${selectedFile.name}`;
      setUploadStage("Uploading file and creating report...");
      const storageUpload = supabase.storage.from("report-files").upload(filePath, selectedFile, { upsert: false });
      const reportInsert = Promise.resolve(supabase.from("report_uploads")
        .insert({ kind, week_start: uploadBucket, file_name: selectedFile.name, uploaded_by: user.id, row_count: 0, status: "processing", file_path: filePath, effective_from: effectiveFrom, effective_to: effectiveTo } as any)
        .select().single());
      const wb = await workbookPromise;
      setUploadStage("Checking rows...");
      const parsed = kind === "open_jobs" ? parseOpenJobsSheet(wb) : parseTicketsSheet(wb);
      const [{ error: storageError }, { data: up, error: reportError }] = await Promise.all([storageUpload, reportInsert]);
      if (storageError || reportError || !up) {
        if (up) await supabase.from("report_uploads").delete().eq("id", up.id);
        if (!storageError) await supabase.storage.from("report-files").remove([filePath]);
        throw storageError ?? reportError ?? new Error("Could not create the upload record.");
      }
      let stats;
      if (kind === "open_jobs") {
        stats = parsed.stats;
        const payload = parsed.rows.map(r => ({ ...r, upload_id: up.id, week_start: uploadBucket }));
        setUploadStage(`Importing ${payload.length} rows...`);
        await insertBatches(payload, async (batch) => {
          const { error } = await supabase.from("open_jobs").insert(batch as any);
          if (error) throw error;
        });
      } else {
        stats = parsed.stats;
        const tKind = kind === "total_tickets" ? "tickets" : "invoiced";
        const payload = parsed.rows.map(r => ({ ...r, upload_id: up.id, week_start: uploadBucket, kind: tKind, raw: r.raw }));
        setUploadStage(`Importing ${payload.length} rows...`);
        await insertBatches(payload, async (batch) => {
          const { error } = await supabase.from("tickets").insert(batch as any);
          if (error) throw error;
        });
        setUploadStage("Calculating dashboard metrics...");
        const { computeAutoKpisForRange } = await import("@/lib/kpi");
        const auto = await computeAutoKpisForRange(uploadBucket, effectiveTo);
        const upserts = [
          { kpi_key: "review_to_final_edit", actual: auto.review_to_final_edit },
          { kpi_key: "ticket_quality", actual: auto.ticket_quality },
        ].filter(v => v.actual != null).map(v => ({ ...v, week_start: uploadBucket, source: "auto", entered_by: user.id }));
        const kpiWrite = upserts.length
          ? Promise.resolve(supabase.from("kpi_values").upsert(upserts, { onConflict: "kpi_key,week_start" }))
          : Promise.resolve({ error: null });
        const dt = Math.round(performance.now() - t0);
        const reportWrite = supabase.from("report_uploads").update({
          row_count: stats.imported, rows_skipped: stats.skipped, errors_count: stats.errors,
          processing_ms: dt, error_details: stats.error_details as any,
          status: stats.errors > 0 ? "partial" : "success",
        }).eq("id", up.id);
        const [kpiResult, reportResult] = await Promise.all([kpiWrite, reportWrite]);
        if (kpiResult.error) throw kpiResult.error;
        if (reportResult.error) throw reportResult.error;
        return { stats };
      }
      const dt = Math.round(performance.now() - t0);
      const { error: updateError } = await supabase.from("report_uploads").update({
        row_count: stats.imported, rows_skipped: stats.skipped, errors_count: stats.errors,
        processing_ms: dt, error_details: stats.error_details as any,
        status: stats.errors > 0 ? "partial" : "success",
      }).eq("id", up.id);
      if (updateError) throw updateError;
      return { stats };
    },
    onSuccess: ({ stats: s, demoUpload }) => {
      if (demoUpload) {
        setDemoUploadedRows((prev) => {
          const next = [demoUpload, ...prev].slice(0, 25);
          saveDemoLocalUploads(next);
          return next;
        });
      }
      const rowSummary = s.source_rows === s.imported
        ? `${s.imported} data rows imported`
        : `${s.source_rows} data rows found; ${s.imported} imported${s.skipped ? `, ${s.skipped} skipped` : ""}${s.errors ? `, ${s.errors} errors` : ""}`;
      toast.success(rowSummary);
      setUploadStage("");
      setFile(null);
      setFileInputKey((v) => v + 1);
      qc.invalidateQueries();
    },
    onError: (e: any) => { setUploadStage(""); toast.error(e.message ?? "Upload failed"); },
  });

  // Non-admin: request deletion; Admin: delete immediately
  const requestDelete = useMutation({
    mutationFn: async () => {
      if (!deleteTarget || !user) return;
      const { error } = await supabase.from("upload_delete_requests").insert({
        upload_id: deleteTarget.id, requested_by: user.id,
        requested_by_name: profileMap.get(user.id)?.name ?? user.email,
        reason: deleteReason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deletion requested — awaiting admin approval"); setDeleteTarget(null); setDeleteReason(""); qc.invalidateQueries({ queryKey: ["delete_requests"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const adminDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("report_uploads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Upload deleted"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const resolveReq = useMutation({
    mutationFn: async ({ req, approve }: { req: any; approve: boolean }) => {
      if (approve) {
        const { error: dErr } = await supabase.from("report_uploads").delete().eq("id", req.upload_id);
        if (dErr) throw dErr;
      }
      const { error } = await supabase.from("upload_delete_requests").update({
        status: approve ? "approved" : "rejected",
        resolved_by: user?.id ?? null, resolved_at: new Date().toISOString(),
      }).eq("id", req.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success(v.approve ? "Approved & deleted" : "Rejected"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  async function downloadFile(u: any) {
    if (!u.file_path) { toast.error("Original file not stored"); return; }
    const { data, error } = await supabase.storage.from("report-files").createSignedUrl(u.file_path, 60);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  }

  const pendingCount = (requestsQ.data ?? []).filter((r: any) => r.status === "pending").length;
  const fileError = file && !isExcelFile(file) ? "Upload a .xlsx or .xls file." : null;
  const uploadDisabled =
    upload.isPending ||
    !file ||
    !!fileError ||
    !effectiveFrom ||
    !effectiveTo ||
    effectiveFrom > effectiveTo ||
    (!demoMode && authLoading);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header>
        <h1 className="font-display text-3xl font-semibold">Report Uploads</h1>
        <p className="text-sm text-muted-foreground mt-1">Upload Total Tickets, Total Invoiced, or Open Jobs exports.</p>
      </header>


      <Card className="p-6">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Report type</Label>
            <Select value={kind} onValueChange={(v: any) => setKind(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{KINDS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Effective from</Label>
            <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Effective to</Label>
            <Input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label>File (.xlsx / .xls)</Label>
            <Input key={fileInputKey} type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">
              Pick the date range this file's data actually covers. The header row is not counted as imported data.
            </p>
            {fileError && <p className="text-xs text-destructive">{fileError}</p>}
          </div>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <Button onClick={() => upload.mutate(file)} disabled={uploadDisabled}>
            <UploadCloud className="w-4 h-4 mr-2" />{upload.isPending ? "Processing…" : demoMode ? "Process Demo File" : "Upload & Process"}
          </Button>
          {file && <span className="text-sm text-muted-foreground">{file.name}</span>}
          {upload.isPending && <span className="text-sm text-muted-foreground">{uploadStage || "Starting upload..."}</span>}
        </div>
      </Card>

      {isAdmin && pendingCount > 0 && (
        <Card className="p-6 border-warning/40 bg-warning/5">
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-warning" />
            Pending deletion requests <span className="text-xs font-normal text-muted-foreground">({pendingCount})</span>
          </h2>
          <div className="space-y-2">
            {(requestsQ.data ?? []).filter((r: any) => r.status === "pending").map((r: any) => {
              const u = uploads.find((x: any) => x.id === r.upload_id);
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 p-3 rounded-md bg-card border">
                  <FileSpreadsheet className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{u?.file_name ?? "Deleted file"}</div>
                    <div className="text-xs text-muted-foreground">Requested by <b>{r.requested_by_name ?? "Unknown"}</b> · {new Date(r.created_at).toLocaleString()}{r.reason ? ` · "${r.reason}"` : ""}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => resolveReq.mutate({ req: r, approve: false })} disabled={resolveReq.isPending}>
                    <X className="w-3.5 h-3.5 mr-1" />Reject
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => resolveReq.mutate({ req: r, approve: true })} disabled={resolveReq.isPending}>
                    <Check className="w-3.5 h-3.5 mr-1" />Approve & delete
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
                const uploaderName = uploader?.name ?? (u.file_name?.startsWith("demo-") ? DEMO_UPLOADERS[index % DEMO_UPLOADERS.length] : "Unknown");
                const pending = pendingByUpload.get(u.id);
                const isMine = user?.id === u.uploaded_by;
                return (
                  <tr key={u.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{new Date(u.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-semibold">
                          {uploaderName.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="font-medium">{uploaderName}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1.5"><FileSpreadsheet className="w-4 h-4 text-primary" />{KINDS.find(k => k.value === u.kind)?.label ?? u.kind}</span></td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatWeek(u.week_start)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground max-w-[220px] truncate">{u.file_name}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{u.row_count ?? 0}</td>
                    <td className={`px-4 py-2.5 text-right ${(u.errors_count ?? 0) > 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>{u.errors_count ?? 0}</td>
                    <td className="px-4 py-2.5">
                      {u.status === "success" && <span className="inline-flex items-center gap-1 text-success text-xs font-medium"><CheckCircle2 className="w-3.5 h-3.5" />Success</span>}
                      {u.status === "partial" && <span className="inline-flex items-center gap-1 text-warning text-xs font-medium"><AlertTriangle className="w-3.5 h-3.5" />Partial</span>}
                      {u.status === "processing" && <span className="text-muted-foreground text-xs">Processing…</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {u.file_path && <Button size="sm" variant="ghost" onClick={() => downloadFile(u)} title="Download"><Download className="w-4 h-4" /></Button>}
                      {pending ? (
                        <span className="text-xs text-warning font-medium ml-1">Deletion pending</span>
                      ) : isAdmin ? (
                        <Button size="sm" variant="ghost" onClick={() => confirm("Delete this upload and its data?") && adminDelete.mutate(u.id)} title="Delete (admin)">
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      ) : isMine ? (
                        <Button size="sm" variant="ghost" onClick={() => { setDeleteTarget(u); setDeleteReason(""); }} title="Request deletion">
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {uploads.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-sm text-muted-foreground">No uploads yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request deletion</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This request goes to an admin for approval. On approval, <b>{deleteTarget?.file_name}</b> and all its imported rows will be permanently removed.
            </p>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Textarea value={deleteReason} onChange={e => setDeleteReason(e.target.value)} placeholder="e.g. Wrong date range selected, corrupted data…" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
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
