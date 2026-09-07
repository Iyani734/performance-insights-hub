import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeAutoKpisForRange, computeStatus, formatKpi, formatWeek, normalizeKpiTargets, type KpiStatus, type KpiTarget } from "@/lib/kpi";
import { buildRows, overallScore, deltaPct, isImproving, commentary, focusAreas } from "@/lib/summary";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/StatusPill";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ticket, CheckCircle2, AlertTriangle, ArrowUp, ArrowDown, Minus, Mail, TrendingUp, Pencil, Eye, Lock, Trash2, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { canEdit, useAuth } from "@/lib/useAuth";
import { useDemoMode } from "@/lib/demoMode";
import { isSeededDemoEmail, isSeededDemoNote, isSeededDemoSource, isSeededDemoUpload } from "@/lib/liveData";
import { isQueuedTestEmail } from "@/lib/emailJobs";
import { deleteManagerNote, updateManagerNote } from "@/lib/notesServer";
import { reportKindLabel } from "@/lib/reportTypes";
import { fetchLatestOpenJobsRows } from "@/lib/openJobsData";
import { openJobCustomerKey } from "@/lib/openJobs";
import { fetchAllSupabaseRows } from "@/lib/supabasePagination";
import {
  DEMO_TARGETS,
  demoAutoKpisForRange,
  demoEmailStats,
  demoKpiValuesWithLocal,
  demoNotes,
  demoUploadsWithLocal,
  previousDateRange,
  type DateRangeValue,
} from "@/lib/demoData";
import { workingWeekRangeForDate } from "@/lib/workingWeeks";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

const DASHBOARD_RANGE_STORAGE_KEY = "arc-dashboard-date-range";
const CARD_WEEK_LIMIT = 2;
const MAX_WEEK_DETAIL_FETCH = 26;
const TREND_MONTH_WEEK_LIMIT = 4;
const MANUAL_TREND_COLORS = [
  "oklch(0.62 0.13 190)",
  "oklch(0.58 0.19 260)",
  "oklch(0.63 0.2 315)",
  "oklch(0.68 0.18 145)",
  "oklch(0.67 0.2 55)",
  "oklch(0.57 0.2 25)",
];
const PERCENT_TREND_KEYS = ["review_to_final_edit", "dispatch_responsiveness"];
const NUMBER_TREND_KEYS = ["invoice_cycle_time", "ticket_quality", "driver_safety", "incomplete_tickets", "missed_jobs"];
const TOTAL_DISPLAY_KPI_KEYS = ["driver_safety", "incomplete_tickets", "missed_jobs"];

type WeekRangeOption = { from: string; to: string; label: string };
type MetricWeekPoint = WeekRangeOption & { actual: number | null; status: KpiStatus };
type TrendRow = { week: string; period: string } & Record<string, string | number | null>;
type DashboardRangeMode = "rolling" | "custom";
type DashboardRangeState = { range: DateRangeValue; mode: DashboardRangeMode };

async function fetchValuesForRange(range: DateRangeValue) {
  const { data } = await supabase
    .from("kpi_values")
    .select("*")
    .gte("week_start", addDaysLocal(range.from, -2))
    .lte("week_start", range.to)
    .order("week_start");
  return (data ?? []).filter((row) => !isSeededDemoSource(row.source));
}

function periodLabel(range: DateRangeValue) {
  return `${formatWeek(range.from)} - ${formatWeek(range.to)}`;
}

