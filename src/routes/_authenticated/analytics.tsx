import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Area, AreaChart } from "recharts";
import { computeStatus, formatKpi, formatWeek, type KpiTarget, type KpiStatus } from "@/lib/kpi";
import { StatusPill } from "@/components/StatusPill";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, BarChart3, Grid3x3, Sparkles } from "lucide-react";
import { DateRangeSelect, type DateRange } from "@/components/DateRangeSelect";

export const Route = createFileRoute("/_authenticated/analytics")({ component: AnalyticsPage });

type Row = { kpi_key: string; week_start: string; actual: number | null };

function statusColor(s: KpiStatus): string {
  return s === "green" ? "hsl(var(--success))" : s === "yellow" ? "hsl(var(--warning))" : s === "red" ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))";
}
function statusBg(s: KpiStatus): string {
  return s === "green" ? "bg-success" : s === "yellow" ? "bg-warning" : s === "red" ? "bg-destructive" : "bg-muted";
}

function AnalyticsPage() {
  const [range, setRange] = useState<DateRange>({ preset: "12" });

  const targetsQ = useQuery({
    queryKey: ["kpi_targets"],
    queryFn: async () => ((await supabase.from("kpi_targets").select("*").order("sort_order")).data ?? []) as KpiTarget[],
  });

  const valuesQ = useQuery({
    queryKey: ["kpi_values_all"],
    queryFn: async () => ((await supabase.from("kpi_values").select("kpi_key,week_start,actual").order("week_start")).data ?? []) as Row[],
  });

  const targets = targetsQ.data ?? [];
  const rows = valuesQ.data ?? [];

  const weeks = useMemo(() => {
    const all = Array.from(new Set(rows.map(r => r.week_start))).sort();
    if (range.preset === "all") return all;
    if (range.preset === "custom" && range.from && range.to) return all.filter(w => w >= range.from! && w <= range.to!);
    const n = Number(range.preset);
    return Number.isFinite(n) ? all.slice(-n) : all;
  }, [rows, range]);

  const byKpi = useMemo(() => {
    const m = new Map<string, Map<string, number | null>>();
    for (const r of rows) {
      if (!weeks.includes(r.week_start)) continue;
      if (!m.has(r.kpi_key)) m.set(r.kpi_key, new Map());
      m.get(r.kpi_key)!.set(r.week_start, r.actual != null ? Number(r.actual) : null);
    }
    return m;
  }, [rows, weeks]);

  const loading = targetsQ.isLoading || valuesQ.isLoading;
  const empty = !loading && (targets.length === 0 || rows.length === 0);

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

          {/* Heatmap */}
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

          {/* Per-KPI trend charts */}
          <div className="grid md:grid-cols-2 gap-4">
            {targets.map(t => {
              const data = weeks.map(w => ({ week: formatWeek(w).replace(/,.*/, ""), value: byKpi.get(t.kpi_key)?.get(w) ?? null }));
              const latest = [...data].reverse().find(d => d.value != null)?.value ?? null;
              const status = computeStatus(latest, t);
              const values = data.map(d => d.value).filter((n): n is number => n != null);
              const first = values[0], last = values[values.length - 1];
              const change = values.length >= 2 ? ((last - first) / Math.abs(first || 1)) * 100 : null;
              const improving = change == null ? null : t.direction === "lower_is_better" ? change < 0 : change > 0;
              const isNegativeMetric = t.direction === "lower_is_better";
              const lineColor = isNegativeMetric ? "#ef4444" : "#22d3ee";
              const gradId = `g-${t.kpi_key}`;
              return (
                <Card
                  key={t.id}
                  className="p-5 relative overflow-hidden group border-border/60"
                  style={{ background: "linear-gradient(180deg, hsl(220 30% 8%), hsl(220 25% 6%))" }}
                >
                  <div className="flex items-start justify-between mb-2 relative">
                    <div className="min-w-0">
                      <div className="text-[10px] text-muted-foreground/80 uppercase tracking-[0.18em] font-semibold">{t.label}</div>
                      <div className="text-[10px] text-muted-foreground/60 mt-0.5">Target: {t.target_display ?? "—"}</div>
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
                          <stop offset="0%" stopColor={lineColor} stopOpacity={isNegativeMetric ? 0.35 : 0.5} />
                          <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 15% 25%)" opacity={0.4} />
                      <XAxis dataKey="week" stroke="hsl(220 10% 55%)" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(220 10% 55%)" fontSize={10} tickLine={false} axisLine={false} width={44} />
                      <Tooltip
                        cursor={{ stroke: lineColor, strokeOpacity: 0.4, strokeWidth: 1 }}
                        contentStyle={{ background: "hsl(220 30% 10%)", border: "1px solid hsl(220 15% 25%)", borderRadius: 8, fontSize: 12 }}
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
                        activeDot={{ r: 4, fill: lineColor, stroke: "hsl(220 30% 8%)", strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
