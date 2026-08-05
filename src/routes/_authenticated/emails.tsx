import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Mail,
  Send,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { downloadXlsx } from "@/lib/parse";
import { formatWeek } from "@/lib/kpi";
import { useAuth } from "@/lib/useAuth";
import { useDemoMode } from "@/lib/demoMode";
import { DEMO_WEEKS, demoCustomers, demoEmailJobs, demoOpenJobs } from "@/lib/demoData";
import { isSeededDemoEmail, isSeededDemoPayload } from "@/lib/liveData";
import { sendOpenJobsEmails } from "@/lib/emailSend";
import { fetchAllSupabaseRows } from "@/lib/supabasePagination";

export const Route = createFileRoute("/_authenticated/emails")({ component: EmailsPage });

type EmailRow = {
  key: string;
  name: string;
  jobs: any[];
  customer: any | null;
  setupStatus: "ready" | "unmatched" | "disabled" | "no_email";
  deliveryStatus: "ready" | "sent" | "pending" | "failed" | "unmatched" | "disabled" | "no_email";
  latestEmailJob: any | null;
  sentEmailJob: any | null;
  canSend: boolean;
};

function EmailsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const demoMode = useDemoMode();
  const [week, setWeek] = useState<string | null>(null);
  const [preview, setPreview] = useState<EmailRow | null>(null);
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);

  const weeksQ = useQuery({
    queryKey: ["oj_weeks", demoMode],
    queryFn: async () => {
      if (demoMode) return DEMO_WEEKS;
      const data = await fetchAllSupabaseRows<any>((from, to) =>
        supabase
          .from("open_jobs")
          .select("week_start,details")
          .order("week_start", { ascending: false })
          .range(from, to),
      );
      return Array.from(
        new Set(
          data
            .filter((row) => !isSeededDemoPayload(row.details))
            .map((r: any) => r.week_start as string),
        ),
      );
    },
  });

  const w = week ?? weeksQ.data?.[0] ?? null;

  const jobsQ = useQuery({
    queryKey: ["oj_for_emails", w, demoMode],
    queryFn: async () => {
      if (!w) return [];
      if (demoMode) return demoOpenJobs(w);
      const data = await fetchAllSupabaseRows<any>((from, to) =>
        supabase.from("open_jobs").select("*").eq("week_start", w).range(from, to),
      );
      return data.filter((row) => !isSeededDemoPayload(row.details));
    },
    enabled: !!w,
  });

  const custsQ = useQuery({
    queryKey: ["customers", demoMode],
    queryFn: async () => {
      if (demoMode) return demoCustomers();
      const data = await fetchAllSupabaseRows<any>((from, to) =>
        supabase.from("customers").select("*").range(from, to),
      );
      return data.filter((row) => !isSeededDemoEmail(row.email));
    },
  });

  const emailJobsQ = useQuery({
    queryKey: ["email_jobs", w, demoMode],
    queryFn: async () => {
      if (!w) return [];
      if (demoMode) return demoEmailJobs(w);
      const data = await fetchAllSupabaseRows<any>((from, to) =>
        supabase
          .from("email_jobs")
          .select("*")
          .eq("week_start", w)
          .order("created_at", { ascending: false })
          .range(from, to),
      );
      return data.filter((row) => !isSeededDemoEmail(row.customer_email));
    },
    enabled: !!w,
  });

  const rows = useMemo<EmailRow[]>(() => {
    const byKey = new Map<string, any[]>();
    for (const job of jobsQ.data ?? []) {
      const arr = byKey.get(job.customer_key) ?? [];
      arr.push(job);
      byKey.set(job.customer_key, arr);
    }

    const custByKey = new Map((custsQ.data ?? []).map((customer: any) => [customer.key, customer]));
    const emailJobs = emailJobsQ.data ?? [];

    return Array.from(byKey.entries())
      .map(([key, jobs]) => {
        const customer: any = custByKey.get(key) ?? null;
        const setupStatus: EmailRow["setupStatus"] = !customer
          ? "unmatched"
          : !customer.enabled
            ? "disabled"
            : !customer.email
              ? "no_email"
              : "ready";
        const history = emailJobs.filter((job: any) => {
          if (customer?.id && job.customer_id === customer.id) return true;
          const customerEmail = String(customer?.email ?? "").trim().toLowerCase();
          const jobEmail = String(job.customer_email ?? "").trim().toLowerCase();
          return !!customerEmail && customerEmail === jobEmail;
        });
        const sentEmailJob = history.find((job: any) => job.status === "sent") ?? null;
        const latestEmailJob = history[0] ?? null;
        const deliveryStatus: EmailRow["deliveryStatus"] = sentEmailJob
          ? "sent"
          : latestEmailJob?.status === "pending"
            ? "pending"
            : latestEmailJob?.status === "failed"
              ? "failed"
              : setupStatus;

        return {
          key,
          name: jobs[0].customer_name,
          jobs,
          customer,
          setupStatus,
          deliveryStatus,
          latestEmailJob,
          sentEmailJob,
          canSend: setupStatus === "ready" && deliveryStatus !== "sent",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [jobsQ.data, custsQ.data, emailJobsQ.data]);

  const sendableRows = rows.filter((row) => row.canSend);
  const sentCount = rows.filter((row) => row.deliveryStatus === "sent").length;
  const pendingCount = rows.filter((row) => row.deliveryStatus === "pending").length;
  const missingEmail = rows.filter(
    (row) => row.setupStatus === "no_email" || row.setupStatus === "unmatched",
  ).length;

  const generateBatch = useMutation({
    mutationFn: async () => {
      if (!w || !user) throw new Error("Select a week first");
      const batch_id = crypto.randomUUID();
      const payload = rows
        .filter((row) => !row.sentEmailJob && !row.latestEmailJob)
        .map((row) => ({
          batch_id,
          week_start: w,
          customer_id: row.customer?.id ?? null,
          customer_name: row.name,
          customer_email: row.customer?.email ?? null,
          cc_emails: row.customer?.cc_emails ?? null,
          subject: subjectFor(row.name, w),
          attachment_name: attachmentFor(row.name, w),
          job_count: row.jobs.length,
          status: row.setupStatus === "ready" ? "pending" : "failed",
          error:
            row.setupStatus === "ready"
              ? null
              : row.setupStatus === "no_email"
                ? "Missing email"
                : row.setupStatus === "disabled"
                  ? "Customer disabled"
                  : "Customer not on file",
          created_by: user.id,
        }));
      if (!rows.length) throw new Error("No open jobs for this week");
      if (!payload.length) throw new Error("All customers already have email activity for this week");
      const { error } = await supabase.from("email_jobs").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Batch prepared");
      qc.invalidateQueries({ queryKey: ["email_jobs"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sendEmails = useMutation({
    mutationFn: async (customerIds?: string[]) => {
      if (!w) throw new Error("Select a week first");
      if (demoMode) throw new Error("Email sending is disabled in demo mode");
      return sendOpenJobsEmails({ data: { weekStart: w, customerIds } });
    },
    onSuccess: (result) => {
      toast.success(`Sent ${result.sent}; skipped ${result.skipped}; failed ${result.failed}`);
      setConfirmBulkOpen(false);
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const markSent = useMutation({
    mutationFn: async (job: any) => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("email_jobs")
        .update({ status: "sent", sent_at: now, error: null })
        .eq("id", job.id);
      if (error) throw error;
      if (job.customer_id) {
        await supabase
          .from("customers")
          .update({ last_email_sent_at: now, updated_at: now })
          .eq("id", job.customer_id);
      }
    },
    onSuccess: () => qc.invalidateQueries(),
  });

  const retry = useMutation({
    mutationFn: async (job: any) => {
      const { error } = await supabase
        .from("email_jobs")
        .update({ status: "pending", error: null })
        .eq("id", job.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Queued for retry");
      qc.invalidateQueries({ queryKey: ["email_jobs"] });
    },
  });

  function sendOne(row: EmailRow) {
    if (!row.customer?.id) return;
    sendEmails.mutate([row.customer.id]);
  }

  function bulkSend() {
    const ids = sendableRows.map((row) => row.customer?.id).filter((id): id is string => !!id);
    sendEmails.mutate(ids);
  }

  function downloadReport(row: EmailRow) {
    downloadXlsx(
      row.jobs.map((job: any) => ({
        Job: job.job_no,
        Ticket: job.ticket_no,
        Address: job.address,
        Status: job.status,
        Age: job.age_days,
        Technician: job.technician,
        Notes: job.notes ?? job.last_activity,
      })),
      attachmentFor(row.name, w ?? "current").replace(/\.csv$/, ".xlsx"),
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold">Customer Emails</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Send per-customer Open Jobs reports and skip customers already sent this week.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={w ?? ""} onValueChange={setWeek}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select week" />
            </SelectTrigger>
            <SelectContent>
              {(weeksQ.data ?? []).map((value) => (
                <SelectItem key={value} value={value}>
                  Week of {formatWeek(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => generateBatch.mutate()}
            disabled={!w || generateBatch.isPending}
          >
            <Mail className="w-4 h-4 mr-2" />
            Prepare queue
          </Button>
          <Button
            onClick={() => setConfirmBulkOpen(true)}
            disabled={!w || sendableRows.length === 0 || sendEmails.isPending}
          >
            <Send className="w-4 h-4 mr-2" />
            Bulk Send
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SnapCard label="Can send" value={sendableRows.length} accent="text-success" />
        <SnapCard label="Sent" value={sentCount} accent="text-primary" />
        <SnapCard label="Pending" value={pendingCount} accent="text-warning" />
        <SnapCard label="Needs setup" value={missingEmail} accent="text-destructive" />
      </div>

      <Card className="p-4 flex items-start gap-3 bg-success/10 border-success/30">
        <ShieldCheck className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-medium">Resend sending enabled</div>
          <div className="text-muted-foreground">
            Configure RESEND_API_KEY and RESEND_FROM_EMAIL in your hosting provider. Bulk Send only sends
            customers that do not already have a Sent log for this week.
          </div>
        </div>
      </Card>

      <Card>
        <div className="px-6 py-4 border-b flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold">
              Distribute - {w ? formatWeek(w) : "select a week"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {rows.length} customers - {rows.reduce((sum, row) => sum + row.jobs.length, 0)} open jobs
            </p>
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
              {rows.map((row) => (
                <tr key={row.key} className="border-t">
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{row.key}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.customer?.email ?? <span className="text-warning">Missing</span>}
                  </td>
                  <td className="px-4 py-3 text-right">{row.jobs.length}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[220px]">
                    {w ? attachmentFor(row.name, w) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <DeliveryStatus status={row.deliveryStatus} error={row.latestEmailJob?.error} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => setPreview(row)} title="Preview">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => downloadReport(row)} title="Download">
                      <Download className="w-4 h-4" />
                    </Button>
                    {row.deliveryStatus === "sent" ? (
                      <Button size="sm" variant="secondary" disabled>
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        Sent
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => sendOne(row)}
                        disabled={!row.canSend || sendEmails.isPending}
                      >
                        <Send className="w-4 h-4 mr-1" />
                        Send
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                    Upload Open Jobs to distribute reports.
                  </td>
                </tr>
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
              {(emailJobsQ.data ?? []).map((job: any) => (
                <tr key={job.id} className="border-t">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(job.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium">{job.customer_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{job.customer_email ?? "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs truncate max-w-[240px]">
                    {job.subject ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs truncate max-w-[220px]">
                    {job.attachment_name ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <DeliveryStatus status={job.status} error={job.error} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                    {job.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => markSent.mutate(job)}>
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        Mark sent
                      </Button>
                    )}
                    {job.status === "failed" && (
                      <Button size="sm" variant="ghost" onClick={() => retry.mutate(job)}>
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {(emailJobsQ.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                    No email activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={confirmBulkOpen} onOpenChange={setConfirmBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send all unsent emails?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              This will send {sendableRows.length} customer email
              {sendableRows.length === 1 ? "" : "s"} for {w ? formatWeek(w) : "the selected week"}.
            </p>
            <p>Customers already marked Sent will be skipped automatically.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBulkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={bulkSend} disabled={sendEmails.isPending || sendableRows.length === 0}>
              {sendEmails.isPending ? "Sending..." : "Send All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview - {preview?.name}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3 text-sm">
              <div className="border rounded-md p-4 bg-muted/30">
                <div className="text-xs text-muted-foreground">To</div>
                <div className="font-medium">{preview.customer?.email ?? "(no email on file)"}</div>
                {preview.customer?.cc_emails?.length > 0 && (
                  <>
                    <div className="text-xs text-muted-foreground mt-2">CC</div>
                    <div>{preview.customer.cc_emails.join(", ")}</div>
                  </>
                )}
                <div className="text-xs text-muted-foreground mt-2">Subject</div>
                <div className="font-medium">{w && subjectFor(preview.name, w)}</div>
              </div>
              <div className="border rounded-md p-4">
                <p>Hi {preview.name} team,</p>
                <p className="mt-2">
                  Please find attached your current Open Jobs report for the week of{" "}
                  {w && formatWeek(w)}. There are <strong>{preview.jobs.length}</strong> open jobs.
                </p>
                <div className="mt-3 max-h-[240px] overflow-auto border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-2 py-1">Job</th>
                        <th className="text-left px-2 py-1">Address</th>
                        <th className="text-left px-2 py-1">Status</th>
                        <th className="text-left px-2 py-1">Age</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.jobs.slice(0, 25).map((job: any, index: number) => (
                        <tr key={index} className="border-t">
                          <td className="px-2 py-1">{job.job_no ?? job.ticket_no}</td>
                          <td className="px-2 py-1">{job.address ?? "-"}</td>
                          <td className="px-2 py-1">{job.status ?? "-"}</td>
                          <td className="px-2 py-1">{job.age_days ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.jobs.length > 25 && (
                    <div className="p-2 text-xs text-muted-foreground text-center">
                      + {preview.jobs.length - 25} more in attachment
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => preview && downloadReport(preview)}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
            <Button
              onClick={() => {
                if (preview) {
                  sendOne(preview);
                  setPreview(null);
                }
              }}
              disabled={!preview?.canSend || sendEmails.isPending}
            >
              <Send className="w-4 h-4 mr-2" />
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function subjectFor(name: string, week: string) {
  return `Open Jobs Report - ${name} - Week of ${formatWeek(week)}`;
}

function attachmentFor(name: string, week: string) {
  return `${name.replace(/[^A-Za-z0-9]+/g, "_")}-open-jobs-${week}.csv`;
}

function DeliveryStatus({ status, error }: { status: string; error?: string | null }) {
  if (status === "sent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-success text-xs font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Sent
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-1 text-warning text-xs font-medium">
        <Clock className="w-3.5 h-3.5" />
        Pending
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-destructive text-xs font-medium"
        title={error ?? ""}
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        Failed
      </span>
    );
  }
  if (status === "no_email") {
    return <span className="text-warning text-xs font-medium">Missing email</span>;
  }
  if (status === "disabled") {
    return <span className="text-muted-foreground text-xs font-medium">Disabled</span>;
  }
  if (status === "unmatched") {
    return <span className="text-destructive text-xs font-medium">Not on file</span>;
  }
  return <span className="text-success text-xs font-medium">Ready</span>;
}

function SnapCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-display font-semibold mt-1 ${accent}`}>{value}</div>
    </Card>
  );
}
