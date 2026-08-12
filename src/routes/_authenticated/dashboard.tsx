import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeAutoKpisForRange, computeStatus, formatKpi, formatWeek, normalizeKpiTargets, weekStartOf, type KpiTarget } from "@/lib/kpi";
import { buildRows, overallScore, deltaPct, isImproving, commentary, focusAreas } from "@/lib/summary";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/StatusPill";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { useEffect, useMemo, useState } from "react";
import { Ticket, CheckCircle2, AlertTriangle, ArrowUp, ArrowDown, Minus, Mail, TrendingUp, Pencil, Eye, Lock } from "lucide-react";
import { toast } from "sonner";
import { canEdit, useAuth } from "@/lib/useAuth";
import { useDemoMode } from "@/lib/demoMode";
import { isSeededDemoEmail, isSeededDemoNote, isSeededDemoSource, isSeededDemoUpload } from "@/lib/liveData";
import { reportKindLabel } from "@/lib/reportTypes";
import {
  DEMO_TARGETS,
  defaultLast7DaysRange,
  demoAutoKpisForRange,
  demoEmailStats,
  demoKpiValuesWithLocal,
  demoNotes,
  demoUploadsWithLocal,
  previousDateRange,
  type DateRangeValue,
} from "@/lib/demoData";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

const DASHBOARD_RANGE_STORAGE_KEY = "arc-dashboard-date-range";

async function fetchValuesForRange(range: DateRangeValue) {
  const { data } = await supabase
    .from("kpi_values")
    .select("*")
    .gte("week_start", range.from)
    .lte("week_start", range.to)
    .order("week_start");
  return (data ?? []).filter((row) => !isSeededDemoSource(row.source));
}

function periodLabel(range: DateRangeValue) {
  return `${formatWeek(range.from)} - ${formatWeek(range.to)}`;
}

