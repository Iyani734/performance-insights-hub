import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/lib/useAuth";
import type { KpiTarget } from "@/lib/kpi";
import { useState, useEffect } from "react";
import { Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const { role, loading } = useAuth();
  const qc = useQueryClient();
  const targetsQ = useQuery({
    queryKey: ["kpi_targets"],
    queryFn: async () => ((await supabase.from("kpi_targets").select("*").order("sort_order")).data ?? []) as KpiTarget[],
  });
  const [drafts, setDrafts] = useState<Record<string, KpiTarget>>({});

  useEffect(() => {
    if (targetsQ.data) {
      const map: Record<string, KpiTarget> = {};
      targetsQ.data.forEach(t => { map[t.id] = { ...t }; });
      setDrafts(map);
    }
  }, [targetsQ.data]);

  const save = useMutation({
    mutationFn: async (t: KpiTarget) => {
      const { error } = await supabase.from("kpi_targets").update({
        label: t.label, owner: t.owner, cadence: t.cadence,
        green_min: t.green_min, yellow_min: t.yellow_min,
        target_display: t.target_display, direction: t.direction,
      }).eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["kpi_targets"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (loading) return null;
  if (role !== "admin") return <Navigate to="/dashboard" />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Edit KPI thresholds and targets.</p>
      </header>

      <Card>
        <div className="px-6 py-4 border-b"><h2 className="font-display text-lg font-semibold">KPI Targets</h2></div>
        <div className="divide-y">
          {Object.values(drafts).map((t) => (
            <div key={t.id} className="p-6 grid md:grid-cols-6 gap-3 items-end">
              <div className="md:col-span-2 space-y-1.5">
                <Label>Metric</Label>
                <Input value={t.label} onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...t, label: e.target.value } })} />
              </div>
              <div className="space-y-1.5"><Label>Owner</Label><Input value={t.owner ?? ""} onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...t, owner: e.target.value } })} /></div>
              <div className="space-y-1.5"><Label>Green ≥/≤</Label><Input type="number" value={t.green_min} onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...t, green_min: Number(e.target.value) } })} /></div>
              <div className="space-y-1.5"><Label>Yellow ≥/≤</Label><Input type="number" value={t.yellow_min} onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...t, yellow_min: Number(e.target.value) } })} /></div>
              <div><Button onClick={() => save.mutate(t)} disabled={save.isPending}>Save</Button></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