function loadDashboardRange() {
  const fallback = workingWeekRangeForDate();
  if (typeof window === "undefined")
    return { range: fallback, mode: "rolling" } satisfies DashboardRangeState;

  try {
    const stored = window.localStorage.getItem(DASHBOARD_RANGE_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    if (
      parsed &&
      parsed.mode === "custom" &&
      parsed.range &&
      typeof parsed.range.from === "string" &&
      typeof parsed.range.to === "string" &&
      parsed.range.from <= parsed.range.to
    ) {
      return {
        range: parsed.range as DateRangeValue,
        mode: "custom",
      } satisfies DashboardRangeState;
    }
  } catch {
    // Fall through to the rolling default.
  }

  // Earlier versions saved a bare range forever. Treat it as the old automatic
  // choice so a stale date range cannot hide current timeless uploads after logout.
  return { range: fallback, mode: "rolling" } satisfies DashboardRangeState;
}

function saveDashboardRange(state: DashboardRangeState) {
  const { range } = state;
  if (typeof window === "undefined" || !range.from || !range.to || range.from > range.to) return;
  window.localStorage.setItem(DASHBOARD_RANGE_STORAGE_KEY, JSON.stringify(state));
}

function latestValuesMap(rows: any[]) {
  const map: Record<string, number | null> = {};
  const latestByKey = new Map<string, { weekStart: string; actual: number | null }>();
  for (const v of rows) {
    if (v.source === "auto") continue;
    if (!v.kpi_key || !v.week_start) continue;
    const actual = v.actual == null ? null : Number(v.actual);
    if (!Number.isFinite(actual)) continue;
    const weekStart = manualWeekStartForDate(String(v.week_start));
    const existing = latestByKey.get(v.kpi_key);
    if (!existing || weekStart >= existing.weekStart) {
      latestByKey.set(v.kpi_key, { weekStart, actual });
    }
  }
  for (const [kpiKey, value] of latestByKey) {
    map[kpiKey] = value.actual;
  }
  return map;
}

function manualRowsForKpi(rows: any[], kpiKey: string) {
  return rows
    .filter((row) => row.kpi_key === kpiKey && row.source !== "auto")
    .sort((a, b) => String(a.week_start).localeCompare(String(b.week_start)));
}

type ManualPeriodOption = WeekRangeOption;

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function localDateFromIso(iso: string) {
  const [yearValue, monthValue, dayValue] = iso.split("-").map(Number);
  const year = Number.isFinite(yearValue) ? yearValue : new Date().getFullYear();
  const month = Number.isFinite(monthValue) ? monthValue : new Date().getMonth() + 1;
  const day = Number.isFinite(dayValue) ? dayValue : 1;
  return new Date(year, month - 1, day);
}

function isoFromLocalDate(date: Date) {
  return isoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function addDaysLocal(iso: string, days: number) {
  const date = localDateFromIso(iso);
  date.setDate(date.getDate() + days);
  return isoFromLocalDate(date);
}

function monthKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function monthKeyFromIso(iso: string) {
  return /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : monthKeyFromDate(new Date());
}

function dateOnlyLocal(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function manualWeekStartForDate(iso: string) {
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

function manualWeekOptionFromStart(monday: string): ManualPeriodOption {
  const to = addDaysLocal(monday, 4);
  return { from: monday, to, label: `${formatWeek(monday)} - ${formatWeek(to)}` };
}

function firstMondayOnOrAfter(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const delta = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  next.setDate(next.getDate() + delta);
  return next;
}

function firstFridayOnOrAfter(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const delta = day <= 5 ? 5 - day : 6;
  next.setDate(next.getDate() + delta);
  return next;
}

function businessWeekRangesForRange(range: DateRangeValue): WeekRangeOption[] {
  if (!range.from || !range.to || range.from > range.to) return [];
  let cursor = manualWeekStartForDate(range.from);
  const ranges: WeekRangeOption[] = [];
  let guard = 0;

  while (cursor <= range.to && guard < 370) {
    const week = manualWeekOptionFromStart(cursor);
    if (week.to >= range.from && week.from <= range.to) {
      ranges.push(week);
    }
    cursor = addDaysLocal(cursor, 7);
    guard += 1;
  }

  return ranges;
}

function trendMonthWeekOptions(monthKey: string): WeekRangeOption[] {
  const [yearValue, monthValue] = monthKey.split("-").map(Number);
  const year = Number.isFinite(yearValue) ? yearValue : new Date().getFullYear();
  const month = Number.isFinite(monthValue) ? monthValue : new Date().getMonth() + 1;
  const monthIndex = month - 1;
  const options: WeekRangeOption[] = [];
  let friday = firstFridayOnOrAfter(new Date(year, monthIndex, 1));
  let guard = 0;

  while (options.length < TREND_MONTH_WEEK_LIMIT && guard < 8) {
    if (friday.getMonth() === monthIndex) {
      const monday = new Date(friday);
      monday.setDate(friday.getDate() - 4);
      const from = isoFromLocalDate(monday);
      const to = isoFromLocalDate(friday);
      options.push({ from, to, label: `Week ${options.length + 1}` });
    }
    friday = new Date(friday);
    friday.setDate(friday.getDate() + 7);
    guard += 1;
  }

  return options;
}

function monthDisplayLabel(monthKey: string) {
  const [yearValue, monthValue] = monthKey.split("-").map(Number);
  const year = Number.isFinite(yearValue) ? yearValue : new Date().getFullYear();
  const month = Number.isFinite(monthValue) ? monthValue : new Date().getMonth() + 1;
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function manualPeriodOptionsForMonth(monthKey: string): ManualPeriodOption[] {
  const [yearValue, monthValue] = monthKey.split("-").map(Number);
  const year = Number.isFinite(yearValue) ? yearValue : new Date().getFullYear();
  const month = Number.isFinite(monthValue) ? monthValue : new Date().getMonth() + 1;
  const options: ManualPeriodOption[] = [];
  const firstDay = new Date(year, month - 1, 1);
  let cursor = firstMondayOnOrAfter(firstDay);

  while (cursor.getMonth() === month - 1) {
    options.push(manualWeekOptionFromStart(isoFromLocalDate(cursor)));
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
  }

  return options;
}

function currentManualPeriodStart(date = new Date()) {
  const today = dateOnlyLocal(date);
  const options = manualPeriodOptionsForMonth(monthKeyFromDate(date));
  return options.find((option) => today >= option.from && today <= option.to)?.from ?? manualWeekStartForDate(today);
}

function manualPeriodForStart(weekStart: string) {
  const normalizedStart = manualWeekStartForDate(weekStart);
  return (
    manualPeriodOptionsForMonth(monthKeyFromIso(normalizedStart)).find((option) => option.from === normalizedStart) ??
    manualWeekOptionFromStart(normalizedStart)
  );
}

function numericOrNull(value: unknown) {
  if (value == null) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizedEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function effectiveEmailJobStatus(job: any): "sent" | "pending" | "failed" {
  if (job?.status === "sent" || job?.sent_at) return "sent";
  if (job?.status === "pending") {
    const createdAt = new Date(job.created_at).getTime();
    if (Number.isFinite(createdAt) && Date.now() - createdAt > 30_000) return "failed";
    return "pending";
  }
  return job?.status === "failed" ? "failed" : "failed";
}

function isEmailJobForCurrentRecipient(job: any, customer: any | null) {
  if (!customer?.id) return false;
  const currentEmail = normalizedEmail(customer.email);
  if (!currentEmail) return false;
  return job?.customer_id === customer.id && normalizedEmail(job?.customer_email) === currentEmail;
}

function autoMetricValue(auto: any, kpiKey: string) {
  if (!auto) return null;
  if (kpiKey === "quality_issues") return numericOrNull(auto.totals?.quality_issues);
  return numericOrNull(auto[kpiKey]);
}

function buildMetricWeekSeries(
  target: KpiTarget,
  weeks: WeekRangeOption[],
  weeklyAutoRows: { from: string; data: any }[],
  manualRows: any[],
): MetricWeekPoint[] {
  const autoByWeek = new Map(weeklyAutoRows.map((row) => [row.from, row.data]));
  const manualByWeek = new Map<string, { actual: number | null; sourceWeekStart: string }>();

  for (const row of manualRows) {
    if (row.kpi_key !== target.kpi_key || row.source === "auto" || !row.week_start) continue;
    const weekStart = manualWeekStartForDate(String(row.week_start));
    const actual = numericOrNull(row.actual);
    const existing = manualByWeek.get(weekStart);
    if (!existing || String(row.week_start) >= existing.sourceWeekStart) {
      manualByWeek.set(weekStart, { actual, sourceWeekStart: String(row.week_start) });
    }
  }

  return weeks.map((week) => {
    const actual = target.auto
      ? autoMetricValue(autoByWeek.get(week.from), target.kpi_key)
      : manualByWeek.get(week.from)?.actual ?? null;
    return { ...week, actual, status: computeStatus(actual, target) };
  });
}

function latestValuesFromSeries(targets: KpiTarget[], seriesByKey: Map<string, MetricWeekPoint[]>) {
  const map: Record<string, number | null> = {};
  for (const target of targets) {
    const latest = [...(seriesByKey.get(target.kpi_key) ?? [])]
      .reverse()
      .find((point) => point.actual != null);
    map[target.kpi_key] = latest?.actual ?? null;
  }
  return map;
}

function sumMetricActuals(points: MetricWeekPoint[]) {
  let total = 0;
  let hasValue = false;
  for (const point of points) {
    if (point.actual == null || !Number.isFinite(Number(point.actual))) continue;
    total += Number(point.actual);
    hasValue = true;
  }
  return hasValue ? total : null;
}

function sumManualMetricRowsForWeeks(rows: any[], kpiKey: string, weeks: WeekRangeOption[]) {
  const selectedWeeks = new Set(weeks.map((week) => week.from));
  const latestByWeek = new Map<string, { actual: number | null; sourceWeekStart: string }>();

  for (const row of rows) {
    if (row.kpi_key !== kpiKey || row.source === "auto" || !row.week_start) continue;
    const weekStart = manualWeekStartForDate(String(row.week_start));
    if (!selectedWeeks.has(weekStart)) continue;
    const actual = numericOrNull(row.actual);
    const existing = latestByWeek.get(weekStart);
    if (!existing || String(row.week_start) >= existing.sourceWeekStart) {
      latestByWeek.set(weekStart, { actual, sourceWeekStart: String(row.week_start) });
    }
  }

  let total = 0;
  let hasValue = false;
  for (const item of latestByWeek.values()) {
    if (item.actual == null) continue;
    total += item.actual;
    hasValue = true;
  }
  return hasValue ? total : null;
}

function applyRangeScopedAutoValues(map: Record<string, number | null>, auto: any) {
  const ticketQuality = autoMetricValue(auto, "ticket_quality");
  if (ticketQuality == null) return map;
  return { ...map, ticket_quality: ticketQuality };
}

function statusDotClass(status: KpiStatus) {
  if (status === "green") return "bg-success";
  if (status === "yellow") return "bg-warning";
  if (status === "red") return "bg-destructive";
  return "bg-muted-foreground/30";
}

function ManualTrendTooltip({ active, payload, targets }: any & { targets: KpiTarget[] }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((item: any) => item.value != null);
  if (!rows.length) return null;
  const period = payload[0]?.payload?.period ?? payload[0]?.payload?.week ?? "";

  return (
    <div className="max-w-[300px] rounded-lg border bg-popover/95 p-2.5 text-xs shadow-lg backdrop-blur">
      <div className="mb-2 truncate font-medium text-foreground" title={period}>
        {period}
      </div>
      <div className="space-y-1">
        {rows.map((item: any) => {
          const target = targets.find((trendTarget) => trendTarget.label === item.name);
          const numberValue = Number(item.value);
          const displayValue =
            target && Number.isFinite(numberValue) ? formatKpi(numberValue, target) : item.value;

          return (
            <div key={item.name} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate" title={item.name}>
                  {item.name}
                </span>
              </span>
              <span className="shrink-0 font-semibold text-foreground">{displayValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Dashboard() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const auth = useAuth();
  const { user, isSuperAdmin, isAdmin } = auth;
  const demoMode = useDemoMode();
  const canEditDashboard = demoMode || canEdit(auth, "dashboard");
  const canOverrideManualKpis = isAdmin || isSuperAdmin;
  const [dashboardRangeState, setDashboardRangeState] = useState<DashboardRangeState>(
    loadDashboardRange,
  );
  const range = dashboardRangeState.range;
  const [trendMonth, setTrendMonth] = useState(() => monthKeyFromIso(range.from));
  const trendMonthInputRef = useRef<HTMLInputElement | null>(null);
  const validRange = !!range.from && !!range.to && range.from <= range.to;
  const prevRange = useMemo(() => previousDateRange(range), [range]);
  const dashboardWeekRanges = useMemo(() => businessWeekRangesForRange(range), [range]);
  const fetchedWeekRanges = useMemo(() => dashboardWeekRanges.slice(0, MAX_WEEK_DETAIL_FETCH), [dashboardWeekRanges]);
  const trendMonthWeeks = useMemo(() => trendMonthWeekOptions(trendMonth), [trendMonth]);
  const trendMonthRange = useMemo(
    () =>
      trendMonthWeeks.length
        ? { from: trendMonthWeeks[0].from, to: trendMonthWeeks[trendMonthWeeks.length - 1].to }
        : null,
    [trendMonthWeeks],
  );
  const weekRangeLimited = dashboardWeekRanges.length > fetchedWeekRanges.length;

  useEffect(() => {
    saveDashboardRange(dashboardRangeState);
  }, [dashboardRangeState]);

  function setCustomDashboardRange(boundary: "from" | "to", value: string) {
    setDashboardRangeState((current) => ({
      mode: "custom",
      range: { ...current.range, [boundary]: value },
    }));
  }

  function openTrendMonthPicker() {
    const input = trendMonthInputRef.current;
    if (!input) return;
    input.focus();

    try {
      (input as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      // Some browsers only allow showPicker from very specific pointer events.
      // Focusing still lets keyboard users and unsupported browsers change the month.
    }
  }

  const targetsQ = useQuery({
    queryKey: ["kpi_targets", demoMode],
    queryFn: async () => demoMode ? DEMO_TARGETS : normalizeKpiTargets(((await supabase.from("kpi_targets").select("*").order("sort_order")).data ?? []) as KpiTarget[]),
  });

  const autoQ = useQuery({
    queryKey: ["auto_kpi_range", range, demoMode],
    queryFn: () => demoMode ? demoAutoKpisForRange(range) : computeAutoKpisForRange(range.from, range.to),
    enabled: validRange,
  });
  const autoPrevQ = useQuery({
    queryKey: ["auto_kpi_range", prevRange, demoMode],
    queryFn: () => demoMode ? demoAutoKpisForRange(prevRange) : computeAutoKpisForRange(prevRange.from, prevRange.to),
    enabled: validRange,
  });

  const weeklyAutoQ = useQuery({
    queryKey: ["weekly_auto_kpi_range", fetchedWeekRanges, demoMode],
    queryFn: async () => Promise.all(
      fetchedWeekRanges.map(async (week) => ({
        from: week.from,
        to: week.to,
        data: demoMode
          ? await demoAutoKpisForRange({ from: week.from, to: week.to })
          : await computeAutoKpisForRange(week.from, week.to),
      })),
    ),
    enabled: validRange && fetchedWeekRanges.length > 0,
  });

  const valuesQ = useQuery({
    queryKey: ["kpi_values_range", range, demoMode],
    queryFn: () => demoMode
      ? Promise.resolve(demoKpiValuesWithLocal().filter((v: any) => v.week_start >= addDaysLocal(range.from, -2) && v.week_start <= range.to))
      : fetchValuesForRange(range),
    enabled: validRange,
  });

  const prevValuesQ = useQuery({
    queryKey: ["kpi_values_range", prevRange, demoMode],
    queryFn: () => demoMode
      ? Promise.resolve(demoKpiValuesWithLocal().filter((v: any) => v.week_start >= addDaysLocal(prevRange.from, -2) && v.week_start <= prevRange.to))
      : fetchValuesForRange(prevRange),
    enabled: validRange,
  });

  const trendAutoQ = useQuery({
    queryKey: ["kpi_trends_month_auto", trendMonth, demoMode],
    queryFn: async () => Promise.all(
      trendMonthWeeks.map(async (week) => ({
        ...week,
        data: demoMode
          ? await demoAutoKpisForRange({ from: week.from, to: week.to })
          : await computeAutoKpisForRange(week.from, week.to),
      })),
    ),
    enabled: trendMonthWeeks.length > 0,
  });

  const trendValuesQ = useQuery({
    queryKey: ["kpi_trends_month_values", trendMonth, demoMode],
    queryFn: () => {
      if (!trendMonthRange) return Promise.resolve([]);
      return demoMode
        ? Promise.resolve(
            demoKpiValuesWithLocal().filter(
              (value: any) =>
                value.week_start >= addDaysLocal(trendMonthRange.from, -2) &&
                value.week_start <= trendMonthRange.to,
            ),
          )
        : fetchValuesForRange(trendMonthRange);
    },
    enabled: !!trendMonthRange,
  });

  const emailStatsQ = useQuery({
    queryKey: ["email_stats_current_open_jobs", demoMode],
    queryFn: async () => {
      if (demoMode) {
        const demo = demoEmailStats();
        return {
          ready: demo.ready,
          sent: demo.sent,
          failed: (demo.failed ?? 0) + (demo.pending ?? 0),
        };
      }

      const { upload, rows: openJobs } = await fetchLatestOpenJobsRows();
      if (!upload || openJobs.length === 0) return { ready: 0, sent: 0, failed: 0 };

      const customerKeys = Array.from(
        new Set(openJobs.map((job: any) => openJobCustomerKey(job)).filter(Boolean)),
      );
      if (customerKeys.length === 0) return { ready: 0, sent: 0, failed: 0 };

      const customers = await fetchAllSupabaseRows<any>((from, to) =>
        supabase
          .from("customers")
          .select("id,key,email,enabled")
          .in("key", customerKeys)
          .range(from, to),
      );
      const customerByKey = new Map(
        customers
          .filter((customer) => !isSeededDemoEmail(customer.email))
          .map((customer) => [customer.key, customer]),
      );

      const weekStart = upload.week_start ?? null;
      const uploadedAt = upload.created_at ?? null;
      if (!weekStart) return { ready: 0, sent: 0, failed: 0 };

      const emailJobs = await fetchAllSupabaseRows<any>((from, to) => {
        let query = supabase
          .from("email_jobs")
          .select("*")
          .eq("week_start", weekStart)
          .order("created_at", { ascending: false })
          .range(from, to);
        if (uploadedAt) query = query.gte("created_at", uploadedAt);
        return query;
      });
      const cleanEmailJobs = emailJobs.filter(
        (row) => !isSeededDemoEmail(row.customer_email) && !isQueuedTestEmail(row),
      );

      let ready = 0;
      let sent = 0;
      let failed = 0;

      for (const key of customerKeys) {
        const customer = customerByKey.get(key) ?? null;
        if (!customer?.enabled || !customer.email) continue;
        ready++;
        const history = cleanEmailJobs.filter((job) => isEmailJobForCurrentRecipient(job, customer));
        const sentJob = history.find((job) => effectiveEmailJobStatus(job) === "sent");
        if (sentJob) {
          sent++;
          continue;
        }
        const latest = history[0];
        if (latest && effectiveEmailJobStatus(latest) === "failed") failed++;
      }

      return { ready, sent, failed };
    },
    refetchInterval: 15_000,
  });

  const lastUploadQ = useQuery({
    queryKey: ["last_upload", demoMode],
    queryFn: async () => {
      if (demoMode) return demoUploadsWithLocal()[0];
      const { data } = await supabase.from("report_uploads").select("created_at,kind,file_name,week_start").order("created_at", { ascending: false }).limit(50);
      return (data ?? []).find((row) => !isSeededDemoUpload(row.file_name));
    },
  });

  const notesQ = useQuery({
    queryKey: ["kpi_notes", range, demoMode],
    queryFn: async () => {
      if (demoMode) return demoNotes(range.from);
      const { data } = await supabase.from("kpi_notes").select("*").gte("week_start", range.from).lte("week_start", range.to).order("created_at", { ascending: false });
      return (data ?? []).filter((row) => !isSeededDemoNote(row.author_name));
    },
    enabled: validRange,
  });

  const targets = targetsQ.data ?? [];

  const metricSeriesByKey = useMemo(() => {
    const series = new Map<string, MetricWeekPoint[]>();
    for (const target of targets) {
      series.set(
        target.kpi_key,
        buildMetricWeekSeries(target, fetchedWeekRanges, weeklyAutoQ.data ?? [], valuesQ.data ?? []),
      );
    }
    return series;
  }, [targets, fetchedWeekRanges, weeklyAutoQ.data, valuesQ.data]);

  const currentMap = useMemo(() => {
    const map = latestValuesFromSeries(targets, metricSeriesByKey);
    for (const kpiKey of TOTAL_DISPLAY_KPI_KEYS) {
      const monthlyTotal = sumMetricActuals(metricSeriesByKey.get(kpiKey) ?? []);
      if (monthlyTotal != null) map[kpiKey] = monthlyTotal;
    }
    return applyRangeScopedAutoValues(map, autoQ.data);
  }, [targets, metricSeriesByKey, autoQ.data]);

  const prevMap = useMemo(() => {
    const auto: any = autoPrevQ.data ?? {};
    const map: Record<string, number | null> = {
      review_to_final_edit: auto.review_to_final_edit ?? null,
      ticket_quality: auto.ticket_quality ?? null,
      invoice_cycle_time: auto.invoice_cycle_time ?? null,
      dispatch_completion: auto.dispatch_completion ?? null,
      quality_issues: auto.totals?.quality_issues ?? null,
    };
    Object.assign(map, latestValuesMap(prevValuesQ.data ?? []));
    for (const kpiKey of TOTAL_DISPLAY_KPI_KEYS) {
      const prevTotal = sumManualMetricRowsForWeeks(
        prevValuesQ.data ?? [],
        kpiKey,
        businessWeekRangesForRange(prevRange).slice(0, MAX_WEEK_DETAIL_FETCH),
      );
      if (prevTotal != null) map[kpiKey] = prevTotal;
    }
    return applyRangeScopedAutoValues(map, autoPrevQ.data);
  }, [autoPrevQ.data, prevRange, prevValuesQ.data]);

  const rows = useMemo(() => buildRows(targets, currentMap, prevMap), [targets, currentMap, prevMap]);
  const summary = useMemo(() => overallScore(rows), [rows]);
  const focus = useMemo(() => focusAreas(rows), [rows]);
  const trendRows = useMemo(
    () => combinedTrendChart(trendMonthWeeks, trendAutoQ.data ?? [], trendValuesQ.data ?? [], targets),
    [trendMonthWeeks, trendAutoQ.data, trendValuesQ.data, targets],
  );
  const percentageTrendTargets = useMemo(
    () => orderedTrendTargets(targets, PERCENT_TREND_KEYS),
    [targets],
  );
  const numberTrendTargets = useMemo(
    () => orderedTrendTargets(targets, NUMBER_TREND_KEYS),
    [targets],
  );
  const visiblePercentageTrendTargets = useMemo(
    () => visibleTrendTargets(percentageTrendTargets, trendRows),
    [percentageTrendTargets, trendRows],
  );
  const visibleNumberTrendTargets = useMemo(
    () => visibleTrendTargets(numberTrendTargets, trendRows),
    [numberTrendTargets, trendRows],
  );
  const percentageTrendHasData = visiblePercentageTrendTargets.length > 0;
  const numberTrendHasData = visibleNumberTrendTargets.length > 0;

  const totals = autoQ.data?.totals ?? { tickets: 0, invoiced: 0, quality_issues: 0, quality_total_tickets: 0, qc_tickets: 0, qc_review_tickets: 0, qc_final_tickets: 0, cycle_time_rows: 0, voided: 0, active_tickets: 0, review_tickets: 0, final_edit_tickets: 0 };
  const noData = !validRange || (totals.tickets === 0 && totals.qc_tickets === 0 && totals.cycle_time_rows === 0 && totals.invoiced === 0 && totals.quality_issues === 0 && totals.quality_total_tickets === 0);
  const [editingKpi, setEditingKpi] = useState<KpiTarget | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingWeek, setEditingWeek] = useState("");
  const [manualMonth, setManualMonth] = useState(monthKeyFromDate(new Date()));
  const [manualDetailKpi, setManualDetailKpi] = useState<KpiTarget | null>(null);
  const [metricDetailKpi, setMetricDetailKpi] = useState<KpiTarget | null>(null);
  const currentManualWeek = currentManualPeriodStart();
  const activeEditingWeek = editingWeek || currentManualWeek;
  const manualPeriodOptions = useMemo(() => manualPeriodOptionsForMonth(manualMonth), [manualMonth]);
  const activeEditingPeriod = manualPeriodForStart(activeEditingWeek);
  const editingWeeklyRows = useMemo(
    () => (editingKpi ? manualRowsForKpi(valuesQ.data ?? [], editingKpi.kpi_key) : []),
    [editingKpi, valuesQ.data],
  );
  const editingWeekRow = editingWeeklyRows.find((row) => manualWeekStartForDate(String(row.week_start)) === activeEditingWeek);
  const detailWeeklyRows = useMemo(
    () => (manualDetailKpi ? manualRowsForKpi(valuesQ.data ?? [], manualDetailKpi.kpi_key) : []),
    [manualDetailKpi, valuesQ.data],
  );
  const metricDetailSeries = metricDetailKpi ? metricSeriesByKey.get(metricDetailKpi.kpi_key) ?? [] : [];

  const saveManual = useMutation({
    mutationFn: async () => {
      if (!editingKpi || !user) return;
      if (!canEditDashboard) throw new Error("You do not have edit access for manual metrics.");
      if (!activeEditingWeek) throw new Error("Select a week range.");
      const val = editValue === "" ? null : Number(editValue);
      if (!Number.isFinite(val as number) && val !== null) throw new Error("Enter a valid number.");
      const { data: existingRows, error: existingError } = await supabase
        .from("kpi_values")
        .select("id,week_start")
        .eq("kpi_key", editingKpi.kpi_key)
        .gte("week_start", addDaysLocal(activeEditingWeek, -2))
        .lte("week_start", activeEditingWeek);
      if (existingError) throw existingError;
      const existing = (existingRows ?? []).find((row) => manualWeekStartForDate(String(row.week_start)) === activeEditingWeek);
      if (existing && !canOverrideManualKpis) {
        throw new Error("This metric is already entered for this range. An admin can edit the locked value, or you can delete the value from Range detail.");
      }
      const payload = { kpi_key: editingKpi.kpi_key, week_start: activeEditingWeek, actual: val, source: "manual", entered_by: user.id };
      const { error } = existing
        ? await supabase.from("kpi_values").update(payload).eq("id", existing.id)
        : await supabase.from("kpi_values").upsert(payload, { onConflict: "kpi_key,week_start" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); setEditingKpi(null); setEditingWeek(""); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteManual = useMutation({
    mutationFn: async (rowId: string) => {
      if (!canEditDashboard) throw new Error("You do not have edit access for manual metrics.");
      const { error } = await supabase
        .from("kpi_values")
        .delete()
        .eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Manual value deleted");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  function changeManualMonth(month: string) {
    if (!month) return;
    const options = manualPeriodOptionsForMonth(month);
    const nextWeek = month === monthKeyFromDate(new Date()) ? currentManualPeriodStart() : options[0]?.from ?? "";
    const row = editingWeeklyRows.find((manualRow) => manualWeekStartForDate(String(manualRow.week_start)) === nextWeek);
    setManualMonth(month);
    setEditingWeek(nextWeek);
    setEditValue(row?.actual != null ? String(row.actual) : "");
  }

  function selectManualWeek(week: string) {
    setEditingWeek(week);
    const row = editingWeeklyRows.find((manualRow) => manualWeekStartForDate(String(manualRow.week_start)) === week);
    setEditValue(row?.actual != null ? String(row.actual) : "");
  }

  function openManualEditor(target: KpiTarget, row?: any) {
    const week = row?.week_start ?? currentManualPeriodStart();
    setEditingKpi(target);
    setManualMonth(monthKeyFromIso(week));
    setEditingWeek(week);
    setEditValue(row?.actual != null ? String(row.actual) : "");
  }

  const [note, setNote] = useState("");
  const [editingNote, setEditingNote] = useState<any | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const addNote = useMutation({
    mutationFn: async () => {
      if (!user || !note.trim()) return;
      const { error } = await supabase.from("kpi_notes").insert({
        week_start: range.from, kpi_key: "general", note: note.trim(),
        author_id: user.id, author_name: user.email,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Note added"); setNote(""); qc.invalidateQueries({ queryKey: ["kpi_notes"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateNote = useMutation({
    mutationFn: async () => {
      if (!editingNote) throw new Error("Choose a note to edit.");
      await updateManagerNote({
        data: {
          id: editingNote.id,
          note: editingNoteText,
        },
      });
    },
    onSuccess: () => {
      toast.success("Note updated");
      setEditingNote(null);
      setEditingNoteText("");
      qc.invalidateQueries({ queryKey: ["kpi_notes"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      await deleteManagerNote({ data: { id } });
    },
    onSuccess: () => {
      toast.success("Note deleted");
      qc.invalidateQueries({ queryKey: ["kpi_notes"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function startEditingNote(noteRow: any) {
    setEditingNote(noteRow);
    setEditingNoteText(noteRow.note ?? "");
  }

  function confirmDeleteNote(noteRow: any) {
    if (!window.confirm("Delete this manager note?")) return;
    deleteNote.mutate(noteRow.id);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Performance Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Operational KPIs across dispatch, quality, and billing.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" value={range.from} onChange={(e) => setCustomDashboardRange("from", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" value={range.to} onChange={(e) => setCustomDashboardRange("to", e.target.value)} />
          </div>
        </div>
      </header>

      {/* Executive Summary */}
      <Card className="p-6 bg-gradient-to-br from-primary/5 via-card to-card border-primary/20">
        <div className="grid md:grid-cols-4 gap-6 items-center">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{periodLabel(range)}</div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-5xl font-display font-bold">{summary.score ?? "—"}{summary.score != null && <span className="text-2xl">%</span>}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">Latest selected-week KPI score</div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-success" /><span className="font-medium">{summary.counts.green}</span><span className="text-muted-foreground">On Target</span></div>
            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-warning" /><span className="font-medium">{summary.counts.yellow}</span><span className="text-muted-foreground">Need Attention</span></div>
            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-destructive" /><span className="font-medium">{summary.counts.red}</span><span className="text-muted-foreground">Critical</span></div>
          </div>
          <div className="text-sm">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Last Upload</div>
            <div className="mt-1 font-medium">{lastUploadQ.data ? new Date(lastUploadQ.data.created_at).toLocaleString() : "—"}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{lastUploadQ.data ? reportKindLabel(lastUploadQ.data.kind) : "No uploads yet"}</div>
          </div>
          <div className="text-sm">
            <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />Customer Emails</div>
            <div className="mt-1 flex gap-4">
              <div><span className="font-semibold text-lg">{emailStatsQ.data?.ready ?? 0}</span> <span className="text-xs text-muted-foreground">Ready</span></div>
              <div><span className="font-semibold text-lg text-success">{emailStatsQ.data?.sent ?? 0}</span> <span className="text-xs text-muted-foreground">Sent</span></div>
              <div><span className="font-semibold text-lg text-destructive">{emailStatsQ.data?.failed ?? 0}</span> <span className="text-xs text-muted-foreground">Failed</span></div>
            </div>
          </div>
        </div>
      </Card>

      {noData && (
        <Card className="p-6 border-dashed">
          <div className="flex items-center gap-4">
            <AlertTriangle className="w-6 h-6 text-warning" />
            <div className="flex-1">
              <div className="font-medium">No data for this date range yet</div>
              <div className="text-sm text-muted-foreground">Upload Active/Review/Final, Ticket QC, Invoice Cycle Time, or Open Jobs to populate KPIs.</div>
            </div>
            <Button onClick={() => nav({ to: "/uploads" })}>Go to Uploads</Button>
          </div>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={Ticket} label="Active Tickets" value={totals.active_tickets} accent="text-primary" />
        <StatCard icon={Ticket} label="Review Tickets" value={totals.review_tickets} accent="text-warning" />
        <StatCard icon={CheckCircle2} label="Final Edit Tickets" value={totals.final_edit_tickets} accent="text-success" />
      </div>

      {/* Operational Summary */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Operational Summary</h2>
            <p className="text-xs text-muted-foreground">Status, trend and commentary per KPI</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map(r => {
            const d = deltaPct(r.actual, r.previous);
            const good = isImproving(r);
            const DeltaIcon = d == null ? Minus : good ? ArrowUp : ArrowDown;
            const color = r.status === "green" ? "border-l-success" : r.status === "yellow" ? "border-l-warning" : r.status === "red" ? "border-l-destructive" : "border-l-muted";
            const manualPeriodRows = manualRowsForKpi(valuesQ.data ?? [], r.target.kpi_key);
            const currentPeriodManual = manualPeriodRows.find((row) => manualWeekStartForDate(String(row.week_start)) === currentManualWeek);
            const manualLocked = !!currentPeriodManual && !canOverrideManualKpis;
            const showManualWeekSnippet = !r.target.auto;
            const metricSeries = showManualWeekSnippet ? metricSeriesByKey.get(r.target.kpi_key) ?? [] : [];
            const displayedWeekPoints = metricSeries.slice(0, CARD_WEEK_LIMIT);
            const hiddenWeekCount = Math.max(0, metricSeries.length - displayedWeekPoints.length);
            return (
              <div key={r.target.id} className={`h-full min-h-[210px] rounded-lg border border-l-4 p-4 ${color} bg-card`}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="break-words font-medium leading-snug">{r.target.label}</div>
                  </div>
                  <StatusPill status={r.status} />
                </div>
                <div className="mt-3 flex items-baseline gap-3">
                  <span className="text-2xl font-display font-semibold">{formatKpi(r.actual, r.target)}</span>
                  {d != null && (
                    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${good ? "text-success" : "text-destructive"}`}>
                      <DeltaIcon className="w-3 h-3" />{Math.abs(d).toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-xs">
                  <span className="uppercase tracking-wide text-muted-foreground">Target</span>
                  <span className="font-semibold text-foreground">{r.target.target_display ?? "No target"}</span>
                </div>
                {showManualWeekSnippet && (
                  <>
                    <div className="mt-3 max-h-20 space-y-1 overflow-hidden rounded-md border bg-muted/25 p-2 text-xs">
                      {displayedWeekPoints.length === 0 ? (
                        <div className="text-muted-foreground">No Monday-Friday weeks in this range.</div>
                      ) : displayedWeekPoints.map((point) => (
                        <div key={`${r.target.kpi_key}-${point.from}`} className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-muted-foreground">{point.label}</span>
                          <span className="inline-flex shrink-0 items-center gap-1 font-medium">
                            <span className={`h-2 w-2 rounded-full ${statusDotClass(point.status)}`} />
                            {formatKpi(point.actual, r.target)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {hiddenWeekCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setMetricDetailKpi(r.target)}
                        className="mt-1 text-xs text-primary hover:underline"
                      >
                        View all {metricSeries.length} weeks
                      </button>
                    )}
                  </>
                )}
                <p className="text-xs text-muted-foreground mt-2">{commentary(r)}</p>
                {r.target.auto ? (
                  <span className="mt-2 inline-block text-[10px] text-muted-foreground uppercase tracking-wide">Auto-calculated</span>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openManualEditor(r.target, currentPeriodManual)}
                      disabled={!canEditDashboard || manualLocked}
                      className="text-xs text-primary hover:underline disabled:pointer-events-none disabled:text-muted-foreground inline-flex items-center gap-1"
                    >
                      {manualLocked ? <Lock className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                      {currentPeriodManual
                        ? manualLocked
                          ? "Locked current range"
                          : "Edit current range"
                        : "Enter current range"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualDetailKpi(r.target)}
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" />
                      Range detail
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Focus Areas */}
      {focus.length > 0 && (
        <Card className="p-6">
          <h3 className="font-display text-base font-semibold mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4" />Focus Areas</h3>
          <div className="space-y-2">
            {focus.map(r => (
              <div key={r.target.id} className="flex items-center gap-3 text-sm">
                <StatusPill status={r.status} />
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium">{r.target.label}</span>
                  <span className="block text-xs text-muted-foreground">Target: {r.target.target_display ?? "No target"}</span>
                </span>
                <span className="ml-auto shrink-0 text-muted-foreground">{formatKpi(r.actual, r.target)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Trends */}
      <div className="grid xl:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold">Percentage KPI Trends</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Tickets QC'd and Team Responsiveness for {monthDisplayLabel(trendMonth)}.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="trend-month" className="text-xs text-muted-foreground">Month</Label>
              <div className="relative w-[180px]">
                <Input
                  ref={trendMonthInputRef}
                  id="trend-month"
                  type="month"
                  value={trendMonth}
                  onClick={openTrendMonthPicker}
                  onChange={(event) => setTrendMonth(event.target.value)}
                  className="w-full cursor-pointer pr-10 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={openTrendMonthPicker}
                  aria-label="Open month picker"
                >
                  <CalendarDays className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          {trendAutoQ.isLoading || trendValuesQ.isLoading ? (
            <div className="h-[260px] rounded-md bg-muted/30 animate-pulse" />
          ) : percentageTrendHasData ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip
                  content={<ManualTrendTooltip targets={visiblePercentageTrendTargets} />}
                  cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                />
                <Legend />
                {visiblePercentageTrendTargets.map((target, index) => (
                  <Line
                    key={target.kpi_key}
                    type="monotone"
                    dataKey={target.label}
                    stroke={MANUAL_TREND_COLORS[index % MANUAL_TREND_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] rounded-md border border-dashed flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
              No percentage KPI trend data for {monthDisplayLabel(trendMonth)} yet.
            </div>
          )}
        </Card>
        <Card className="p-6">
          <div className="mb-4">
            <h3 className="font-display text-base font-semibold">Number & Time KPI Trends</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Invoice Cycle Time, Ticket Quality errors, Safety, Incomplete Tickets, and Missed Jobs for {monthDisplayLabel(trendMonth)}.
            </p>
          </div>
          {trendAutoQ.isLoading || trendValuesQ.isLoading ? (
            <div className="h-[260px] rounded-md bg-muted/30 animate-pulse" />
          ) : numberTrendHasData ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip
                  content={<ManualTrendTooltip targets={visibleNumberTrendTargets} />}
                  cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                />
                <Legend />
                {visibleNumberTrendTargets.map((target, index) => (
                  <Line
                    key={target.kpi_key}
                    type="monotone"
                    dataKey={target.label}
                    stroke={MANUAL_TREND_COLORS[index % MANUAL_TREND_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] rounded-md border border-dashed flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
              No number or time KPI trend data for {monthDisplayLabel(trendMonth)} yet.
            </div>
          )}
        </Card>
      </div>

      <Card className="p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold">Manager Notes</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Notes and corrective actions for {periodLabel(range)}.
            </p>
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(280px,360px)_1fr]">
          <div className="rounded-lg border bg-muted/25 p-4">
            <Label htmlFor="manager-note" className="text-sm font-medium">Add note</Label>
            <Textarea
              id="manager-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note, decision, or corrective action..."
              rows={5}
              className="mt-2 bg-background"
            />
            <Button className="mt-3 w-full" size="sm" onClick={() => addNote.mutate()} disabled={!note.trim() || addNote.isPending}>
              {addNote.isPending ? "Adding..." : "Add note"}
            </Button>
          </div>
          <div className="space-y-3">
            {(notesQ.data ?? []).length === 0 && (
              <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                No notes yet for this date range.
              </div>
            )}
            {(notesQ.data ?? []).map((n: any) => (
              <div key={n.id} className="rounded-lg border bg-card p-4 shadow-sm">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2 text-xs text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">{n.author_name ?? n.kpi_key}</span>
                    <span className="ml-2">{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                  {isSuperAdmin && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => startEditingNote(n)}
                        aria-label="Edit manager note"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => confirmDeleteNote(n)}
                        disabled={deleteNote.isPending}
                        aria-label="Delete manager note"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{n.note}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Dialog
        open={!!editingNote}
        onOpenChange={(open) => {
          if (!open) {
            setEditingNote(null);
            setEditingNoteText("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit manager note</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-manager-note">Note</Label>
            <Textarea
              id="edit-manager-note"
              value={editingNoteText}
              onChange={(event) => setEditingNoteText(event.target.value)}
              rows={6}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditingNote(null);
                setEditingNoteText("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => updateNote.mutate()}
              disabled={!editingNoteText.trim() || updateNote.isPending}
            >
              {updateNote.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!metricDetailKpi}
        onOpenChange={(open) => {
          if (!open) setMetricDetailKpi(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{metricDetailKpi?.label} weekly detail</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              Showing Monday-Friday weeks for {periodLabel(range)}.
              {weekRangeLimited && ` The first ${MAX_WEEK_DETAIL_FETCH} weeks are shown to keep the dashboard responsive.`}
            </div>
            <div className="max-h-[420px] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/70 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Week</th>
                    <th className="px-3 py-2 text-left font-medium">Value</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {metricDetailSeries.map((point) => (
                    <tr key={`${metricDetailKpi?.kpi_key}-${point.from}`} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">{point.label}</td>
                      <td className="px-3 py-2 font-medium">
                        {metricDetailKpi ? formatKpi(point.actual, metricDetailKpi) : "-"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill status={point.status} />
                      </td>
                    </tr>
                  ))}
                  {metricDetailSeries.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        No weekly values in this selected range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMetricDetailKpi(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!manualDetailKpi}
        onOpenChange={(open) => {
          if (!open) setManualDetailKpi(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{manualDetailKpi?.label} range detail</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{periodLabel(range)}</span>
              <span className="font-semibold">
                {detailWeeklyRows.length} saved {detailWeeklyRows.length === 1 ? "week" : "weeks"}
              </span>
            </div>
            <div className="max-h-[360px] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/70 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Range</th>
                    <th className="px-3 py-2 text-left font-medium">Value</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {detailWeeklyRows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">{manualPeriodForStart(row.week_start).label}</td>
                      <td className="px-3 py-2 font-medium">
                        {manualDetailKpi ? formatKpi(row.actual, manualDetailKpi) : row.actual ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-2">
                          {canOverrideManualKpis && manualDetailKpi && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openManualEditor(manualDetailKpi, row)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {canEditDashboard && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => deleteManual.mutate(row.id)}
                              disabled={deleteManual.isPending}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {detailWeeklyRows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        No manual values in this date range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Manual metrics are saved by Monday-Friday week ranges only. Dashboard editors can delete a week value; admins can edit existing values.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDetailKpi(null)}>
              Close
            </Button>
            {manualDetailKpi && canEditDashboard && (
              <Button onClick={() => openManualEditor(manualDetailKpi)}>
                Enter current range
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editingKpi}
        onOpenChange={(open) => {
          if (!open) {
            setEditingKpi(null);
            setEditingWeek("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>Update {editingKpi?.label}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="manual-month">Month</Label>
                <Input
                  id="manual-month"
                  type="month"
                  value={manualMonth}
                  onChange={(event) => changeManualMonth(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-range">Week range</Label>
                <Select value={activeEditingWeek} onValueChange={selectManualWeek}>
                  <SelectTrigger id="manual-range">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {manualPeriodOptions.map((option) => (
                      <SelectItem key={option.from} value={option.from}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Selected range: {activeEditingPeriod.label}. Target: {editingKpi?.target_display ?? "-"}.
            </p>
            {editingWeekRow && !canOverrideManualKpis && (
              <p className="text-sm text-warning">
                This range is locked because a value already exists. Delete it from Range detail, or ask an admin to edit it.
              </p>
            )}
            <Input type="number" step="0.1" value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="Enter value" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingKpi(null); setEditingWeek(""); }}>Cancel</Button>
            <Button onClick={() => saveManual.mutate()} disabled={!activeEditingWeek || saveManual.isPending || (!!editingWeekRow && !canOverrideManualKpis)}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function orderedTrendTargets(targets: KpiTarget[], keys: string[]) {
  const byKey = new Map(targets.map((target) => [target.kpi_key, target]));
  return keys
    .map((key) => byKey.get(key))
    .filter((target): target is KpiTarget => !!target);
}

function visibleTrendTargets(targets: KpiTarget[], rows: TrendRow[]) {
  return targets.filter((target) => rows.some((row) => row[target.label] != null));
}

function savedTrendValuesByWeek(rows: any[], targetKeys: Set<string>) {
  const byWeek = new Map<string, Map<string, { actual: number | null; sourceWeekStart: string }>>();

  for (const row of rows) {
    if (!row.kpi_key || !row.week_start || !targetKeys.has(row.kpi_key)) continue;
    const week = manualWeekStartForDate(String(row.week_start));
    const values = byWeek.get(week) ?? new Map<string, { actual: number | null; sourceWeekStart: string }>();
    const existing = values.get(row.kpi_key);
    if (!existing || String(row.week_start) >= existing.sourceWeekStart) {
      values.set(row.kpi_key, {
        actual: numericOrNull(row.actual),
        sourceWeekStart: String(row.week_start),
      });
    }
    byWeek.set(week, values);
  }

  return byWeek;
}

function combinedTrendChart(
  weeks: WeekRangeOption[],
  autoRows: Array<WeekRangeOption & { data: any }>,
  savedRows: any[],
  targets: KpiTarget[],
): TrendRow[] {
  const chartTargets = orderedTrendTargets(targets, [...PERCENT_TREND_KEYS, ...NUMBER_TREND_KEYS]);
  const targetKeys = new Set(chartTargets.map((target) => target.kpi_key));
  const autoByWeek = new Map(autoRows.map((row) => [row.from, row.data]));
  const savedByWeek = savedTrendValuesByWeek(savedRows, targetKeys);

  return weeks.map((week) => {
    const row: TrendRow = {
      week: week.label,
      period: `${week.label}: ${formatWeek(week.from)} - ${formatWeek(week.to)}`,
    };
    const auto = autoByWeek.get(week.from);
    const saved = savedByWeek.get(week.from);

    for (const target of chartTargets) {
      row[target.label] =
        autoMetricValue(auto, target.kpi_key) ??
        saved?.get(target.kpi_key)?.actual ??
        null;
    }

    return row;
  });
}

function manualTrendChart(weeks: WeekRangeOption[], savedRows: any[], targets: KpiTarget[]): TrendRow[] {
  const targetByKey = new Map(targets.map((target) => [target.kpi_key, target]));
  const selectedWeeks = new Set(weeks.map((week) => week.from));
  const valuesByWeek = new Map<string, Map<string, { actual: number | null; sourceWeekStart: string }>>();

  for (const row of savedRows) {
    if (row.source === "auto" || !row.kpi_key || !row.week_start || !targetByKey.has(row.kpi_key)) continue;
    const weekStart = manualWeekStartForDate(String(row.week_start));
    if (!selectedWeeks.has(weekStart)) continue;

    const weekValues = valuesByWeek.get(weekStart) ?? new Map<string, { actual: number | null; sourceWeekStart: string }>();
    const existing = weekValues.get(row.kpi_key);
    if (!existing || String(row.week_start) >= existing.sourceWeekStart) {
      weekValues.set(row.kpi_key, {
        actual: numericOrNull(row.actual),
        sourceWeekStart: String(row.week_start),
      });
    }
    valuesByWeek.set(weekStart, weekValues);
  }

  return weeks.map((week) => {
    const row: TrendRow = {
      week: week.label,
      period: `${week.label}: ${formatWeek(week.from)} - ${formatWeek(week.to)}`,
    };
    const weekValues = valuesByWeek.get(week.from);
    for (const target of targets) {
      row[target.label] = weekValues?.get(target.kpi_key)?.actual ?? null;
    }
    return row;
  });
}