function loadDashboardRange() {
  const fallback = defaultLast7DaysRange();
  if (typeof window === "undefined") return fallback;

  try {
    const stored = window.localStorage.getItem(DASHBOARD_RANGE_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    if (
      parsed &&
      typeof parsed.from === "string" &&
      typeof parsed.to === "string" &&
      parsed.from <= parsed.to
    ) {
      return parsed as DateRangeValue;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function saveDashboardRange(range: DateRangeValue) {
  if (typeof window === "undefined" || !range.from || !range.to || range.from > range.to) return;
  window.localStorage.setItem(DASHBOARD_RANGE_STORAGE_KEY, JSON.stringify(range));
}

function valuesMap(rows: any[]) {
  const map: Record<string, number | null> = {};
  const grouped = new Map<string, number[]>();
  for (const v of rows) {
    if (v.source === "auto") continue;
    if (v.actual == null) {
      if (!grouped.has(v.kpi_key)) grouped.set(v.kpi_key, []);
      continue;
    }
    const actual = Number(v.actual);
    if (!Number.isFinite(actual)) continue;
    grouped.set(v.kpi_key, [...(grouped.get(v.kpi_key) ?? []), actual]);
  }
  for (const [kpiKey, values] of grouped) {
    map[kpiKey] = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  }
  return map;
}

function manualRowsForKpi(rows: any[], kpiKey: string) {
  return rows
    .filter((row) => row.kpi_key === kpiKey && row.source !== "auto")
    .sort((a, b) => String(a.week_start).localeCompare(String(b.week_start)));
}

function averageActual(rows: any[]) {
  const values = rows
    .map((row) => (row.actual == null ? null : Number(row.actual)))
    .filter((value): value is number => value != null && Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function Dashboard() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const auth = useAuth();
  const { user, isSuperAdmin, isAdmin } = auth;
  const demoMode = useDemoMode();
  const canEditDashboard = demoMode || canEdit(auth, "dashboard");
  const canOverrideManualKpis = isAdmin || isSuperAdmin;
  const [range, setRange] = useState<DateRangeValue>(loadDashboardRange);
  const validRange = !!range.from && !!range.to && range.from <= range.to;
  const prevRange = useMemo(() => previousDateRange(range), [range]);

  useEffect(() => {
    saveDashboardRange(range);
  }, [range]);

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

  const valuesQ = useQuery({
    queryKey: ["kpi_values_range", range, demoMode],
    queryFn: () => demoMode
      ? Promise.resolve(demoKpiValuesWithLocal().filter((v: any) => v.week_start >= range.from && v.week_start <= range.to))
      : fetchValuesForRange(range),
    enabled: validRange,
  });

  const prevValuesQ = useQuery({
    queryKey: ["kpi_values_range", prevRange, demoMode],
    queryFn: () => demoMode
      ? Promise.resolve(demoKpiValuesWithLocal().filter((v: any) => v.week_start >= prevRange.from && v.week_start <= prevRange.to))
      : fetchValuesForRange(prevRange),
    enabled: validRange,
  });

  const trendsQ = useQuery({
    queryKey: ["kpi_trends", demoMode],
    queryFn: async () => {
      if (demoMode) return demoKpiValuesWithLocal();
      const { data } = await supabase.from("kpi_values").select("*").order("week_start");
      return (data ?? []).filter((row) => !isSeededDemoSource(row.source));
    },
  });

  const emailStatsQ = useQuery({
    queryKey: ["email_stats", range, demoMode],
    queryFn: async () => {
      if (demoMode) return demoEmailStats();
      const { data } = await supabase.from("email_jobs").select("status,customer_email").gte("week_start", range.from).lte("week_start", range.to);
      const rows = (data ?? []).filter((row) => !isSeededDemoEmail(row.customer_email));
      return {
        ready: rows.filter((r: any) => r.status === "pending").length,
        sent: rows.filter((r: any) => r.status === "sent").length,
        pending: rows.filter((r: any) => r.status === "pending").length,
        failed: rows.filter((r: any) => r.status === "failed").length,
      };
    },
    enabled: validRange,
  });

  const lastUploadQ = useQuery({
    queryKey: ["last_upload", demoMode],
    queryFn: async () => {
      if (demoMode) return demoUploadsWithLocal()[0];
      const { data } = await supabase.from("report_uploads").select("created_at,kind,file_name").order("created_at", { ascending: false }).limit(50);
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

  const currentMap = useMemo(() => {
    const auto: any = autoQ.data ?? {};
    const map: Record<string, number | null> = {
      review_to_final_edit: auto.review_to_final_edit ?? null,
      ticket_quality: auto.ticket_quality ?? null,
      invoice_cycle_time: auto.invoice_cycle_time ?? null,
      dispatch_completion: auto.dispatch_completion ?? null,
      quality_issues: auto.totals?.quality_issues ?? null,
    };
    Object.assign(map, valuesMap(valuesQ.data ?? []));
    return map;
  }, [autoQ.data, valuesQ.data]);

  const prevMap = useMemo(() => {
    const auto: any = autoPrevQ.data ?? {};
    const map: Record<string, number | null> = {
      review_to_final_edit: auto.review_to_final_edit ?? null,
      ticket_quality: auto.ticket_quality ?? null,
      invoice_cycle_time: auto.invoice_cycle_time ?? null,
      dispatch_completion: auto.dispatch_completion ?? null,
      quality_issues: auto.totals?.quality_issues ?? null,
    };
    Object.assign(map, valuesMap(prevValuesQ.data ?? []));
    return map;
  }, [autoPrevQ.data, prevValuesQ.data]);

  const rows = useMemo(() => buildRows(targets, currentMap, prevMap), [targets, currentMap, prevMap]);
  const summary = useMemo(() => overallScore(rows), [rows]);
  const focus = useMemo(() => focusAreas(rows), [rows]);

  const totals = autoQ.data?.totals ?? { tickets: 0, invoiced: 0, quality_issues: 0, quality_total_tickets: 0, qc_tickets: 0, qc_review_tickets: 0, qc_final_tickets: 0, cycle_time_rows: 0, voided: 0, active_tickets: 0, review_tickets: 0, final_edit_tickets: 0 };
  const noData = !validRange || (totals.tickets === 0 && totals.qc_tickets === 0 && totals.cycle_time_rows === 0 && totals.invoiced === 0 && totals.quality_issues === 0 && totals.quality_total_tickets === 0);
  const ticketQcTarget = targets.find((target) => target.kpi_key === "review_to_final_edit") ?? null;

  const [editingKpi, setEditingKpi] = useState<KpiTarget | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingWeek, setEditingWeek] = useState("");
  const [manualDetailKpi, setManualDetailKpi] = useState<KpiTarget | null>(null);
  const currentManualWeek = weekStartOf(new Date());
  const activeEditingWeek = editingWeek || currentManualWeek;
  const editingWeeklyRows = useMemo(
    () => (editingKpi ? manualRowsForKpi(valuesQ.data ?? [], editingKpi.kpi_key) : []),
    [editingKpi, valuesQ.data],
  );
  const editingWeekRow = editingWeeklyRows.find((row) => row.week_start === activeEditingWeek);
  const detailWeeklyRows = useMemo(
    () => (manualDetailKpi ? manualRowsForKpi(valuesQ.data ?? [], manualDetailKpi.kpi_key) : []),
    [manualDetailKpi, valuesQ.data],
  );
  const detailAverage = useMemo(() => averageActual(detailWeeklyRows), [detailWeeklyRows]);

  const saveManual = useMutation({
    mutationFn: async () => {
      if (!editingKpi || !user) return;
      const val = editValue === "" ? null : Number(editValue);
      if (!Number.isFinite(val as number) && val !== null) throw new Error("Enter a valid number.");
      const { data: existing, error: existingError } = await supabase
        .from("kpi_values")
        .select("id,week_start")
        .eq("kpi_key", editingKpi.kpi_key)
        .eq("week_start", activeEditingWeek)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing && !canOverrideManualKpis) {
        throw new Error("This metric is already entered for this week. An admin can edit the locked value.");
      }
      const { error } = await supabase.from("kpi_values").upsert(
        { kpi_key: editingKpi.kpi_key, week_start: activeEditingWeek, actual: val, source: "manual", entered_by: user.id },
        { onConflict: "kpi_key,week_start" }
      );
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); setEditingKpi(null); setEditingWeek(""); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const confirmManual = useMutation({
    mutationFn: async (rowId: string) => {
      if (!user || !canOverrideManualKpis) throw new Error("Only an admin can confirm manual metrics.");
      const { error } = await supabase
        .from("kpi_values")
        .update({ confirmed_by: user.id, confirmed_at: new Date().toISOString() })
        .eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Manual metric confirmed");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  function openManualEditor(target: KpiTarget, row?: any) {
    setEditingKpi(target);
    setEditingWeek(row?.week_start ?? currentManualWeek);
    setEditValue(row?.actual != null ? String(row.actual) : "");
  }

  const [note, setNote] = useState("");
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Performance Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Operational KPIs across dispatch, quality, and billing.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" value={range.from} onChange={(e) => setRange((current) => ({ ...current, from: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" value={range.to} onChange={(e) => setRange((current) => ({ ...current, to: e.target.value }))} />
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
            <div className="text-xs text-muted-foreground mt-1">Overall KPI Score</div>
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
              <div><span className="font-semibold text-lg text-warning">{emailStatsQ.data?.pending ?? 0}</span> <span className="text-xs text-muted-foreground">Pending</span></div>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Ticket} label="Active Tickets" value={totals.active_tickets} accent="text-primary" />
        <StatCard icon={Ticket} label="Review Tickets" value={totals.review_tickets} accent="text-warning" />
        <StatCard icon={CheckCircle2} label="Final Edit Tickets" value={totals.final_edit_tickets} accent="text-success" />
        <TicketQcStatCard
          target={ticketQcTarget}
          actual={currentMap.review_to_final_edit}
          reviewRows={totals.qc_review_tickets ?? 0}
          finalRows={totals.qc_final_tickets ?? totals.qc_tickets ?? 0}
        />
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
            const manualWeekRows = manualRowsForKpi(valuesQ.data ?? [], r.target.kpi_key);
            const currentWeekManual = manualWeekRows.find((row) => row.week_start === currentManualWeek);
            const manualLocked = !!currentWeekManual && !canOverrideManualKpis;
            return (
              <div key={r.target.id} className={`h-full min-h-[210px] rounded-lg border border-l-4 p-4 ${color} bg-card`}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="break-words text-xs uppercase tracking-wide text-muted-foreground">{r.target.owner ?? r.target.cadence}</div>
                    <div className="mt-1 break-words font-medium leading-snug">{r.target.label}</div>
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
                <p className="text-xs text-muted-foreground mt-2">{commentary(r)}</p>
                {r.target.auto ? (
                  <span className="mt-2 inline-block text-[10px] text-muted-foreground uppercase tracking-wide">Auto-calculated</span>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openManualEditor(r.target, currentWeekManual)}
                      disabled={!canEditDashboard || manualLocked}
                      className="text-xs text-primary hover:underline disabled:pointer-events-none disabled:text-muted-foreground inline-flex items-center gap-1"
                    >
                      {manualLocked ? <Lock className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                      {currentWeekManual
                        ? manualLocked
                          ? "Locked this week"
                          : "Edit this week"
                        : "Enter this week"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualDetailKpi(r.target)}
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" />
                      Weekly detail
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

      {/* KPI table */}
      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-display text-lg font-semibold">KPI Performance Tracker</h2>
          <p className="text-xs text-muted-foreground">{periodLabel(range)} vs. {periodLabel(prevRange)}</p>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-6 py-3 font-medium">Owner</th>
              <th className="text-left px-6 py-3 font-medium">Metric</th>
              <th className="text-left px-6 py-3 font-medium">Target</th>
              <th className="text-left px-6 py-3 font-medium">Previous</th>
              <th className="text-left px-6 py-3 font-medium">Actual</th>
              <th className="text-left px-6 py-3 font-medium">Δ</th>
              <th className="text-left px-6 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const d = deltaPct(r.actual, r.previous);
              const good = isImproving(r);
              return (
                <tr key={r.target.id} className="border-t">
                  <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">{r.target.owner ?? "—"}</td>
                  <td className="px-6 py-4 font-medium">{r.target.label}</td>
                  <td className="px-6 py-4 text-muted-foreground">{r.target.target_display ?? "—"}</td>
                  <td className="px-6 py-4 text-muted-foreground">{formatKpi(r.previous, r.target)}</td>
                  <td className="px-6 py-4 font-semibold">{formatKpi(r.actual, r.target)}</td>
                  <td className={`px-6 py-4 ${d == null ? "text-muted-foreground" : good ? "text-success" : "text-destructive"}`}>
                    {d == null ? "—" : `${good ? "▲" : "▼"} ${Math.abs(d).toFixed(1)}%`}
                  </td>
                  <td className="px-6 py-4"><StatusPill status={r.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </Card>

      {/* Trends + Notes */}
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
              <Line type="monotone" dataKey="Review-Final QC" stroke="oklch(0.62 0.13 190)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Ticket Quality %" stroke="oklch(0.78 0.16 75)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Invoice Cycle (d)" stroke="oklch(0.6 0.22 25)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-6">
          <h3 className="font-display text-base font-semibold mb-4">Manager Notes</h3>
          <div className="space-y-2 mb-4">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note or corrective action…" rows={3} />
            <Button size="sm" onClick={() => addNote.mutate()} disabled={!note.trim() || addNote.isPending}>Add note</Button>
          </div>
          <div className="space-y-3 max-h-[220px] overflow-auto">
            {(notesQ.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No notes yet for this date range.</p>}
            {(notesQ.data ?? []).map((n: any) => (
              <div key={n.id} className="p-3 rounded-md bg-muted/40 border">
                <div className="text-xs text-muted-foreground mb-1">{n.author_name ?? n.kpi_key} · {new Date(n.created_at).toLocaleString()}</div>
                <div className="text-sm">{n.note}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Dialog
        open={!!manualDetailKpi}
        onOpenChange={(open) => {
          if (!open) setManualDetailKpi(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{manualDetailKpi?.label} weekly detail</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{periodLabel(range)}</span>
              <span className="font-semibold">
                Average: {manualDetailKpi ? formatKpi(detailAverage, manualDetailKpi) : "-"}
              </span>
            </div>
            <div className="max-h-[360px] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/70 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Week</th>
                    <th className="px-3 py-2 text-left font-medium">Value</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {detailWeeklyRows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">{formatWeek(row.week_start)}</td>
                      <td className="px-3 py-2 font-medium">
                        {manualDetailKpi ? formatKpi(row.actual, manualDetailKpi) : row.actual ?? "-"}
                      </td>
                      <td className="px-3 py-2">
                        {row.confirmed_at ? (
                          <Badge className="bg-success/15 text-success hover:bg-success/15">
                            Confirmed
                          </Badge>
                        ) : (
                          <Badge variant="outline">Unconfirmed</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-2">
                          {canOverrideManualKpis && !row.confirmed_at && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => confirmManual.mutate(row.id)}
                              disabled={confirmManual.isPending}
                            >
                              Confirm
                            </Button>
                          )}
                          {canOverrideManualKpis && manualDetailKpi && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openManualEditor(manualDetailKpi, row)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {detailWeeklyRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        No weekly manual values in this date range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Manual metrics are entered once per week. Non-admin editors cannot change a week after it has been entered; an admin can edit and confirm the row.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDetailKpi(null)}>
              Close
            </Button>
            {manualDetailKpi && canEditDashboard && (
              <Button onClick={() => openManualEditor(manualDetailKpi)}>
                Enter this week
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
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Week starting {formatWeek(activeEditingWeek)}. Target: {editingKpi?.target_display ?? "-"}.
            </p>
            {editingWeekRow && !canOverrideManualKpis && (
              <p className="text-sm text-warning">
                This week is locked because a value already exists. An admin can edit it.
              </p>
            )}
            <Input type="number" step="0.1" value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="Enter value" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingKpi(null); setEditingWeek(""); }}>Cancel</Button>
            <Button onClick={() => saveManual.mutate()} disabled={saveManual.isPending || (!!editingWeekRow && !canOverrideManualKpis)}>Save</Button>
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

function TicketQcStatCard({
  target,
  actual,
  reviewRows,
  finalRows,
}: {
  target: KpiTarget | null;
  actual: number | null | undefined;
  reviewRows: number;
  finalRows: number;
}) {
  const value = target ? formatKpi(actual, target) : actual != null ? `${Number(actual).toFixed(1)}%` : "â€”";
  const status = target ? computeStatus(actual, target) : "none";
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Ticket QC</div>
          <div className="text-3xl font-display font-semibold mt-1">{value}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            Target: <span className="font-semibold text-foreground">{target?.target_display ?? ">= 95%"}</span>
          </div>
        </div>
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-success">
          <CheckCircle2 className="w-5 h-5" />
        </div>
      </div>
      <div className="mt-3">
        <StatusPill status={status} />
      </div>
    </Card>
  );
}

function trendChart(rows: any[]) {
  const byWeek: Record<string, any> = {};
  for (const r of rows) {
    const w = formatWeek(r.week_start);
    byWeek[w] = byWeek[w] ?? { week: w };
    if (r.kpi_key === "review_to_final_edit") byWeek[w]["Review-Final QC"] = Number(r.actual);
    if (r.kpi_key === "ticket_quality") byWeek[w]["Ticket Quality %"] = Number(r.actual);
    if (r.kpi_key === "invoice_cycle_time") byWeek[w]["Invoice Cycle (d)"] = Number(r.actual);
  }
  return Object.values(byWeek);
}
