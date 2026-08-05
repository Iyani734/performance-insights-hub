import type { KpiTarget, KpiStatus } from "./kpi";
import { computeStatus, normalizeKpiTarget } from "./kpi";

export type KpiRow = {
  target: KpiTarget;
  actual: number | null;
  previous: number | null;
  status: KpiStatus;
};

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

// Overall score: for each KPI with a value, award 100 (green), 60 (yellow), 20 (red)
export function overallScore(rows: KpiRow[]): { score: number | null; counts: Record<KpiStatus, number> } {
  const counts: Record<KpiStatus, number> = { green: 0, yellow: 0, red: 0, none: 0 };
  let total = 0, weight = 0;
  for (const r of rows) {
    counts[r.status]++;
    if (r.status === "none") continue;
    weight++;
    total += r.status === "green" ? 100 : r.status === "yellow" ? 60 : 20;
  }
  return { score: weight ? Math.round(total / weight) : null, counts };
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
