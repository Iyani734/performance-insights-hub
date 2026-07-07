import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeAutoKpis, computeStatus, formatKpi, formatWeek, weekStartOf, type KpiTarget } from "@/lib/kpi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/StatusPill";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Legend } from "recharts";
import { useMemo, useState } from "react";
import { Ticket, CheckCircle2, AlertTriangle, DollarSign, ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

async function fetchWeeks(): Promise<string[]> {
  const { data } = await supabase.from("report_uploads").select("week_start").order("week_start", { ascending: false });
  const uniq = Array.from(new Set((data ?? []).map((r: any) => r.week_start as string)));
  if (uniq.length === 0) uniq.push(weekStartOf(new Date()));
  return uniq;
}

async function fetchTrends() {
  const { data } = await supabase.from("kpi_values").select("kpi_key,week_start,actual").order("week_start");
  return data ?? [];
}

function Dashboard() {
  const nav = useNavigate();
  const weeksQ = useQuery({ queryKey: ["weeks"], queryFn: fetchWeeks });
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const week = selectedWeek ?? weeksQ.data?.[0] ?? weekStartOf(new Date());

  const targetsQ = useQuery({
    queryKey: ["kpi_targets"],
    queryFn: async () => {
      const { data } = await supabase.from("kpi_targets").select("*").order("sort_order");
      return (data ?? []) as KpiTarget[];
    },
  });

  const autoQ = useQuery({ queryKey: ["auto_kpi", week], queryFn: () => computeAutoKpis(week), enabled: !!week });

  const manualQ = useQuery({
    queryKey: ["kpi_values", week],
    queryFn: async () => {
      const { data } = await supabase.from("kpi_values").select("*").eq("week_start", week);
      return data ?? [];
    },
    enabled: !!week,
  });

  const notesQ = useQuery({
    queryKey: ["kpi_notes", week],
    queryFn: async () => {
      const { data } = await supabase.from("kpi_notes").select("*").eq("week_start", week).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!week,
  });

  const trendsQ = useQuery({ queryKey: ["kpi_trends"], queryFn: fetchTrends });

  const totals = autoQ.data?.totals ?? { tickets: 0, invoiced: 0, quality_issues: 0, voided: 0 };
  const targets = targetsQ.data ?? [];

  const kpiRows = useMemo(() => targets.map((t) => {
    const manual = manualQ.data?.find((v: any) => v.kpi_key === t.kpi_key);
    const autoVal = (autoQ.data as any)?.[t.kpi_key];
    const actual = manual?.actual != null ? Number(manual.actual) : (typeof autoVal === "number" ? autoVal : null);
    return { target: t, actual, source: manual ? "Manual" : (t.auto ? "Auto" : "—") };
  }), [targets, manualQ.data, autoQ.data]);

  const weeks = weeksQ.data ?? [];
  const currentIdx = weeks.indexOf(week);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Performance Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Weekly operational KPIs across dispatch, quality, and billing.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" disabled={currentIdx <= 0} onClick={() => setSelectedWeek(weeks[currentIdx - 1])}><ChevronLeft className="w-4 h-4" /></Button>
          <Select value={week} onValueChange={setSelectedWeek}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>{weeks.map(w => <SelectItem key={w} value={w}>Week of {formatWeek(w)}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="icon" variant="outline" disabled={currentIdx < 0 || currentIdx >= weeks.length - 1} onClick={() => setSelectedWeek(weeks[currentIdx + 1])}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </header>

      {weeks.length === 0 || autoQ.data?.totals.tickets === 0 && autoQ.data?.totals.invoiced === 0 ? (
        <Card className="p-6 border-dashed">
          <div className="flex items-center gap-4">
            <AlertTriangle className="w-6 h-6 text-warning" />
            <div className="flex-1">
              <div className="font-medium">No data for this week yet</div>
              <div className="text-sm text-muted-foreground">Upload Total Tickets, Total Invoiced, or Open Jobs to populate KPIs.</div>
            </div>
            <Button onClick={() => nav({ to: "/uploads" })}>Go to Uploads</Button>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Ticket} label="Active Tickets" value={totals.tickets} accent="text-primary" />
        <StatCard icon={CheckCircle2} label="Tickets Invoiced" value={totals.invoiced} accent="text-success" />
        <StatCard icon={AlertTriangle} label="Quality Issues" value={totals.quality_issues} accent="text-warning" />
        <StatCard icon={DollarSign} label="Voided" value={totals.voided} accent="text-destructive" />
      </div>

      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">KPI Performance Tracker</h2>
            <p className="text-xs text-muted-foreground">Week of {formatWeek(week)}</p>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-6 py-3 font-medium">Owner</th>
              <th className="text-left px-6 py-3 font-medium">Cadence</th>
              <th className="text-left px-6 py-3 font-medium">Metric</th>
              <th className="text-left px-6 py-3 font-medium">Target</th>
              <th className="text-left px-6 py-3 font-medium">Actual</th>
              <th className="text-left px-6 py-3 font-medium">Status</th>
              <th className="text-left px-6 py-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {kpiRows.map(({ target, actual, source }) => (
              <tr key={target.id} className="border-t">
                <td className="px-6 py-4 text-muted-foreground">{target.owner ?? "—"}</td>
                <td className="px-6 py-4 text-muted-foreground">{target.cadence}</td>
                <td className="px-6 py-4 font-medium">{target.label}</td>
                <td className="px-6 py-4 text-muted-foreground">{target.target_display ?? "—"}</td>
                <td className="px-6 py-4 font-semibold">{formatKpi(actual, target)}</td>
                <td className="px-6 py-4"><StatusPill status={computeStatus(actual, target)} /></td>
                <td className="px-6 py-4 text-xs text-muted-foreground">{source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-display text-base font-semibold mb-4">KPI Trends</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendChart(trendsQ.data ?? [])}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="week" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)" }} />
              <Legend />
              <Line type="monotone" dataKey="Review→Final Edit %" stroke="oklch(0.62 0.13 190)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Ticket Quality %" stroke="oklch(0.78 0.16 75)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Invoice Cycle (d)" stroke="oklch(0.6 0.22 25)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-6">
          <h3 className="font-display text-base font-semibold mb-4">Notes & Corrective Actions</h3>
          <div className="space-y-3 max-h-[260px] overflow-auto">
            {(notesQ.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No notes yet for this week.</p>}
            {(notesQ.data ?? []).map((n: any) => (
              <div key={n.id} className="p-3 rounded-md bg-muted/40 border">
                <div className="text-xs text-muted-foreground mb-1">{n.kpi_key} · {new Date(n.created_at).toLocaleString()}</div>
                <div className="text-sm">{n.note}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className="text-3xl font-display font-semibold mt-1">{value.toLocaleString()}</div>
        </div>
        <div className={`w-10 h-10 rounded-lg bg-muted flex items-center justify-center ${accent}`}><Icon className="w-5 h-5" /></div>
      </div>
    </Card>
  );
}

function trendChart(rows: any[]) {
  const byWeek: Record<string, any> = {};
  for (const r of rows) {
    const w = formatWeek(r.week_start);
    byWeek[w] = byWeek[w] ?? { week: w };
    if (r.kpi_key === "review_to_final_edit") byWeek[w]["Review→Final Edit %"] = Number(r.actual);
    if (r.kpi_key === "ticket_quality") byWeek[w]["Ticket Quality %"] = Number(r.actual);
    if (r.kpi_key === "invoice_cycle_time") byWeek[w]["Invoice Cycle (d)"] = Number(r.actual);
  }
  return Object.values(byWeek);
}
