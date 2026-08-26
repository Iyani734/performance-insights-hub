import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart, Bar, BarChart, Legend } from "recharts";
import { computeAutoKpisForRange, computeStatus, formatKpi, formatWeek, normalizeKpiTarget, normalizeKpiTargets, type KpiTarget, type KpiStatus } from "@/lib/kpi";
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
import { deltaPct } from "@/lib/summary";
import { formatDateOnly } from "@/lib/dateLabels";

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

type WorkingWeekBucket = {
  id: string;
  label: string;
  from: string;
  to: string;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function localDateFromIso(iso: string) {
  const [yearValue, monthValue, dayValue] = iso.split("-").map(Number);
  return new Date(
    Number.isFinite(yearValue) ? yearValue : new Date().getFullYear(),
    Number.isFinite(monthValue) ? monthValue - 1 : new Date().getMonth(),
    Number.isFinite(dayValue) ? dayValue : 1,
  );
}

function isoFromLocalDate(date: Date) {
  return isoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function addDaysLocal(iso: string, days: number) {
  const date = localDateFromIso(iso);
  date.setDate(date.getDate() + days);
  return isoFromLocalDate(date);
}

function workingWeekStartForDate(iso: string) {
  const date = localDateFromIso(iso);
  const day = date.getDay();
  if (day === 6) {
    date.setDate(date.getDate() + 2);
  } else if (day === 0) {
    date.setDate(date.getDate() + 1);
  } else if (day !== 1) {
    date.setDate(date.getDate() - (day - 1));
  }
  return isoFromLocalDate(date);
}

function firstFridayOnOrAfter(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const delta = day <= 5 ? 5 - day : 6;
  next.setDate(next.getDate() + delta);
  return next;
}

function workingWeekNumberForEnd(fridayIso: string) {
  const friday = localDateFromIso(fridayIso);
  const firstFriday = firstFridayOnOrAfter(new Date(friday.getFullYear(), friday.getMonth(), 1));
  const dayDiff = Math.round((friday.getTime() - firstFriday.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.floor(dayDiff / 7) + 1;
  return Math.max(1, weekNumber);
}

function workingWeekBucketFromIso(iso: string): WorkingWeekBucket {
  const from = workingWeekStartForDate(iso);
  const to = addDaysLocal(from, 4);
  const friday = localDateFromIso(to);
  const weekNumber = workingWeekNumberForEnd(to);
  const monthName = formatDateOnly(to, { month: "short" });

  return {
    id: `${friday.getFullYear()}-${pad2(friday.getMonth() + 1)}-work-week-${weekNumber}`,
    label: `${monthName} Week ${weekNumber}`,
    from,
    to,
  };
}

function buildWorkingWeekBuckets(dates: string[]) {
  const buckets = new Map<string, WorkingWeekBucket>();
  for (const date of dates) {
    if (!date) continue;
    const bucket = workingWeekBucketFromIso(date);
    buckets.set(bucket.id, bucket);
  }
  return Array.from(buckets.values()).sort((a, b) => a.from.localeCompare(b.from));
}

function selectBucketsForRange(buckets: WorkingWeekBucket[], range: DateRange) {
  if (range.preset === "all") return buckets;
  if (range.preset === "custom" && range.from && range.to) {
    return buckets.filter((bucket) => bucket.to >= range.from! && bucket.from <= range.to!);
  }
  const n = Number(range.preset);
  return Number.isFinite(n) ? buckets.slice(-n) : buckets;
}

function bucketRangeLabel(bucket: WorkingWeekBucket | undefined) {
  return bucket ? `${bucket.label} (${formatWeek(bucket.from)} - ${formatWeek(bucket.to)})` : "Selected week";
}

function formatHeatmapValue(actual: number | null | undefined, target: KpiTarget): string {
  const normalizedTarget = normalizeKpiTarget(target);
  if (actual == null || Number.isNaN(actual)) return "—";

  const value = Number(actual);
  if (normalizedTarget.unit === "%") return `${value.toFixed(1)}%`;
  if (Number.isInteger(value)) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function insightChangeSummary(target: KpiTarget, first: number, last: number) {
  const rawChange = last - first;
  const improving = target.direction === "lower_is_better" ? rawChange < 0 : rawChange > 0;

  if (target.unit === "%") {
    return {
      improving,
      meetsThreshold: Math.abs(rawChange) >= 5,
      text: `${Math.abs(rawChange).toFixed(1)} points`,
    };
  }

  const relativeChange = first !== 0 ? (rawChange / Math.abs(first)) * 100 : null;
  return {
    improving,
    meetsThreshold: relativeChange != null ? Math.abs(relativeChange) >= 5 : Math.abs(rawChange) > 0,
    text: relativeChange != null ? `${Math.abs(relativeChange).toFixed(1)}%` : `${Math.abs(rawChange).toFixed(1)}`,
  };
}

function selectedRangeBoundsForAnalytics(range: DateRange, buckets: WorkingWeekBucket[]) {
  if (range.preset === "custom" && range.from && range.to && range.from <= range.to) {
    return { from: range.from, to: range.to };
  }
  if (!buckets.length) return null;
  return { from: buckets[0].from, to: buckets[buckets.length - 1].to };
}

function buildTicketStatusSnapshots(rows: any[], uploads: any[]): TicketStatusRow[] {
  const snapshots = new Map<string, TicketStatusRow>();

  for (const upload of uploads) {
    snapshots.set(upload.id, {
      week_start: upload.week_start,
      active: 0,
      review: 0,
      finalEdit: 0,
      total: 0,
    });
  }

  for (const row of rows) {
    const snapshot = snapshots.get(row.upload_id);
    if (!snapshot) continue;
    snapshot.total += 1;

    const status = normalizeTicketStatus(row.status);
    if (status === "active") snapshot.active += 1;
    if (status === "review") snapshot.review += 1;
    if (status === "final edit") snapshot.finalEdit += 1;
  }

  return Array.from(snapshots.values())
    .filter((snapshot) => snapshot.total > 0)
    .sort((a, b) => a.week_start.localeCompare(b.week_start));
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
  const [compareWeekA, setCompareWeekA] = useState<string | null>(null);
  const [compareWeekB, setCompareWeekB] = useState<string | null>(null);
  const demoMode = useDemoMode();

  const targetsQ = useQuery({
    queryKey: ["kpi_targets", demoMode],
    queryFn: async () => demoMode ? DEMO_TARGETS : normalizeKpiTargets(((await supabase.from("kpi_targets").select("*").order("sort_order")).data ?? []) as KpiTarget[]),
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
        .select("id,kind,file_name,status,week_start,created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      const latestUploadByWeek = new Map<string, any>();
      for (const upload of (uploads ?? [])
        .filter((upload) => !isSeededDemoUpload(upload.file_name))
        .filter((upload) => upload.status !== "failed" && upload.status !== "processing")
        .filter(isActiveReviewFinalUpload)) {
        if (!latestUploadByWeek.has(upload.week_start)) {
          latestUploadByWeek.set(upload.week_start, upload);
        }
      }
      const weeklyUploads = Array.from(latestUploadByWeek.values()).slice(0, 104);
      if (weeklyUploads.length === 0) return [];
      const data = await fetchAllSupabaseRows<any>((from, to) =>
        supabase
          .from("tickets")
          .select("upload_id,week_start,status,raw")
          .in("upload_id", weeklyUploads.map((upload) => upload.id))
          .eq("kind", "tickets")
          .range(from, to),
      );
      return buildTicketStatusSnapshots(
        data.filter((row) => !isSeededDemoPayload(row.raw)),
        weeklyUploads,
      );
    },
  });

  const targets = targetsQ.data ?? [];
  const rows = valuesQ.data ?? [];
  const ticketStatusRows = ticketStatusQ.data ?? [];

  const workingWeekBuckets = useMemo(() => {
    return selectBucketsForRange(buildWorkingWeekBuckets(rows.map(r => r.week_start)), range);
  }, [rows, range]);
  const selectedRangeBounds = useMemo(
    () => selectedRangeBoundsForAnalytics(range, workingWeekBuckets),
    [range, workingWeekBuckets],
  );
  const selectedRangeAutoQ = useQuery({
    queryKey: ["analytics_auto_selected_range", selectedRangeBounds, demoMode],
    queryFn: () => {
      if (!selectedRangeBounds) return null;
      return demoMode
        ? demoAutoKpisForRange(selectedRangeBounds)
        : computeAutoKpisForRange(selectedRangeBounds.from, selectedRangeBounds.to);
    },
    enabled: !!selectedRangeBounds,
  });
  const weeks = useMemo(() => workingWeekBuckets.map((bucket) => bucket.id), [workingWeekBuckets]);
  const bucketById = useMemo(() => new Map(workingWeekBuckets.map((bucket) => [bucket.id, bucket])), [workingWeekBuckets]);

  const byKpi = useMemo(() => {
    const selectedBuckets = new Set(weeks);
    const latestByKpiAndBucket = new Map<string, Map<string, { actual: number | null; date: string }>>();
    for (const r of rows) {
      const bucket = workingWeekBucketFromIso(r.week_start);
      if (!selectedBuckets.has(bucket.id)) continue;
      if (!latestByKpiAndBucket.has(r.kpi_key)) latestByKpiAndBucket.set(r.kpi_key, new Map());
      const kpiBuckets = latestByKpiAndBucket.get(r.kpi_key)!;
      const existing = kpiBuckets.get(bucket.id);
      if (!existing || r.week_start >= existing.date) {
        kpiBuckets.set(bucket.id, { date: r.week_start, actual: r.actual != null ? Number(r.actual) : null });
      }
    }
    const m = new Map<string, Map<string, number | null>>();
    for (const [kpiKey, buckets] of latestByKpiAndBucket) {
      m.set(kpiKey, new Map(Array.from(buckets.entries()).map(([bucketId, value]) => [bucketId, value.actual])));
    }
    return m;
  }, [rows, weeks]);

  const statusChartData = useMemo(() => {
    const statusBuckets = selectBucketsForRange(buildWorkingWeekBuckets(ticketStatusRows.map((row) => row.week_start)), range);
    const selectedStatusBuckets = new Set(statusBuckets.map((bucket) => bucket.id));
    const latestByBucket = new Map<string, { date: string; row: TicketStatusRow }>();

    for (const row of ticketStatusRows) {
      const bucket = workingWeekBucketFromIso(row.week_start);
      if (!selectedStatusBuckets.has(bucket.id)) continue;
      const existing = latestByBucket.get(bucket.id);
      if (!existing || row.week_start >= existing.date) {
        latestByBucket.set(bucket.id, { date: row.week_start, row });
      }
    }

    return statusBuckets
      .map((bucket) => {
        const row = latestByBucket.get(bucket.id)?.row;
        return {
          week: bucket.label,
          period: bucketRangeLabel(bucket),
          active: row?.active ?? 0,
          review: row?.review ?? 0,
          finalEdit: row?.finalEdit ?? 0,
        };
      })
      .filter((row) => row.active > 0 || row.review > 0 || row.finalEdit > 0);
  }, [ticketStatusRows, range]);

  const compareOptions = useMemo(() => [...workingWeekBuckets].reverse(), [workingWeekBuckets]);
  const compareA = weeks.includes(compareWeekA ?? "") ? compareWeekA : weeks[weeks.length - 1] ?? null;
  const compareB = weeks.includes(compareWeekB ?? "") ? compareWeekB : weeks[weeks.length - 2] ?? null;

  function valueAtBucket(bucketId: string | null, key: string): number | null {
    if (!bucketId) return null;
    return byKpi.get(key)?.get(bucketId) ?? null;
  }

  const loading = targetsQ.isLoading || valuesQ.isLoading || ticketStatusQ.isLoading || selectedRangeAutoQ.isLoading;
  const empty = !loading && rows.length === 0 && ticketStatusRows.length === 0;
  const selectedRangeTicketQuality = selectedRangeAutoQ.data?.ticket_quality ?? null;

  // Insights
  const insights = useMemo(() => {
    const out: { kind: "improve" | "decline" | "streak"; text: string; status: KpiStatus }[] = [];
    for (const t of targets) {
      const points = weeks.map((week) => ({
        week,
        bucket: bucketById.get(week),
        value: byKpi.get(t.kpi_key)?.get(week) ?? null,
      }));
      const latestPoint = points[points.length - 1];
      if (latestPoint?.value == null) continue;
      const firstPoint = points.find((point) => point.value != null);
      if (!firstPoint || firstPoint.week === latestPoint.week || firstPoint.value == null) continue;
      const change = insightChangeSummary(t, firstPoint.value, latestPoint.value);
      const status = computeStatus(latestPoint.value, t);

      if (change.meetsThreshold) {
        out.push({
          kind: change.improving ? "improve" : "decline",
          status,
          text: `${t.label} ${change.improving ? "improved" : "declined"} ${change.text} from ${firstPoint.bucket?.label ?? "the first selected week"} to ${latestPoint.bucket?.label ?? "the latest selected week"} (now ${formatKpi(latestPoint.value, t)}).`,
        });
      }

      let streak = 0;
      for (let i = points.length - 1; i > 0; i--) {
        const current = points[i].value;
        const previous = points[i - 1].value;
        if (current == null || previous == null) break;
        const d = current - previous;
        const good = t.direction === "lower_is_better" ? d < 0 : d > 0;
        if (good) streak++; else break;
      }
      if (streak >= 3) out.push({ kind: "streak", status, text: `${t.label} improving ${streak} weeks in a row through ${latestPoint.bucket?.label ?? "the latest selected week"}.` });
    }
    return out.slice(0, 6);
  }, [targets, byKpi, weeks, bucketById]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Operations Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Per-KPI trends, heatmap and smart insights grouped into Monday-Friday working weeks, for example Aug Week 1 through Aug Week 4.</p>
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

          {/* Compare working weeks */}
          {compareOptions.length > 0 && targets.length > 0 && (
            <Card>
              <div className="px-6 py-4 border-b flex flex-wrap items-center gap-3">
                <div className="mr-auto">
                  <h2 className="font-display text-lg font-semibold">Compare working weeks</h2>
                  <p className="text-xs text-muted-foreground">Compare two Monday-Friday reporting weeks from the selected analytics range.</p>
                </div>
                <Select value={compareA ?? ""} onValueChange={setCompareWeekA}>
                  <SelectTrigger className="w-[220px]"><SelectValue placeholder="Current week" /></SelectTrigger>
                  <SelectContent>
                    {compareOptions.map((bucket) => (
                      <SelectItem key={bucket.id} value={bucket.id}>{bucketRangeLabel(bucket)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground text-sm">vs.</span>
                <Select value={compareB ?? ""} onValueChange={setCompareWeekB}>
                  <SelectTrigger className="w-[220px]"><SelectValue placeholder="Compare with" /></SelectTrigger>
                  <SelectContent>
                    {compareOptions.map((bucket) => (
                      <SelectItem key={bucket.id} value={bucket.id}>{bucketRangeLabel(bucket)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-6 py-3 font-medium">KPI</th>
                      <th className="text-left px-6 py-3 font-medium">{compareA ? bucketById.get(compareA)?.label ?? "Current week" : "Current week"}</th>
                      <th className="text-left px-6 py-3 font-medium">{compareB ? bucketById.get(compareB)?.label ?? "Compare week" : "Compare week"}</th>
                      <th className="text-left px-6 py-3 font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targets.map((t) => {
                      const a = valueAtBucket(compareA, t.kpi_key);
                      const b = valueAtBucket(compareB, t.kpi_key);
                      const d = deltaPct(a, b);
                      const better = d == null ? null : t.direction === "lower_is_better" ? d < 0 : d > 0;
                      const Icon = d == null ? Minus : better ? TrendingUp : TrendingDown;
                      return (
                        <tr key={t.id} className="border-t">
                          <td className="px-6 py-3 font-medium">{t.label}</td>
                          <td className="px-6 py-3">
                            <span className="inline-flex items-center gap-2">
                              {formatKpi(a, t)}
                              <StatusPill status={computeStatus(a, t)} />
                            </span>
                          </td>
                          <td className="px-6 py-3 text-muted-foreground">{formatKpi(b, t)}</td>
                          <td className={cn("px-6 py-3", d == null ? "text-muted-foreground" : better ? "text-success" : "text-destructive")}>
                            <span className="inline-flex items-center gap-1">
                              <Icon className="w-3 h-3" />
                              {d == null ? "—" : `${Math.abs(d).toFixed(1)}%`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
                  <p className="text-xs text-muted-foreground">Weekly Active/Review/Final uploads: A = Active, E/R = Review, and F = Final Edit.</p>
                </div>
                <div className="text-xs text-muted-foreground">Grouped by Monday-Friday week</div>
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
                <p className="text-xs text-muted-foreground">Status of every KPI grouped into Monday-Friday weeks, not raw upload dates</p>
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
                        {bucketById.get(w)?.label ?? w}
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
                        const displayValue = formatHeatmapValue(v, t);
                        return (
                          <td key={w} className="px-1 py-1">
                            <div
                              title={`${t.label} · ${bucketRangeLabel(bucketById.get(w))}: ${displayValue}`}
                              className={cn(
                                "h-8 rounded-sm flex items-center justify-center text-[10px] font-medium text-white/95",
                                s === "none" ? "bg-muted/40 text-muted-foreground" : statusBg(s)
                              )}
                            >
                              {displayValue}
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
              const data = weeks.map(w => ({ week: bucketById.get(w)?.label ?? w, period: bucketRangeLabel(bucketById.get(w)), value: byKpi.get(t.kpi_key)?.get(w) ?? null }));
              const latestWeekly = [...data].reverse().find(d => d.value != null)?.value ?? null;
              const latest = t.kpi_key === "ticket_quality" && selectedRangeTicketQuality != null
                ? selectedRangeTicketQuality
                : latestWeekly;
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
