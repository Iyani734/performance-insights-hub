import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Mail, Send, AlertTriangle, CheckCircle2, Clock, Download, Eye, RefreshCw, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { downloadXlsx } from "@/lib/parse";
import { formatWeek } from "@/lib/kpi";
import { useAuth } from "@/lib/useAuth";
import { useDemoMode } from "@/lib/demoMode";
import { DEMO_WEEKS, demoCustomers, demoEmailJobs, demoOpenJobs } from "@/lib/demoData";
import { isSeededDemoEmail, isSeededDemoPayload } from "@/lib/liveData";

export const Route = createFileRoute("/_authenticated/emails")({ component: EmailsPage });

function EmailsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const demoMode = useDemoMode();

  const weeksQ = useQuery({
    queryKey: ["oj_weeks", demoMode],
    queryFn: async () => {
      if (demoMode) return DEMO_WEEKS;
      const { data } = await supabase.from("open_jobs").select("week_start,details").order("week_start", { ascending: false });
      return Array.from(new Set((data ?? []).filter((row) => !isSeededDemoPayload(row.details)).map((r: any) => r.week_start as string)));
    },
  });
  const [week, setWeek] = useState<string | null>(null);
  const w = week ?? weeksQ.data?.[0] ?? null;

  const jobsQ = useQuery({
    queryKey: ["oj_for_emails", w, demoMode],
    queryFn: async () => {
      if (!w) return [];
      if (demoMode) return demoOpenJobs(w);
      const { data } = await supabase.from("open_jobs").select("*").eq("week_start", w);
      return (data ?? []).filter((row) => !isSeededDemoPayload(row.details));
    },
    enabled: !!w,
  });

  const custsQ = useQuery({
    queryKey: ["customers", demoMode],
    queryFn: async () => {
      if (demoMode) return demoCustomers();
      const { data } = await supabase.from("customers").select("*");
      return (data ?? []).filter((row) => !isSeededDemoEmail(row.email));
    },
  });

  const emailJobsQ = useQuery({
    queryKey: ["email_jobs", w, demoMode],
    queryFn: async () => {
      if (!w) return [];
      if (demoMode) return demoEmailJobs(w);
      const { data } = await supabase.from("email_jobs").select("*").eq("week_start", w).order("created_at", { ascending: false });
      return (data ?? []).filter((row) => !isSeededDemoEmail(row.customer_email));
    },
    enabled: !!w,
  });

  const rows = useMemo(() => {
    const byKey = new Map<string, any[]>();
    for (const j of jobsQ.data ?? []) {
      const arr = byKey.get(j.customer_key) ?? [];
      arr.push(j); byKey.set(j.customer_key, arr);
    }
    const custByKey = new Map((custsQ.data ?? []).map((c: any) => [c.key, c]));
    return Array.from(byKey.entries()).map(([key, jobs]) => {
      const customer: any = custByKey.get(key);
      const status = !customer ? "unmatched" : !customer.enabled ? "disabled" : !customer.email ? "no_email" : "ready";
      return { key, name: jobs[0].customer_name, jobs, customer, status };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [jobsQ.data, custsQ.data]);

  const readyCount = rows.filter(r => r.status === "ready").length;
  const missingEmail = rows.filter(r => r.status === "no_email" || r.status === "unmatched").length;

  function subjectFor(name: string, week: string) {
    return `Open Jobs Report — ${name} — Week of ${formatWeek(week)}`;
  }
  function attachmentFor(name: string, week: string) {
    return `${name.replace(/[^A-Za-z0-9]+/g, "_")}-open-jobs-${week}.xlsx`;
  }

  const generateBatch = useMutation({
    mutationFn: async () => {
      if (!w || !user) throw new Error("Select a week first");
      const batch_id = crypto.randomUUID();
      const payload = rows.map(r => ({
        batch_id, week_start: w,
        customer_id: r.customer?.id ?? null,
        customer_name: r.name,
        customer_email: r.customer?.email ?? null,
        cc_emails: r.customer?.cc_emails ?? null,
        subject: subjectFor(r.name, w),
        attachment_name: attachmentFor(r.name, w),
        job_count: r.jobs.length,
        status: r.status === "ready" ? "pending" : "failed",
        error: r.status === "ready" ? null : r.status === "no_email" ? "Missing email" : r.status === "disabled" ? "Customer disabled" : "Customer not on file",
        created_by: user.id,
      }));
      if (!payload.length) throw new Error("No open jobs for this week");
      const { error } = await supabase.from("email_jobs").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Batch generated"); qc.invalidateQueries({ queryKey: ["email_jobs"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const sendOne = useMutation({
    mutationFn: async (r: any) => {
      if (!w || !user) return;
      if (r.status !== "ready") throw new Error("Customer not ready");
      const { error } = await supabase.from("email_jobs").insert({
        batch_id: crypto.randomUUID(), week_start: w,
        customer_id: r.customer.id, customer_name: r.name,
        customer_email: r.customer.email, cc_emails: r.customer.cc_emails ?? null,
        subject: subjectFor(r.name, w), attachment_name: attachmentFor(r.name, w),
        job_count: r.jobs.length, status: "pending", created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Queued"); qc.invalidateQueries({ queryKey: ["email_jobs"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const markSent = useMutation({
    mutationFn: async (j: any) => {
      const now = new Date().toISOString();
      const { error } = await supabase.from("email_jobs").update({ status: "sent", sent_at: now, error: null }).eq("id", j.id);
      if (error) throw error;
      if (j.customer_id) await supabase.from("customers").update({ last_email_sent_at: now }).eq("id", j.customer_id);
    },
    onSuccess: () => qc.invalidateQueries(),
  });

  const retry = useMutation({
    mutationFn: async (j: any) => {
      const { error } = await supabase.from("email_jobs").update({ status: "pending", error: null }).eq("id", j.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Retried"); qc.invalidateQueries({ queryKey: ["email_jobs"] }); },
  });

  const [preview, setPreview] = useState<any | null>(null);

  function downloadReport(r: any) {
    downloadXlsx(
      r.jobs.map((j: any) => ({ Job: j.job_no, Ticket: j.ticket_no, Address: j.address, Status: j.status, Age: j.age_days, Technician: j.technician, Notes: j.notes ?? j.last_activity })),
      attachmentFor(r.name, w ?? "current"),
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold">Customer Emails</h1>
          <p className="text-sm text-muted-foreground mt-1">Generate per-customer Open Jobs reports and track delivery.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={w ?? ""} onValueChange={setWeek}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select week" /></SelectTrigger>
            <SelectContent>{(weeksQ.data ?? []).map(x => <SelectItem key={x} value={x}>Week of {formatWeek(x)}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={() => generateBatch.mutate()} disabled={!w || generateBatch.isPending}>
            <Mail className="w-4 h-4 mr-2" />Generate batch
          </Button>
        </div>
      </header>

      {/* Snapshot */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SnapCard label="Ready to send" value={readyCount} accent="text-success" />
        <SnapCard label="Missing email" value={missingEmail} accent="text-warning" />
        <SnapCard label="Sent this week" value={(emailJobsQ.data ?? []).filter((j: any) => j.status === "sent").length} accent="text-primary" />
        <SnapCard label="Failed" value={(emailJobsQ.data ?? []).filter((j: any) => j.status === "failed").length} accent="text-destructive" />
      </div>

      <Card className="p-4 flex items-start gap-3 bg-warning/10 border-warning/30">
        <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-medium">Email provider not yet wired</div>
          <div className="text-muted-foreground">Batches queue as Pending and can be marked Sent manually. Configure an email provider to enable one-click sending.</div>
        </div>
      </Card>

      <Card>
        <div className="px-6 py-4 border-b flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold">Distribute — {w ? formatWeek(w) : "select a week"}</h2>
            <p className="text-xs text-muted-foreground">{rows.length} customers · {rows.reduce((a, r) => a + r.jobs.length, 0)} open jobs</p>
          </div>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Customer</th>
              <th className="text-left px-4 py-3 font-medium">Recipient</th>
              <th className="text-right px-4 py-3 font-medium">Jobs</th>
              <th className="text-left px-4 py-3 font-medium">Attachment</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} className="border-t">
                <td className="px-4 py-3"><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground font-mono">{r.key}</div></td>
                <td className="px-4 py-3 text-muted-foreground">{r.customer?.email ?? <span className="text-warning">—</span>}</td>
                <td className="px-4 py-3 text-right">{r.jobs.length}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[220px]">{w ? attachmentFor(r.name, w) : "—"}</td>
                <td className="px-4 py-3">
                  {r.status === "ready" && <span className="text-success text-xs font-medium">Ready</span>}
                  {r.status === "no_email" && <span className="text-warning text-xs font-medium">Missing email</span>}
                  {r.status === "disabled" && <span className="text-muted-foreground text-xs font-medium">Disabled</span>}
                  {r.status === "unmatched" && <span className="text-destructive text-xs font-medium">Not on file</span>}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => setPreview(r)} title="Preview"><Eye className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => downloadReport(r)} title="Download"><Download className="w-4 h-4" /></Button>
                  <Button size="sm" variant="outline" onClick={() => sendOne.mutate(r)} disabled={r.status !== "ready" || sendOne.isPending}>
                    <Send className="w-4 h-4 mr-1" />Send
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Upload Open Jobs to distribute reports.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>

      <Card>
        <div className="px-6 py-4 border-b">
          <h2 className="font-display text-lg font-semibold">Email log</h2>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Customer</th>
              <th className="text-left px-4 py-3 font-medium">Recipient</th>
              <th className="text-left px-4 py-3 font-medium">Subject</th>
              <th className="text-left px-4 py-3 font-medium">Attachment</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(emailJobsQ.data ?? []).map((j: any) => (
              <tr key={j.id} className="border-t">
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(j.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 font-medium">{j.customer_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{j.customer_email ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs truncate max-w-[240px]">{j.subject ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs truncate max-w-[220px]">{j.attachment_name ?? "—"}</td>
                <td className="px-4 py-3">
                  {j.status === "sent" && <span className="inline-flex items-center gap-1 text-success text-xs font-medium"><CheckCircle2 className="w-4 h-4" />Sent</span>}
                  {j.status === "pending" && <span className="inline-flex items-center gap-1 text-warning text-xs font-medium"><Clock className="w-4 h-4" />Pending</span>}
                  {j.status === "failed" && <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium" title={j.error ?? ""}><AlertTriangle className="w-4 h-4" />{j.error ?? "Failed"}</span>}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                  {j.status === "pending" && <Button size="sm" variant="outline" onClick={() => markSent.mutate(j)}><Send className="w-4 h-4 mr-1" />Mark sent</Button>}
                  {j.status === "failed" && <Button size="sm" variant="ghost" onClick={() => retry.mutate(j)}><RefreshCw className="w-4 h-4" /></Button>}
                </td>
              </tr>
            ))}
            {(emailJobsQ.data ?? []).length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">No email activity yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Preview — {preview?.name}</DialogTitle></DialogHeader>
          {preview && (
            <div className="space-y-3 text-sm">
              <div className="border rounded-md p-4 bg-muted/30">
                <div className="text-xs text-muted-foreground">To</div>
                <div className="font-medium">{preview.customer?.email ?? "(no email on file)"}</div>
                {preview.customer?.cc_emails?.length > 0 && <><div className="text-xs text-muted-foreground mt-2">CC</div><div>{preview.customer.cc_emails.join(", ")}</div></>}
                <div className="text-xs text-muted-foreground mt-2">Subject</div>
                <div className="font-medium">{w && subjectFor(preview.name, w)}</div>
              </div>
              <div className="border rounded-md p-4">
                <p>Hi {preview.name} team,</p>
                <p className="mt-2">Please find attached your current Open Jobs report for the week of {w && formatWeek(w)}. There are <strong>{preview.jobs.length}</strong> open jobs.</p>
                <div className="mt-3 max-h-[240px] overflow-auto border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50"><tr><th className="text-left px-2 py-1">Job</th><th className="text-left px-2 py-1">Address</th><th className="text-left px-2 py-1">Status</th><th className="text-left px-2 py-1">Age</th></tr></thead>
                    <tbody>
                      {preview.jobs.slice(0, 25).map((j: any, i: number) => (
                        <tr key={i} className="border-t"><td className="px-2 py-1">{j.job_no ?? j.ticket_no}</td><td className="px-2 py-1">{j.address ?? "—"}</td><td className="px-2 py-1">{j.status ?? "—"}</td><td className="px-2 py-1">{j.age_days ?? "—"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.jobs.length > 25 && <div className="p-2 text-xs text-muted-foreground text-center">+ {preview.jobs.length - 25} more in attachment</div>}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => preview && downloadReport(preview)}><Download className="w-4 h-4 mr-2" />Download</Button>
            <Button onClick={() => { if (preview) { sendOne.mutate(preview); setPreview(null); }}} disabled={preview?.status !== "ready"}>
              <Send className="w-4 h-4 mr-2" />Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SnapCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-display font-semibold mt-1 ${accent}`}>{value}</div>
    </Card>
  );
}
