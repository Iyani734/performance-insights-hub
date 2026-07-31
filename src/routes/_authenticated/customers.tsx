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
import { useAuth } from "@/lib/useAuth";
import { z } from "zod";
import { useDemoMode } from "@/lib/demoMode";
import { DEMO_CURRENT_WEEK, demoCustomers, demoOpenJobs } from "@/lib/demoData";

export const Route = createFileRoute("/_authenticated/customers")({ component: CustomersPage });

const schema = z.object({
  key: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
});

type FormState = { key: string; name: string; email: string; cc: string[]; enabled: boolean };
const empty: FormState = { key: "", name: "", email: "", cc: [], enabled: true };

function CustomersPage() {
  const qc = useQueryClient();
  const { role, user } = useAuth();
  const demoMode = useDemoMode();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [ccInput, setCcInput] = useState("");

  const custsQ = useQuery({
    queryKey: ["customers", demoMode],
    queryFn: async () => demoMode ? demoCustomers() : ((await supabase.from("customers").select("*").order("name")).data ?? []),
  });

  const jobsCountQ = useQuery({
    queryKey: ["customers_active_jobs", demoMode],
    queryFn: async () => {
      if (demoMode) {
        const map: Record<string, number> = {};
        for (const r of demoOpenJobs(DEMO_CURRENT_WEEK)) map[r.customer_key] = (map[r.customer_key] ?? 0) + 1;
        return map;
      }
      const { data: latest } = await supabase.from("open_jobs").select("week_start").order("week_start", { ascending: false }).limit(1);
      const week = latest?.[0]?.week_start;
      if (!week) return {} as Record<string, number>;
      const { data } = await supabase.from("open_jobs").select("customer_key").eq("week_start", week);
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[r.customer_key] = (map[r.customer_key] ?? 0) + 1;
      return map;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const payload = { key: form.key, name: form.name, email: form.email || null, cc_emails: form.cc, enabled: form.enabled };
      if (editing) {
        const { error } = await supabase.from("customers").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Saved"); setOpen(false); setEditing(null); setForm(empty); qc.invalidateQueries({ queryKey: ["customers"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("customers").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["customers"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleEnabled = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("customers").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
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
    setForm({ key: c.key, name: c.name, email: c.email ?? "", cc: c.cc_emails ?? [], enabled: c.enabled ?? true });
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
        {role === "admin" && (
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
            {(custsQ.data ?? []).map((c: any) => (
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
                  <Switch checked={!!c.enabled} onCheckedChange={(v) => toggleEnabled.mutate({ id: c.id, enabled: v })} disabled={role !== "admin"} />
                </td>
                <td className="px-6 py-3 text-right space-x-1 whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => testEmail.mutate(c)} disabled={!c.email} title="Queue test email">
                    <Mail className="w-4 h-4" />
                  </Button>
                  {role === "admin" && <>
                    <Button size="sm" variant="ghost" onClick={() => edit(c)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm("Delete this customer?") && del.mutate(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </>}
                </td>
              </tr>
            ))}
            {(custsQ.data ?? []).length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">No customers yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
