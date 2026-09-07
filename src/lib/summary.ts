import type { KpiTarget, KpiStatus } from "./kpi";
import { computeStatus, normalizeKpiTarget } from "./kpi";

export type KpiRow = {
  target: KpiTarget;
  actual: number | null;
  previous: number | null;
  status: KpiStatus;
};

const SCORE_KPI_KEYS = new Set([
  "invoice_cycle_time",
  "review_to_final_edit",
  "ticket_quality",
  "dispatch_responsiveness",
  "driver_safety",
  "incomplete_tickets",
]);

export function buildRows(targets: KpiTarget[], current: Record<string, number | null>, previous: Record<string, number | null>): KpiRow[] {
  return targets.map(t => {
    const target = normalizeKpiTarget(t);
    const actual = current[t.kpi_key] ?? null;
    return {
      target,
      actual,
      previous: previous[t.kpi_key] ?? null,
      status: computeStatus(actual, target),
    };
  });
}

// Overall score: average capped attainment for the six core score KPIs.
// - Higher-is-better: actual ÷ target
// - Lower-is-better: target ÷ actual
// Each KPI is capped at 100% before averaging, so exceeding target cannot
// offset a missed KPI.
export function overallScore(rows: KpiRow[]): { score: number | null; counts: Record<KpiStatus, number> } {
  const counts: Record<KpiStatus, number> = { green: 0, yellow: 0, red: 0, none: 0 };
  let total = 0, weight = 0;
  for (const r of rows) {
    counts[r.status]++;
    if (!SCORE_KPI_KEYS.has(r.target.kpi_key)) continue;
    const attainment = attainmentScore(r);
    if (attainment == null) continue;
    weight++;
    total += attainment;
  }
  return { score: weight ? Math.round(total / weight) : null, counts };
}

function attainmentScore(row: KpiRow): number | null {
  const actual = row.actual == null ? null : Number(row.actual);
  const target = Number(row.target.green_min);

  if (actual == null || Number.isNaN(actual) || Number.isNaN(target)) return null;
  if (actual < 0 || target < 0) return null;

  if (row.target.direction === "higher_is_better") {
    if (target === 0) return actual === 0 ? 100 : 100;
    return clampAttainment((actual / target) * 100);
  }

  if (actual === 0) return 100;
  return clampAttainment((target / actual) * 100);
}

function clampAttainment(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function deltaPct(actual: number | null, previous: number | null): number | null {
  if (actual == null || previous == null || previous === 0) return null;
  return ((actual - previous) / Math.abs(previous)) * 100;
}

// Direction-aware: for lower_is_better, a negative delta is "improved"
export function isImproving(r: KpiRow): boolean | null {
  const d = deltaPct(r.actual, r.previous);
  if (d == null) return null;
  return r.target.direction === "lower_is_better" ? d < 0 : d > 0;
}

export function commentary(r: KpiRow): string {
  const improving = isImproving(r);
  if (r.status === "green" && improving) return "On target and improving over last week.";
  if (r.status === "green") return "On target — hold the line.";
  if (r.status === "yellow" && improving) return "Below target but trending in the right direction.";
  if (r.status === "yellow") return "Watch — trending away from target.";
  if (r.status === "red" && improving) return "Critical, but improving. Sustain the corrective actions.";
  if (r.status === "red") return "Immediate attention required.";
  return "No data reported for this week.";
}

export function focusAreas(rows: KpiRow[]): KpiRow[] {
  const rank = { red: 0, yellow: 1, green: 2, none: 3 } as const;
  return [...rows].filter(r => r.status !== "none").sort((a, b) => rank[a.status] - rank[b.status]).slice(0, 3);
}
