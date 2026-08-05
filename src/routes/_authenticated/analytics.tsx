import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart, Bar, BarChart, Legend } from "recharts";
import { computeStatus, formatKpi, formatWeek, type KpiTarget, type KpiStatus } from "@/lib/kpi";
import { StatusPill } from "@/components/StatusPill";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, BarChart3, Grid3x3, Sparkles } from "lucide-react";
import { DateRangeSelect, type DateRange } from "@/components/DateRangeSelect";
import { useDemoMode } from "@/lib/demoMode";
import { addDays, DEMO_TARGETS, DEMO_WEEKS, demoAutoKpisForRange, demoKpiValues } from "@/lib/demoData";
import { isSeededDemoPayload, isSeededDemoSource, isSeededDemoUpload } from "@/lib/liveData";
import { normalizeTicketStatus } from "@/lib/kpiRules";
import { isActiveReviewFinalUpload } from "@/lib/reportTypes";
import { fetchAllSupabaseRows } from "@/lib/supabasePagination";

export const Route = createFileRoute("/_authenticated/analytics")({ component: AnalyticsPage });

type Row = { kpi_key: string; week_start: string; actual: number | null };
type TicketStatusRow = { week_start: string; active: number; review: number; finalEdit: number; total: number };

const TREND_COLORS = [
  "#0f766e",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#16a34a",
  "#0891b2",
  "#9333ea",
];

function statusColor(s: KpiStatus): string {
  return s === "green" ? "hsl(var(--success))" : s === "yellow" ? "hsl(var(--warning))" : s === "red" ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))";
}
function statusBg(s: KpiStatus): string {
  return s === "green" ? "bg-success" : s === "yellow" ? "bg-warning" : s === "red" ? "bg-destructive" : "bg-muted";
}

function buildTicketStatusRows(rows: any[]): TicketStatusRow[] {
  const byWeek = new Map<string, TicketStatusRow>();

  for (const row of rows) {
    const week = String(row.week_start ?? "").slice(0, 10);
    if (!week) continue;

    if (!byWeek.has(week)) {
      byWeek.set(week, { week_start: week, active: 0, review: 0, finalEdit: 0, total: 0 });
    }

    const bucket = byWeek.get(week)!;
    bucket.total += 1;

    const status = normalizeTicketStatus(row.status);
    if (status === "active") bucket.active += 1;
    if (status === "review") bucket.review += 1;
    if (status === "final edit") bucket.finalEdit += 1;
  }

  return Array.from(byWeek.values()).sort((a, b) => a.week_start.localeCompare(b.week_start));
}

function demoTicketStatusRows(): TicketStatusRow[] {
  return DEMO_WEEKS.map((week) => {
    const totals = demoAutoKpisForRange({ from: week, to: addDays(week, 6) }).totals;
    return {
      week_start: week,
      active: totals.active_tickets,
      review: totals.review_tickets,
      finalEdit: totals.final_edit_tickets,
      total: totals.tickets,
    };
  }).sort((a, b) => a.week_start.localeCompare(b.week_start));
}

