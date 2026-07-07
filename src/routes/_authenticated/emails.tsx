import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Send, AlertTriangle, CheckCircle2, Clock, Download } from "lucide-react";
import { toast } from "sonner";
import { downloadXlsx } from "@/lib/parse";
import { formatWeek } from "@/lib/kpi";
import { useAuth } from "@/lib/useAuth";

export const Route = createFileRoute("/_authenticated/emails")({ component: EmailsPage });

function EmailsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const weeksQ = useQuery({
    queryKey: ["oj_weeks"],
    queryFn: async () => {
      const { data } = await supabase.from("open_jobs").select("week_start").order("week_start", { ascending: false });
      return Array.from(new Set((data ?? []).map((r: any) => r.week_start as string)));
    },
  });
  const [week, setWeek] = useState<string | null>(null);
  const w = week ?? weeksQ.data?.[0] ?? null;

  const jobsQ = useQuery({
    queryKey: ["oj_for_emails", w],
    queryFn: async () => {
      if (!w) return [];
      const { data } = await supabase.from("open_jobs").select("*").eq("week_start", w);
      return data ?? [];
    },
    enabled: !!w,
  });

  const custsQ = useQuery({
    queryKey: ["customers"],
    queryFn: async () => (await supabase.from("customers").select("*")).data ?? [],
  });

  const emailJobsQ = useQuery({
    queryKey: ["email_jobs", w],
    queryFn: async () => {
      if (!w) return [];
      const { data } = await supabase.from("email_jobs").select("*").eq("week_start", w).order("created_at", { ascending: false });
      return data ?? [];
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
    return Array.from(byKey.entries()).map(([key, jobs]) => ({
      key, name: jobs[0].customer_name, jobs,
      customer: custByKey.get(key),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [jobsQ.data, custsQ.data]);

  const generateBatch = useMutation({
    mutationFn: async () => {
      if (!w || !user) throw new Error("Select a week first");
      const batch_id = crypto.randomUUID();
      const payload = rows.map(r => ({
        batch_id, week_start: w, customer_id: r.customer?.id ?? null,
        customer_name: r.name, customer_email: r.customer?.email ?? null,
        job_count: r.jobs.length,
        status: r.customer?.email ? "pending" : "failed",
        error: r.customer?.email ? null : "Missing customer email",
        created_by: user.id,
      }));
      if (!payload.length) throw new Error("No open jobs for this week");
      const { error } = await supabase.from("email_jobs").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Batch generated"); qc.invalidateQueries({ queryKey: ["email_jobs"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const markSent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_jobs").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email_jobs"] }),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold">Customer Emails</h1>
          <p className="text-sm text-muted-foreground mt-1">Generate per-customer Open Jobs reports and track delivery.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={w ?? ""} onValueChange={setWeek}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select week" /></SelectTrigger>
            <SelectContent>{(weeksQ.data ?? []).map(x => <SelectItem key={x} value={x}>Week of {formatWeek(x)}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={() => generateBatch.mutate()} disabled={!w || generateBatch.isPending}>
            <Mail className="w-4 h-4 mr-2" />Generate batch
          </Button>
        </div>
      </header>

      <Card className="p-4 flex items-start gap-3 bg-warning/10 border-warning/30">
        <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-medium">Email provider not configured</div>
          <div className="text-muted-foreground">Batches are queued and reports are ready to download. Wire an email provider (Lovable Emails or Resend) to enable one-click sending.</div>
        </div>
      </Card>

      <Card>
        <div className="px-6 py-4 border-b">
          <h2 className="font-display text-lg font-semibold">Customers this week</h2>
          <p className="text-xs text-muted-foreground">{rows.length} customers · {rows.reduce((a, r) => a + r.jobs.length, 0)} open jobs</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-6 py-3 font-medium">Customer</th>
              <th className="text-left px-6 py-3 font-medium">Email</th>
              <th className="text-left px-6 py-3 font-medium">Jobs</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} className="border-t">
                <td className="px-6 py-3"><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground font-mono">{r.key}</div></td>
                <td className="px-6 py-3 text-muted-foreground">{r.customer?.email ?? <span className="text-warning">not on file</span>}</td>
                <td className="px-6 py-3">{r.jobs.length}</td>
                <td className="px-6 py-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => downloadXlsx(
                    r.jobs.map((j: any) => ({ Job: j.job_no, Ticket: j.ticket_no, Type: j.order_type, LastActivity: j.last_activity })),
                    `${r.name}-open-jobs.xlsx`,
                  )}>
                    <Download className="w-4 h-4 mr-2" />Report
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <div className="px-6 py-4 border-b">
          <h2 className="font-display text-lg font-semibold">Email log</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-6 py-3 font-medium">When</th>
              <th className="text-left px-6 py-3 font-medium">Customer</th>
              <th className="text-left px-6 py-3 font-medium">Email</th>
              <th className="text-left px-6 py-3 font-medium">Jobs</th>
              <th className="text-left px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {(emailJobsQ.data ?? []).map((j: any) => (
              <tr key={j.id} className="border-t">
                <td className="px-6 py-3 text-muted-foreground">{new Date(j.created_at).toLocaleString()}</td>
                <td className="px-6 py-3 font-medium">{j.customer_name}</td>
                <td className="px-6 py-3 text-muted-foreground">{j.customer_email ?? "—"}</td>
                <td className="px-6 py-3">{j.job_count}</td>
                <td className="px-6 py-3">
                  {j.status === "sent" && <span className="inline-flex items-center gap-1 text-success text-xs font-medium"><CheckCircle2 className="w-4 h-4" />Sent</span>}
                  {j.status === "pending" && <span className="inline-flex items-center gap-1 text-warning text-xs font-medium"><Clock className="w-4 h-4" />Pending</span>}
                  {j.status === "failed" && <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium"><AlertTriangle className="w-4 h-4" />{j.error ?? "Failed"}</span>}
                </td>
                <td className="px-6 py-3 text-right">
                  {j.status === "pending" && <Button size="sm" variant="outline" onClick={() => markSent.mutate(j.id)}><Send className="w-4 h-4 mr-2" />Mark sent</Button>}
                </td>
              </tr>
            ))}
            {(emailJobsQ.data ?? []).length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">No email batches yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
