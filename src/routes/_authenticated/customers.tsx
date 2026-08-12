import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Mail, X } from "lucide-react";
import { canEdit, useAuth } from "@/lib/useAuth";
import { z } from "zod";
import { useDemoMode } from "@/lib/demoMode";
import { DEMO_CURRENT_WEEK, demoCustomers, demoOpenJobs } from "@/lib/demoData";
import { isSeededDemoEmail, isSeededDemoPayload } from "@/lib/liveData";
import { fetchAllSupabaseRows } from "@/lib/supabasePagination";
import { deleteCustomer, upsertCustomer } from "@/lib/customersServer";
import { uniqueOpenJobs } from "@/lib/openJobs";

export const Route = createFileRoute("/_authenticated/customers")({ component: CustomersPage });

const schema = z.object({
  key: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
});

type FormState = {
  key: string;
  name: string;
  email: string;
  cc: string[];
  lastEmail: string;
  enabled: boolean;
};
const empty: FormState = { key: "", name: "", email: "", cc: [], lastEmail: "", enabled: true };

function CustomersPage() {
  const qc = useQueryClient();
  const auth = useAuth();
  const { user } = auth;
  const canManageCustomers = canEdit(auth, "customers");
  const demoMode = useDemoMode();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [ccInput, setCcInput] = useState("");

  const custsQ = useQuery({
    queryKey: ["customers", demoMode],
    queryFn: async () => {
      if (demoMode) return demoCustomers();
      const { data } = await supabase.from("customers").select("*").order("name");
      return (data ?? []).filter((row) => !isSeededDemoEmail(row.email));
    },
  });

  const openJobCustomersQ = useQuery({
    queryKey: ["customers_from_open_jobs", demoMode],
    queryFn: async () => {
      if (demoMode) return [];
      const data = await fetchAllSupabaseRows<any>((from, to) =>
        supabase
          .from("open_jobs")
          .select("customer_key,customer_name,job_no,details,week_start")
          .order("week_start", { ascending: false })
          .range(from, to),
      );
      const map = new Map<string, any>();
      for (const row of uniqueOpenJobs(data)) {
        if (isSeededDemoPayload(row.details)) continue;
        const key = String(row.customer_key ?? "").trim();
        const name = String(row.customer_name ?? "").trim();
        if (!key || !name) continue;
        if (!map.has(key)) {
          map.set(key, {
            id: `open-job-${key}`,
            key,
            name,
            email: null,
            cc_emails: [],
            enabled: true,
            last_email_sent_at: null,
            derived_from_open_jobs: true,
          });
        }
      }
      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const jobsCountQ = useQuery({
    queryKey: ["customers_active_jobs", demoMode],
    queryFn: async () => {
      if (demoMode) {
        const map: Record<string, number> = {};
        for (const r of demoOpenJobs(DEMO_CURRENT_WEEK)) map[r.customer_key] = (map[r.customer_key] ?? 0) + 1;
        return map;
      }
      const latest = await fetchAllSupabaseRows<any>((from, to) =>
        supabase
          .from("open_jobs")
          .select("week_start,details")
          .order("week_start", { ascending: false })
          .range(from, to),
      );
      const week = latest.find((row) => !isSeededDemoPayload(row.details))?.week_start;
      if (!week) return {} as Record<string, number>;
      const data = await fetchAllSupabaseRows<any>((from, to) =>
        supabase
          .from("open_jobs")
          .select("customer_key,job_no,details")
          .eq("week_start", week)
          .range(from, to),
      );
      const map: Record<string, number> = {};
      for (const r of uniqueOpenJobs(data.filter((row) => !isSeededDemoPayload(row.details)))) {
        map[r.customer_key] = (map[r.customer_key] ?? 0) + 1;
      }
      return map;
    },
  });

  const customers = useMemo(() => {
    const saved = custsQ.data ?? [];
    const savedKeys = new Set(saved.map((customer: any) => customer.key));
    return [
      ...saved,
      ...(openJobCustomersQ.data ?? []).filter((customer: any) => !savedKeys.has(customer.key)),
    ].sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [custsQ.data, openJobCustomersQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const payload = {
        key: form.key,
        name: form.name,
        email: form.email || null,
        cc_emails: form.cc,
        last_email_sent_at: form.lastEmail ? new Date(form.lastEmail).toISOString() : null,
        enabled: form.enabled,
        updated_at: new Date().toISOString(),
      };
      await upsertCustomer({
        data: {
          id: editing && !editing.derived_from_open_jobs ? editing.id : undefined,
          customer: payload,
        },
      });
    },
    onSuccess: () => { toast.success("Saved"); setOpen(false); setEditing(null); setForm(empty); qc.invalidateQueries({ queryKey: ["customers"] }); qc.invalidateQueries({ queryKey: ["customers_from_open_jobs"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { await deleteCustomer({ data: { id } }); },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["customers"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleEnabled = useMutation({
    mutationFn: async ({ customer, enabled }: { customer: any; enabled: boolean }) => {
      const payload = {
        key: customer.key,
        name: customer.name,
        email: customer.email ?? null,
        cc_emails: customer.cc_emails ?? [],
        enabled,
        updated_at: new Date().toISOString(),
      };
      await upsertCustomer({
        data: {
          id: customer.derived_from_open_jobs ? undefined : customer.id,
          customer: payload,
        },
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); qc.invalidateQueries({ queryKey: ["customers_from_open_jobs"] }); },
  });

  const testEmail = useMutation({
    mutationFn: async (c: any) => {
      if (!c.email) throw new Error("No primary email");
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("email_jobs").insert({
        batch_id: crypto.randomUUID(), week_start: new Date().toISOString().slice(0, 10),
        customer_id: c.id, customer_name: c.name, customer_email: c.email, cc_emails: c.cc_emails,
        subject: `[TEST] Open Jobs Report — ${c.name}`, attachment_name: `${c.name}-test.xlsx`,
        job_count: 0, status: "pending", created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Test email queued"),
    onError: (e: any) => toast.error(e.message),
  });

  function edit(c: any) {
    setEditing(c);
    setForm({
      key: c.key,
      name: c.name,
      email: c.email ?? "",
      cc: c.cc_emails ?? [],
      lastEmail: toDateTimeInput(c.last_email_sent_at),
      enabled: c.enabled ?? true,
    });
    setOpen(true);
  }

  function addCc() {
    const v = ccInput.trim();
    if (!v) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { toast.error("Invalid email"); return; }
    if (form.cc.includes(v)) return;
    setForm({ ...form, cc: [...form.cc, v] });
    setCcInput("");
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage recipients for Open Jobs reports.</p>
        </div>
        {canManageCustomers && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm(empty); }}}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditing(null); setForm(empty); }}>
                <Plus className="w-4 h-4 mr-2" />Add customer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit customer" : "New customer"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Key (matches Open Jobs export)</Label><Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="ELLISON" /></div>
                <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Primary email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="space-y-1.5">
                  <Label>CC emails</Label>
                  <div className="flex gap-2">
                    <Input value={ccInput} onChange={(e) => setCcInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCc(); }}}
                      placeholder="add@example.com then press Enter" />
                    <Button type="button" variant="outline" onClick={addCc}>Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.cc.map(c => (
                      <Badge key={c} variant="secondary" className="gap-1">
                        {c}
                        <button onClick={() => setForm({ ...form, cc: form.cc.filter(x => x !== c) })}><X className="w-3 h-3" /></button>
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Last email sent</Label>
                  <Input
                    type="datetime-local"
                    value={form.lastEmail}
                    onChange={(e) => setForm({ ...form, lastEmail: e.target.value })}
                  />
                </div>
                <div className="flex items-center justify-between border rounded-md px-3 py-2">
                  <div>
                    <Label>Enabled</Label>
                    <p className="text-xs text-muted-foreground">Include in email batches</p>
                  </div>
                  <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
                </div>
              </div>
              <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </header>

      <Card>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-6 py-3 font-medium">Customer</th>
              <th className="text-left px-6 py-3 font-medium">Primary Email</th>
              <th className="text-left px-6 py-3 font-medium">CC</th>
              <th className="text-right px-6 py-3 font-medium">Active Jobs</th>
              <th className="text-left px-6 py-3 font-medium">Last Email</th>
              <th className="text-left px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {customers.map((c: any) => (
              <tr key={c.id} className={`border-t ${!c.enabled ? "opacity-60" : ""}`}>
                <td className="px-6 py-3">
                  <div className="font-medium">{c.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{c.key}</div>
                </td>
                <td className="px-6 py-3 text-muted-foreground">{c.email ?? <span className="text-warning">missing</span>}</td>
                <td className="px-6 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(c.cc_emails ?? []).slice(0, 3).map((e: string) => <Badge key={e} variant="outline" className="text-xs">{e}</Badge>)}
                    {(c.cc_emails ?? []).length > 3 && <Badge variant="outline" className="text-xs">+{c.cc_emails.length - 3}</Badge>}
                  </div>
                </td>
                <td className="px-6 py-3 text-right font-semibold">{jobsCountQ.data?.[c.key] ?? 0}</td>
                <td className="px-6 py-3 text-muted-foreground text-xs">{c.last_email_sent_at ? new Date(c.last_email_sent_at).toLocaleString() : "—"}</td>
                <td className="px-6 py-3">
                  <Switch checked={!!c.enabled} onCheckedChange={(v) => toggleEnabled.mutate({ customer: c, enabled: v })} disabled={!canManageCustomers} />
                </td>
                <td className="px-6 py-3 text-right space-x-1 whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => testEmail.mutate(c)} disabled={!c.email || c.derived_from_open_jobs} title="Queue test email">
                    <Mail className="w-4 h-4" />
                  </Button>
                  {canManageCustomers && <Button size="sm" variant="ghost" onClick={() => edit(c)}><Pencil className="w-4 h-4" /></Button>}
                  {canManageCustomers && !c.derived_from_open_jobs && <>
                    <Button size="sm" variant="ghost" onClick={() => confirm("Delete this customer?") && del.mutate(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </>}
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">No customers yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}

function toDateTimeInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