function AnalyticsPage() {
  const [range, setRange] = useState<DateRange>({ preset: "12" });
  const demoMode = useDemoMode();

  const targetsQ = useQuery({
    queryKey: ["kpi_targets", demoMode],
    queryFn: async () => demoMode ? DEMO_TARGETS : ((await supabase.from("kpi_targets").select("*").order("sort_order")).data ?? []) as KpiTarget[],
  });

  const valuesQ = useQuery({
    queryKey: ["kpi_values_all", demoMode],
    queryFn: async () => {
      if (demoMode) return demoKpiValues() as Row[];
      const { data } = await supabase.from("kpi_values").select("kpi_key,week_start,actual,source").order("week_start");
      return (data ?? []).filter((row) => !isSeededDemoSource(row.source)) as Row[];
    },
  });

  const ticketStatusQ = useQuery({
    queryKey: ["ticket_status_counts", demoMode],
    queryFn: async () => {
      if (demoMode) return demoTicketStatusRows();
      const { data: uploads } = await supabase
        .from("report_uploads")
        .select("id,kind,file_name,status")
        .order("created_at", { ascending: false })
        .limit(1000);
      const uploadIds = (uploads ?? [])
        .filter((upload) => !isSeededDemoUpload(upload.file_name))
        .filter((upload) => upload.status !== "failed" && upload.status !== "processing")
        .filter(isActiveReviewFinalUpload)
        .map((upload) => upload.id);
      if (!uploadIds.length) return [];
      const data = await fetchAllSupabaseRows<any>((from, to) =>
        supabase
          .from("tickets")
          .select("week_start,status,raw")
          .in("upload_id", uploadIds)
          .eq("kind", "tickets")
          .order("week_start")
          .range(from, to),
      );
      return buildTicketStatusRows(data.filter((row) => !isSeededDemoPayload(row.raw)));
    },
  });

  const targets = targetsQ.data ?? [];
  const rows = valuesQ.data ?? [];
  const ticketStatusRows = ticketStatusQ.data ?? [];

  const weeks = useMemo(() => {
    const all = Array.from(new Set([
      ...rows.map(r => r.week_start),
      ...ticketStatusRows.map(r => r.week_start),
    ])).sort();
    if (range.preset === "all") return all;
    if (range.preset === "custom" && range.from && range.to) return all.filter(w => w >= range.from! && w <= range.to!);
    const n = Number(range.preset);
    return Number.isFinite(n) ? all.slice(-n) : all;
  }, [rows, ticketStatusRows, range]);

  const byKpi = useMemo(() => {
    const m = new Map<string, Map<string, number | null>>();
    for (const r of rows) {
      if (!weeks.includes(r.week_start)) continue;
      if (!m.has(r.kpi_key)) m.set(r.kpi_key, new Map());
      m.get(r.kpi_key)!.set(r.week_start, r.actual != null ? Number(r.actual) : null);
    }
    return m;
  }, [rows, weeks]);

  const statusChartData = useMemo(() => {
    const byWeek = new Map(ticketStatusRows.map((row) => [row.week_start, row]));
    return weeks
      .map((week) => {
        const row = byWeek.get(week);
        return {
          week: formatWeek(week).replace(/,.*/, ""),
          active: row?.active ?? 0,
          review: row?.review ?? 0,
          finalEdit: row?.finalEdit ?? 0,
        };
      })
      .filter((row) => row.active > 0 || row.review > 0 || row.finalEdit > 0);
  }, [ticketStatusRows, weeks]);

  const loading = targetsQ.isLoading || valuesQ.isLoading || ticketStatusQ.isLoading;
  const empty = !loading && rows.length === 0 && ticketStatusRows.length === 0;

  // Insights
  const insights = useMemo(() => {
    const out: { kind: "improve" | "decline" | "streak"; text: string; status: KpiStatus }[] = [];
    for (const t of targets) {
      const series = weeks.map(w => byKpi.get(t.kpi_key)?.get(w) ?? null).filter((n): n is number => n != null);
      if (series.length < 2) continue;
      const first = series[0], last = series[series.length - 1];
      const change = ((last - first) / Math.abs(first || 1)) * 100;
      const improving = t.direction === "lower_is_better" ? change < 0 : change > 0;
      const status = computeStatus(last, t);
      if (Math.abs(change) >= 5) {
        out.push({
          kind: improving ? "improve" : "decline",
          status,
          text: `${t.label} ${improving ? "improved" : "declined"} ${Math.abs(change).toFixed(1)}% over ${series.length} weeks (now ${formatKpi(last, t)}).`,
        });
      }
      // streaks
      let streak = 0;
      for (let i = series.length - 1; i > 0; i--) {
        const d = series[i] - series[i - 1];
        const good = t.direction === "lower_is_better" ? d < 0 : d > 0;
        if (good) streak++; else break;
      }
      if (streak >= 3) out.push({ kind: "streak", status, text: `${t.label} improving ${streak} weeks in a row.` });
    }
    return out.slice(0, 6);
  }, [targets, byKpi, weeks]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Operations Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Per-KPI trends, heatmap and smart insights across your weekly reports.</p>
        </div>
        <DateRangeSelect value={range} onChange={setRange} />
      </header>

      {loading && (
        <div className="grid md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map(i => <Card key={i} className="p-6 h-[280px] animate-pulse bg-muted/30" />)}
        </div>
      )}

      {empty && (
        <Card className="p-10 text-center border-dashed">
          <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No data yet</p>
          <p className="text-sm text-muted-foreground mt-1">Upload weekly reports to see trends and insights here.</p>
        </Card>
      )}

      {!loading && !empty && (
        <>
          {/* Smart insights */}
          {insights.length > 0 && (
            <Card className="p-6">
              <h2 className="font-display text-base font-semibold mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />Smart Insights
              </h2>
              <div className="grid md:grid-cols-2 gap-2">
                {insights.map((i, idx) => {
                  const Icon = i.kind === "improve" || i.kind === "streak" ? TrendingUp : i.kind === "decline" ? TrendingDown : Minus;
                  const color = i.kind === "decline" ? "text-destructive" : "text-success";
                  return (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-md bg-muted/40">
                      <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", color)} />
                      <span className="text-sm">{i.text}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Ticket status snapshot */}
          {statusChartData.length > 0 && (
            <Card className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-display text-base font-semibold flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />Ticket Status Snapshot
                  </h2>
                  <p className="text-xs text-muted-foreground">Counts from the Active/Review/Final Status column: A = Active, E/R = Review, and F = Final Edit.</p>
                </div>
                <div className="text-xs text-muted-foreground">Selected date window</div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={statusChartData} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 88%)" opacity={0.9} />
                  <XAxis dataKey="week" stroke="hsl(220 10% 42%)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(220 10% 42%)" fontSize={11} tickLine={false} axisLine={false} width={48} />
                  <Tooltip
                    cursor={{ fill: "hsl(186 54% 93%)", opacity: 0.5 }}
                    contentStyle={{ background: "hsl(0 0% 100%)", color: "hsl(220 25% 16%)", border: "1px solid hsl(220 14% 86%)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: any, name: any) => [Number(v).toLocaleString(), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="active" name="Active" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="review" name="Review" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="finalEdit" name="Final Edit" fill="#34d399" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Heatmap */}
          {targets.length > 0 && rows.length > 0 && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-base font-semibold flex items-center gap-2">
                  <Grid3x3 className="w-4 h-4" />KPI Heatmap
                </h2>
                <p className="text-xs text-muted-foreground">Status of every KPI across the selected window</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-success" />On target</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-warning" />Watch</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-destructive" />Critical</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left px-2 py-2 sticky left-0 bg-card z-10 font-medium text-muted-foreground min-w-[180px]">KPI</th>
                    {weeks.map(w => (
                      <th key={w} className="px-1 py-2 font-normal text-muted-foreground text-center whitespace-nowrap">
                        {formatWeek(w).replace(/, \d{4}/, "")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {targets.map(t => (
                    <tr key={t.id} className="border-t border-border/40">
                      <td className="px-2 py-1.5 sticky left-0 bg-card font-medium truncate max-w-[180px]">{t.label}</td>
                      {weeks.map(w => {
                        const v = byKpi.get(t.kpi_key)?.get(w) ?? null;
                        const s = computeStatus(v, t);
                        return (
                          <td key={w} className="px-1 py-1">
                            <div
                              title={`${t.label} · ${formatWeek(w)}: ${formatKpi(v, t)}`}
                              className={cn(
                                "h-8 rounded-sm flex items-center justify-center text-[10px] font-medium text-white/95 transition-transform hover:scale-110",
                                s === "none" ? "bg-muted/40 text-muted-foreground" : statusBg(s)
                              )}
                            >
                              {v != null ? formatKpi(v, t).replace(/[%d\s]/g, "") : "—"}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          )}

          {/* Per-KPI trend charts */}
          {targets.length > 0 && rows.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            {targets.map((t, index) => {
              const data = weeks.map(w => ({ week: formatWeek(w).replace(/,.*/, ""), value: byKpi.get(t.kpi_key)?.get(w) ?? null }));
              const latest = [...data].reverse().find(d => d.value != null)?.value ?? null;
              const status = computeStatus(latest, t);
              const values = data.map(d => d.value).filter((n): n is number => n != null);
              const first = values[0], last = values[values.length - 1];
              const change = values.length >= 2 ? ((last - first) / Math.abs(first || 1)) * 100 : null;
              const improving = change == null ? null : t.direction === "lower_is_better" ? change < 0 : change > 0;
              const lineColor = TREND_COLORS[index % TREND_COLORS.length];
              const gradId = `g-${t.kpi_key}`;
              return (
                <Card
                  key={t.id}
                  className="p-5 relative overflow-hidden group border-border/70 bg-card shadow-sm"
                >
                  <div className="flex items-start justify-between mb-2 relative">
                    <div className="min-w-0">
                      <div className="text-sm text-foreground font-bold tracking-tight">{t.label}</div>
                      <div className="text-xs text-muted-foreground font-semibold mt-0.5">Target: {t.target_display ?? "—"}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-display font-bold" style={{ color: lineColor }}>{formatKpi(latest, t)}</div>
                      <div className="flex items-center gap-1.5 justify-end mt-0.5">
                        <StatusPill status={status} />
                        {change != null && (
                          <span className={cn("text-[11px] font-semibold inline-flex items-center gap-0.5", improving ? "text-success" : "text-destructive")}>
                            {improving ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {Math.abs(change).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                      <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={lineColor} stopOpacity={0.24} />
                          <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 86%)" opacity={0.8} />
                      <XAxis dataKey="week" stroke="hsl(220 10% 44%)" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(220 10% 44%)" fontSize={10} tickLine={false} axisLine={false} width={44} />
                      <Tooltip
                        cursor={{ stroke: lineColor, strokeOpacity: 0.4, strokeWidth: 1 }}
                        contentStyle={{ background: "hsl(0 0% 100%)", color: "hsl(220 25% 16%)", border: "1px solid hsl(220 14% 86%)", borderRadius: 8, fontSize: 12 }}
                        formatter={(v: any) => [v != null ? formatKpi(Number(v), t) : "—", t.label]}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={lineColor}
                        strokeWidth={2}
                        fill={`url(#${gradId})`}
                        connectNulls
                        isAnimationActive
                        animationDuration={800}
                        dot={false}
                        activeDot={{ r: 4, fill: lineColor, stroke: "hsl(0 0% 100%)", strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>
              );
            })}
          </div>
          )}
        </>
      )}
    </div>
  );
}
