import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeStatus, formatKpi, formatWeek, type KpiTarget } from "@/lib/kpi";
import { deltaPct } from "@/lib/summary";
import { StatusPill } from "@/components/StatusPill";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { downloadXlsx } from "@/lib/parse";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/history")({ component: HistoryPage });

function monthOf(iso: string) { return iso.slice(0, 7); }
function monthLabel(m: string) {
  const d = new Date(m + "-01T00:00:00Z");
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function HistoryPage() {
  const targetsQ = useQuery({
    queryKey: ["kpi_targets"],
    queryFn: async () => ((await supabase.from("kpi_targets").select("*").order("sort_order")).data ?? []) as KpiTarget[],
  });

  const valuesQ = useQuery({
    queryKey: ["kpi_values_all"],
    queryFn: async () => ((await supabase.from("kpi_values").select("*").order("week_start", { ascending: false })).data ?? []),
  });

  const uploadsQ = useQuery({
    queryKey: ["uploads_history"],
    queryFn: async () => ((await supabase.from("report_uploads").select("*").order("created_at", { ascending: false }).limit(200)).data ?? []),
  });

  const grid = useMemo(() => {
    const weeks = Array.from(new Set((valuesQ.data ?? []).map((v: any) => v.week_start))).sort().reverse();
    return { weeks, values: valuesQ.data ?? [] };
  }, [valuesQ.data]);

  const chartData = useMemo(() => {
    const map = new Map<string, any>();
    for (const v of valuesQ.data ?? []) {
      const wk = formatWeek(v.week_start);
      if (!map.has(wk)) map.set(wk, { week: wk });
      map.get(wk)[v.kpi_key] = Number(v.actual);
    }
    return Array.from(map.values()).reverse();
  }, [valuesQ.data]);

  const targets = targetsQ.data ?? [];

  function exportCsv() {
    const out = grid.weeks.map((w) => {
      const row: any = { Week: formatWeek(w) };
      for (const t of targets) {
        const v = grid.values.find((x: any) => x.week_start === w && x.kpi_key === t.kpi_key);
        row[t.label] = v ? Number(v.actual) : null;
      }
      return row;
    });
    downloadXlsx(out, `kpi-history.xlsx`);
  }

  const [weekA, setWeekA] = useState<string | null>(null);
  const [weekB, setWeekB] = useState<string | null>(null);
  const wA = weekA ?? grid.weeks[0] ?? null;
  const wB = weekB ?? grid.weeks[1] ?? null;

  function valueAt(week: string | null, key: string): number | null {
    if (!week) return null;
    const v = grid.values.find((x: any) => x.week_start === week && x.kpi_key === key);
    return v ? Number(v.actual) : null;
  }

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const w of grid.weeks) set.add(monthOf(w));
    return Array.from(set).sort().reverse();
  }, [grid.weeks]);

  const [monthA, setMonthA] = useState<string | null>(null);
  const [monthB, setMonthB] = useState<string | null>(null);
  const mA = monthA ?? months[0] ?? null;
  const mB = monthB ?? months[1] ?? null;

  function monthAvg(month: string | null, key: string): number | null {
    if (!month) return null;
    const vals = grid.values.filter((v: any) => v.kpi_key === key && monthOf(v.week_start) === month && v.actual != null).map((v: any) => Number(v.actual));
    if (!vals.length) return null;
    return vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
  }

  async function downloadUpload(u: any) {
    if (!u.file_path) { toast.error("Original file not stored"); return; }
    const { data, error } = await supabase.storage.from("report-files").createSignedUrl(u.file_path, 60);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Historical Performance</h1>
          <p className="text-sm text-muted-foreground mt-1">KPI trends, weekly comparisons, and previous uploads.</p>
        </div>
        <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-2" />Export</Button>
      </header>

      <Tabs defaultValue="kpi">
        <TabsList>
          <TabsTrigger value="kpi">KPI History</TabsTrigger>
          <TabsTrigger value="compare">Compare Weeks</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="uploads">Uploads</TabsTrigger>
        </TabsList>

        <TabsContent value="kpi" className="space-y-6 mt-4">
          <Card className="p-6">
            <h3 className="font-display text-base font-semibold mb-4">Weekly KPI values</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)" }} />
                <Bar dataKey="review_to_final_edit" fill="oklch(0.62 0.13 190)" radius={[4,4,0,0]} name="Review→Final Edit" />
                <Bar dataKey="ticket_quality" fill="oklch(0.78 0.16 75)" radius={[4,4,0,0]} name="Ticket Quality" />
                <Bar dataKey="invoice_cycle_time" fill="oklch(0.6 0.22 25)" radius={[4,4,0,0]} name="Invoice Cycle" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <div className="px-6 py-4 border-b"><h2 className="font-display text-lg font-semibold">All weeks</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium">Week</th>
                    {targets.map(t => <th key={t.id} className="text-left px-6 py-3 font-medium">{t.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {grid.weeks.map((w) => (
                    <tr key={w} className="border-t">
                      <td className="px-6 py-3 font-medium whitespace-nowrap">{formatWeek(w)}</td>
                      {targets.map(t => {
                        const v = grid.values.find((x: any) => x.week_start === w && x.kpi_key === t.kpi_key);
                        const actual = v ? Number(v.actual) : null;
                        return <td key={t.id} className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{formatKpi(actual, t)}</span>
                            <StatusPill status={computeStatus(actual, t)} />
                          </div>
                        </td>;
                      })}
                    </tr>
                  ))}
                  {grid.weeks.length === 0 && <tr><td colSpan={targets.length + 1} className="text-center py-8 text-sm text-muted-foreground">No historical data yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="compare" className="mt-4">
          <Card>
            <div className="px-6 py-4 border-b flex flex-wrap items-center gap-3">
              <h2 className="font-display text-lg font-semibold mr-auto">Compare weeks</h2>
              <Select value={wA ?? ""} onValueChange={setWeekA}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Week A" /></SelectTrigger>
                <SelectContent>{grid.weeks.map(w => <SelectItem key={w} value={w}>{formatWeek(w)}</SelectItem>)}</SelectContent>
              </Select>
              <span className="text-muted-foreground">vs.</span>
              <Select value={wB ?? ""} onValueChange={setWeekB}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Week B" /></SelectTrigger>
                <SelectContent>{grid.weeks.map(w => <SelectItem key={w} value={w}>{formatWeek(w)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium">KPI</th>
                    <th className="text-left px-6 py-3 font-medium">{wA ? formatWeek(wA) : "—"}</th>
                    <th className="text-left px-6 py-3 font-medium">{wB ? formatWeek(wB) : "—"}</th>
                    <th className="text-left px-6 py-3 font-medium">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map(t => {
                    const a = valueAt(wA, t.kpi_key), b = valueAt(wB, t.kpi_key);
                    const d = deltaPct(a, b);
                    const better = d == null ? null : (t.direction === "lower_is_better" ? d < 0 : d > 0);
                    const Icon = d == null ? Minus : better ? ArrowUp : ArrowDown;
                    return (
                      <tr key={t.id} className="border-t">
                        <td className="px-6 py-3 font-medium">{t.label}</td>
                        <td className="px-6 py-3">{formatKpi(a, t)}</td>
                        <td className="px-6 py-3 text-muted-foreground">{formatKpi(b, t)}</td>
                        <td className={`px-6 py-3 ${d == null ? "text-muted-foreground" : better ? "text-success" : "text-destructive"}`}>
                          <span className="inline-flex items-center gap-1"><Icon className="w-3 h-3" />{d == null ? "—" : `${Math.abs(d).toFixed(1)}%`}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="monthly" className="mt-4">
          <Card>
            <div className="px-6 py-4 border-b flex flex-wrap items-center gap-3">
              <h2 className="font-display text-lg font-semibold mr-auto">Compare months</h2>
              <Select value={mA ?? ""} onValueChange={setMonthA}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Month A" /></SelectTrigger>
                <SelectContent>{months.map(m => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}</SelectContent>
              </Select>
              <span className="text-muted-foreground">vs.</span>
              <Select value={mB ?? ""} onValueChange={setMonthB}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Month B" /></SelectTrigger>
                <SelectContent>{months.map(m => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium">KPI (avg)</th>
                    <th className="text-left px-6 py-3 font-medium">{mA ? monthLabel(mA) : "—"}</th>
                    <th className="text-left px-6 py-3 font-medium">{mB ? monthLabel(mB) : "—"}</th>
                    <th className="text-left px-6 py-3 font-medium">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map(t => {
                    const a = monthAvg(mA, t.kpi_key), b = monthAvg(mB, t.kpi_key);
                    const d = deltaPct(a, b);
                    const better = d == null ? null : (t.direction === "lower_is_better" ? d < 0 : d > 0);
                    return (
                      <tr key={t.id} className="border-t">
                        <td className="px-6 py-3 font-medium">{t.label}</td>
                        <td className="px-6 py-3">{formatKpi(a, t)}</td>
                        <td className="px-6 py-3 text-muted-foreground">{formatKpi(b, t)}</td>
                        <td className={`px-6 py-3 ${d == null ? "text-muted-foreground" : better ? "text-success" : "text-destructive"}`}>{d == null ? "—" : `${Math.abs(d).toFixed(1)}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="uploads" className="mt-4">
          <Card>
            <div className="px-6 py-4 border-b"><h2 className="font-display text-lg font-semibold">All uploads</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium">When</th>
                    <th className="text-left px-6 py-3 font-medium">Week</th>
                    <th className="text-left px-6 py-3 font-medium">Type</th>
                    <th className="text-left px-6 py-3 font-medium">File</th>
                    <th className="text-right px-6 py-3 font-medium">Rows</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {(uploadsQ.data ?? []).map((u: any) => (
                    <tr key={u.id} className="border-t">
                      <td className="px-6 py-3 text-muted-foreground whitespace-nowrap">{new Date(u.created_at).toLocaleString()}</td>
                      <td className="px-6 py-3 whitespace-nowrap">{formatWeek(u.week_start)}</td>
                      <td className="px-6 py-3">{u.kind}</td>
                      <td className="px-6 py-3 text-muted-foreground truncate max-w-[280px]">{u.file_name}</td>
                      <td className="px-6 py-3 text-right font-medium">{u.row_count ?? 0}</td>
                      <td className="px-6 py-3 text-right">
                        {u.file_path && <Button size="sm" variant="ghost" onClick={() => downloadUpload(u)}><Download className="w-4 h-4" /></Button>}
                      </td>
                    </tr>
                  ))}
                  {(uploadsQ.data ?? []).length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">No uploads yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
