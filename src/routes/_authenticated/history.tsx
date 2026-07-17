import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeStatus, formatKpi, formatWeek, type KpiTarget } from "@/lib/kpi";
import { deltaPct } from "@/lib/summary";
import { StatusPill } from "@/components/StatusPill";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, ArrowUp, ArrowDown, Minus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { downloadXlsx } from "@/lib/parse";
import { toast } from "sonner";
import { DateRangeSelect, type DateRange } from "@/components/DateRangeSelect";

export const Route = createFileRoute("/_authenticated/history")({ component: HistoryPage });

function monthOf(iso: string) { return iso.slice(0, 7); }
function monthLabel(m: string) {
  return new Date(m + "-01T00:00:00Z").toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

const SERIES_COLORS = [
  "hsl(200 85% 55%)",
  "hsl(280 65% 60%)",
  "hsl(30 90% 55%)",
  "hsl(150 60% 45%)",
  "hsl(340 75% 55%)",
  "hsl(180 60% 45%)",
];

function HistoryPage() {
  const [range, setRange] = useState<DateRange>({ preset: "12" });
  const [search, setSearch] = useState("");

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

  const targets = targetsQ.data ?? [];

  const allWeeks = useMemo(
    () => Array.from(new Set((valuesQ.data ?? []).map((v: any) => v.week_start as string))).sort().reverse(),
    [valuesQ.data]
  );

  // Apply date range filter to weeks list
  const filteredWeeks = useMemo(() => {
    if (range.preset === "all") return allWeeks;
    if (range.preset === "custom" && range.from && range.to) {
      return allWeeks.filter(w => w >= range.from! && w <= range.to!);
    }
    const n = Number(range.preset);
    if (Number.isFinite(n)) return allWeeks.slice(0, n);
    return allWeeks;
  }, [allWeeks, range]);

  const chartData = useMemo(() => {
    const weeksAsc = [...filteredWeeks].reverse();
    return weeksAsc.map(w => {
      const row: any = { week: formatWeek(w).replace(/,.*/, "") };
      for (const t of targets) {
        const v = (valuesQ.data ?? []).find((x: any) => x.week_start === w && x.kpi_key === t.kpi_key);
        row[t.label] = v ? Number(v.actual) : null;
      }
      return row;
    });
  }, [filteredWeeks, valuesQ.data, targets]);

  const [visibleKpis, setVisibleKpis] = useState<string[]>([]);
  const displayedKpis = visibleKpis.length ? visibleKpis : targets.slice(0, 4).map(t => t.kpi_key);

  const rowsFiltered = useMemo(() => {
    if (!search.trim()) return filteredWeeks;
    const q = search.toLowerCase();
    return filteredWeeks.filter(w => formatWeek(w).toLowerCase().includes(q));
  }, [filteredWeeks, search]);

  function exportCsv() {
    const out = filteredWeeks.map((w) => {
      const row: any = { Week: formatWeek(w) };
      for (const t of targets) {
        const v = (valuesQ.data ?? []).find((x: any) => x.week_start === w && x.kpi_key === t.kpi_key);
        row[t.label] = v ? Number(v.actual) : null;
      }
      return row;
    });
    downloadXlsx(out, `kpi-history.xlsx`);
  }

  const [weekA, setWeekA] = useState<string | null>(null);
  const [weekB, setWeekB] = useState<string | null>(null);
  const wA = weekA ?? allWeeks[0] ?? null;
  const wB = weekB ?? allWeeks[1] ?? null;

  function valueAt(week: string | null, key: string): number | null {
    if (!week) return null;
    const v = (valuesQ.data ?? []).find((x: any) => x.week_start === week && x.kpi_key === key);
    return v ? Number(v.actual) : null;
  }

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const w of allWeeks) set.add(monthOf(w));
    return Array.from(set).sort().reverse();
  }, [allWeeks]);

  const [monthA, setMonthA] = useState<string | null>(null);
  const [monthB, setMonthB] = useState<string | null>(null);
  const mA = monthA ?? months[0] ?? null;
  const mB = monthB ?? months[1] ?? null;

  function monthAvg(month: string | null, key: string): number | null {
    if (!month) return null;
    const vals = (valuesQ.data ?? [])
      .filter((v: any) => v.kpi_key === key && monthOf(v.week_start) === month && v.actual != null)
      .map((v: any) => Number(v.actual));
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
    <div className="space-y-6 animate-in fade-in duration-300">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Historical Performance</h1>
          <p className="text-sm text-muted-foreground mt-1">KPI trends, weekly comparisons, and previous uploads.</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeSelect value={range} onChange={setRange} />
          <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-2" />Export</Button>
        </div>
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
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-display text-base font-semibold">Weekly KPI values</h3>
                <p className="text-xs text-muted-foreground">Toggle metrics to focus the view</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {targets.map((t, i) => {
                  const active = displayedKpis.includes(t.kpi_key);
                  return (
                    <button
                      key={t.id}
                      onClick={() => setVisibleKpis(v => {
                        const cur = v.length ? v : targets.slice(0, 4).map(x => x.kpi_key);
                        return cur.includes(t.kpi_key) ? cur.filter(k => k !== t.kpi_key) : [...cur, t.kpi_key];
                      })}
                      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        active ? "bg-primary/10 border-primary/30 text-foreground" : "border-border text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="week" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)" }} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {targets.map((t, i) => displayedKpis.includes(t.kpi_key) && (
                  <Bar
                    key={t.id}
                    dataKey={t.label}
                    fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <div className="px-6 py-4 border-b flex items-center gap-3">
              <h2 className="font-display text-lg font-semibold mr-auto">All weeks</h2>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input placeholder="Search week…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 w-[200px]" />
              </div>
              <span className="text-xs text-muted-foreground">{rowsFiltered.length} weeks</span>
            </div>
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/70 text-xs uppercase text-muted-foreground sticky top-0 backdrop-blur z-10">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Week</th>
                    {targets.map(t => <th key={t.id} className="text-left px-3 py-3 font-medium whitespace-nowrap">{t.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rowsFiltered.map((w) => (
                    <tr key={w} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium whitespace-nowrap">{formatWeek(w)}</td>
                      {targets.map(t => {
                        const v = (valuesQ.data ?? []).find((x: any) => x.week_start === w && x.kpi_key === t.kpi_key);
                        const actual = v ? Number(v.actual) : null;
                        const s = computeStatus(actual, t);
                        const dot = s === "green" ? "bg-success" : s === "yellow" ? "bg-warning" : s === "red" ? "bg-destructive" : "bg-muted";
                        return (
                          <td key={t.id} className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                              <span className="font-medium">{formatKpi(actual, t)}</span>
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {rowsFiltered.length === 0 && <tr><td colSpan={targets.length + 1} className="text-center py-12 text-sm text-muted-foreground">No weeks match.</td></tr>}
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
                <SelectContent>{allWeeks.map(w => <SelectItem key={w} value={w}>{formatWeek(w)}</SelectItem>)}</SelectContent>
              </Select>
              <span className="text-muted-foreground">vs.</span>
              <Select value={wB ?? ""} onValueChange={setWeekB}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Week B" /></SelectTrigger>
                <SelectContent>{allWeeks.map(w => <SelectItem key={w} value={w}>{formatWeek(w)}</SelectItem>)}</SelectContent>
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
                        <td className="px-6 py-3"><span className="inline-flex items-center gap-2">{formatKpi(a, t)} <StatusPill status={computeStatus(a, t)} /></span></td>
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
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/70 text-xs uppercase text-muted-foreground sticky top-0 backdrop-blur z-10">
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
                    <tr key={u.id} className="border-t hover:bg-muted/30">
                      <td className="px-6 py-2.5 text-muted-foreground whitespace-nowrap">{new Date(u.created_at).toLocaleString()}</td>
                      <td className="px-6 py-2.5 whitespace-nowrap">{formatWeek(u.week_start)}</td>
                      <td className="px-6 py-2.5">{u.kind}</td>
                      <td className="px-6 py-2.5 text-muted-foreground truncate max-w-[280px]">{u.file_name}</td>
                      <td className="px-6 py-2.5 text-right font-medium">{u.row_count ?? 0}</td>
                      <td className="px-6 py-2.5 text-right">
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
