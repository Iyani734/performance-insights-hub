import { cn } from "@/lib/utils";
import type { KpiStatus } from "@/lib/kpi";

const MAP: Record<KpiStatus, { bg: string; label: string }> = {
  green: { bg: "bg-success text-success-foreground", label: "On target" },
  yellow: { bg: "bg-warning text-warning-foreground", label: "Watch" },
  red: { bg: "bg-destructive text-destructive-foreground", label: "Below" },
  none: { bg: "bg-muted text-muted-foreground", label: "No data" },
};

export function StatusPill({ status, className }: { status: KpiStatus; className?: string }) {
  const m = MAP[status];
  return <span className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium", m.bg, className)}>
    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
    {m.label}
  </span>;
}
