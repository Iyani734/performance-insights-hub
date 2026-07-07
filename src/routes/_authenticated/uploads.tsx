import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { UploadCloud, FileSpreadsheet, Trash2 } from "lucide-react";
import { formatWeek, weekStartOf } from "@/lib/kpi";
import { readWorkbook, parseTicketsSheet, parseOpenJobsSheet } from "@/lib/parse";
import { useAuth } from "@/lib/useAuth";

export const Route = createFileRoute("/_authenticated/uploads")({ component: UploadsPage });

const KINDS = [
  { value: "total_tickets", label: "Total Tickets" },
  { value: "total_invoiced", label: "Total Invoiced" },
  { value: "open_jobs", label: "Open Jobs" },
] as const;

function UploadsPage() {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("total_tickets");
  const [week, setWeek] = useState<string>(weekStartOf(new Date()));
  const [file, setFile] = useState<File | null>(null);

  const uploadsQ = useQuery({
    queryKey: ["uploads"],
    queryFn: async () => {
      const { data } = await supabase.from("report_uploads").select("*").order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !user) throw new Error("Missing file");
      const wb = await readWorkbook(file);
      const { data: up, error } = await supabase.from("report_uploads")
        .insert({ kind, week_start: week, file_name: file.name, uploaded_by: user.id, row_count: 0 })
        .select().single();
      if (error) throw error;

      if (kind === "open_jobs") {
        const rows = parseOpenJobsSheet(wb);
        const chunks = chunk(rows.map(r => ({ ...r, upload_id: up.id, week_start: week })), 500);
        for (const c of chunks) {
          const { error: e } = await supabase.from("open_jobs").insert(c as any);
          if (e) throw e;
        }
        await supabase.from("report_uploads").update({ row_count: rows.length }).eq("id", up.id);
        return { count: rows.length };
      } else {
        const rows = parseTicketsSheet(wb);
        const tKind = kind === "total_tickets" ? "tickets" : "invoiced";
        const payload = rows.map(r => ({ ...r, upload_id: up.id, week_start: week, kind: tKind, raw: r.raw }));
        const chunks = chunk(payload, 500);
        for (const c of chunks) {
          const { error: e } = await supabase.from("tickets").insert(c as any);
          if (e) throw e;
        }
        // Auto-record KPI values from this upload
        const { computeAutoKpis } = await import("@/lib/kpi");
        const auto = await computeAutoKpis(week);
        const upserts = [
          { kpi_key: "review_to_final_edit", actual: auto.review_to_final_edit },
          { kpi_key: "ticket_quality", actual: auto.ticket_quality },
          { kpi_key: "invoice_cycle_time", actual: auto.invoice_cycle_time },
          { kpi_key: "dispatch_completion", actual: auto.dispatch_completion },
        ].filter(v => v.actual != null).map(v => ({ ...v, week_start: week, source: "auto", entered_by: user.id }));
        if (upserts.length) {
          await supabase.from("kpi_values").upsert(upserts, { onConflict: "kpi_key,week_start" });
        }
        await supabase.from("report_uploads").update({ row_count: rows.length }).eq("id", up.id);
        return { count: rows.length };
      }
    },
    onSuccess: (r) => {
      toast.success(`Uploaded ${r.count} rows`);
      setFile(null);
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message ?? "Upload failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("report_uploads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Weekly Uploads</h1>
        <p className="text-sm text-muted-foreground mt-1">Upload Total Tickets, Total Invoiced, or Open Jobs exports.</p>
      </header>

      <Card className="p-6">
        <div className="grid md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Report type</Label>
            <Select value={kind} onValueChange={(v: any) => setKind(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{KINDS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Week starting</Label>
            <Input type="date" value={week} onChange={(e) => setWeek(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>File (.xlsx / .xls)</Label>
            <Input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <Button onClick={() => upload.mutate()} disabled={!file || upload.isPending}>
            <UploadCloud className="w-4 h-4 mr-2" />
            {upload.isPending ? "Processing…" : "Upload & Process"}
          </Button>
          {file && <span className="text-sm text-muted-foreground">{file.name}</span>}
        </div>
      </Card>

      <Card>
        <div className="px-6 py-4 border-b">
          <h2 className="font-display text-lg font-semibold">Upload history</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-6 py-3 font-medium">When</th>
              <th className="text-left px-6 py-3 font-medium">Type</th>
              <th className="text-left px-6 py-3 font-medium">Week</th>
              <th className="text-left px-6 py-3 font-medium">File</th>
              <th className="text-left px-6 py-3 font-medium">Rows</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {(uploadsQ.data ?? []).map((u: any) => (
              <tr key={u.id} className="border-t">
                <td className="px-6 py-3 text-muted-foreground">{new Date(u.created_at).toLocaleString()}</td>
                <td className="px-6 py-3"><span className="inline-flex items-center gap-1.5"><FileSpreadsheet className="w-4 h-4 text-primary" />{KINDS.find(k => k.value === u.kind)?.label}</span></td>
                <td className="px-6 py-3">{formatWeek(u.week_start)}</td>
                <td className="px-6 py-3 text-muted-foreground">{u.file_name}</td>
                <td className="px-6 py-3 font-medium">{u.row_count}</td>
                <td className="px-6 py-3 text-right">
                  {role === "admin" && (
                    <Button size="sm" variant="ghost" onClick={() => confirm("Delete this upload and its data?") && del.mutate(u.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {(uploadsQ.data ?? []).length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">No uploads yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
