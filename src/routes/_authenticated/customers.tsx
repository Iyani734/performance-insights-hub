import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/customers")({ component: CustomersPage });

const schema = z.object({
  key: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  cc: z.string().max(1000).optional(),
});

function CustomersPage() {
  const qc = useQueryClient();
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ key: "", name: "", email: "", cc: "" });

  const custsQ = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("*").order("name");
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const cc_emails = form.cc.split(",").map(s => s.trim()).filter(Boolean);
      const payload = { key: form.key, name: form.name, email: form.email || null, cc_emails };
      if (editing) {
        const { error } = await supabase.from("customers").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Saved"); setOpen(false); setEditing(null); setForm({ key: "", name: "", email: "", cc: "" }); qc.invalidateQueries({ queryKey: ["customers"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("customers").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["customers"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  function edit(c: any) {
    setEditing(c);
    setForm({ key: c.key, name: c.name, email: c.email ?? "", cc: (c.cc_emails ?? []).join(", ") });
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage recipients for customer-specific Open Jobs reports.</p>
        </div>
        {role === "admin" && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditing(null); setForm({ key: "", name: "", email: "", cc: "" }); }}>
                <Plus className="w-4 h-4 mr-2" />Add customer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit customer" : "New customer"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Key (matches Open Jobs export)</Label><Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="ELLISON" /></div>
                <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>CC (comma-separated)</Label><Input value={form.cc} onChange={(e) => setForm({ ...form, cc: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </header>

      <Card>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-6 py-3 font-medium">Key</th>
              <th className="text-left px-6 py-3 font-medium">Name</th>
              <th className="text-left px-6 py-3 font-medium">Email</th>
              <th className="text-left px-6 py-3 font-medium">CC</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {(custsQ.data ?? []).map((c: any) => (
              <tr key={c.id} className="border-t">
                <td className="px-6 py-3 font-mono text-xs text-muted-foreground">{c.key}</td>
                <td className="px-6 py-3 font-medium">{c.name}</td>
                <td className="px-6 py-3 text-muted-foreground">{c.email ?? <span className="text-warning">missing</span>}</td>
                <td className="px-6 py-3 text-muted-foreground text-xs">{(c.cc_emails ?? []).join(", ")}</td>
                <td className="px-6 py-3 text-right space-x-1">
                  {role === "admin" && <>
                    <Button size="sm" variant="ghost" onClick={() => edit(c)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm("Delete this customer?") && del.mutate(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </>}
                </td>
              </tr>
            ))}
            {(custsQ.data ?? []).length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No customers yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
