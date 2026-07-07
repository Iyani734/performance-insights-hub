import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { computeStatus, formatKpi, formatWeek, type KpiTarget } from "@/lib/kpi";
import { StatusPill } from "@/components/StatusPill";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { downloadXlsx } from "@/lib/parse";

export const Route = createFileRoute("/_authenticated/history")({ component: HistoryPage });

function HistoryPage() {
  const targetsQ = useQuery({
    queryKey: ["kpi_targets"],
    queryFn: async () => ((await supabase.from("kpi_targets").select("*").order("sort_order")).data ?? []) as KpiTarget[],
  });

  const valuesQ = useQuery({
    queryKey: ["kpi_values_all"],
    queryFn: async () => ((await supabase.from("kpi_values").select("*").order("week_start", { ascending: false })).data ?? []),
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

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Historical Performance</h1>
          <p className="text-sm text-muted-foreground mt-1">Week-over-week KPI comparison across all uploads.</p>
        </div>
        <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-2" />Export</Button>
      </header>

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
                  <td className="px-6 py-3 font-medium">{formatWeek(w)}</td>
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
    </div>
  );
}
