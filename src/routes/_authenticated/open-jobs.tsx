import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Search, Briefcase } from "lucide-react";
import { downloadXlsx } from "@/lib/parse";
import { formatWeek } from "@/lib/kpi";
import { cn } from "@/lib/utils";
import { useDemoMode } from "@/lib/demoMode";
import { DEMO_WEEKS, demoOpenJobs } from "@/lib/demoData";

export const Route = createFileRoute("/_authenticated/open-jobs")({ component: OpenJobsPage });

const AGE_BUCKETS = [
  { value: "all", label: "All ages" },
  { value: "0-7", label: "0–7 days" },
  { value: "8-14", label: "8–14 days" },
  { value: "15-30", label: "15–30 days" },
  { value: "30+", label: "30+ days" },
];

function inBucket(age: number | null | undefined, bucket: string) {
  if (bucket === "all") return true;
  if (age == null) return false;
  if (bucket === "0-7") return age <= 7;
  if (bucket === "8-14") return age >= 8 && age <= 14;
  if (bucket === "15-30") return age >= 15 && age <= 30;
  if (bucket === "30+") return age > 30;
  return true;
}

function ageBadge(age: number | null | undefined) {
  if (age == null) return "bg-muted text-muted-foreground";
  if (age <= 7) return "bg-success/15 text-success";
  if (age <= 14) return "bg-warning/15 text-warning";
  return "bg-destructive/15 text-destructive";
}

function OpenJobsPage() {
  const demoMode = useDemoMode();
  const weeksQ = useQuery({
    queryKey: ["open_jobs_weeks", demoMode],
    queryFn: async () => {
      if (demoMode) return DEMO_WEEKS;
      const { data } = await supabase.from("open_jobs").select("week_start").order("week_start", { ascending: false });
      return Array.from(new Set((data ?? []).map((r: any) => r.week_start as string)));
    },
  });
  const [week, setWeek] = useState<string | null>(null);
  const selectedWeek = week ?? weeksQ.data?.[0] ?? null;

  const jobsQ = useQuery({
    queryKey: ["open_jobs", selectedWeek, demoMode],
    queryFn: async () => {
      if (!selectedWeek) return [];
      if (demoMode) return demoOpenJobs(selectedWeek);
      const { data } = await supabase.from("open_jobs").select("*").eq("week_start", selectedWeek).order("customer_name");
      return data ?? [];
    },
    enabled: !!selectedWeek,
  });

  const [selectedCust, setSelectedCust] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [techFilter, setTechFilter] = useState<string>("all");
  const [ageFilter, setAgeFilter] = useState<string>("all");

  const grouped = useMemo(() => {
    const map = new Map<string, { key: string; name: string; jobs: any[] }>();
    for (const j of jobsQ.data ?? []) {
      const key = j.customer_key;
      if (!map.has(key)) map.set(key, { key, name: j.customer_name, jobs: [] });
      map.get(key)!.jobs.push(j);
    }
    let list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q.toLowerCase()));
    return list;
  }, [jobsQ.data, q]);

  const currentCust = grouped.find(c => c.key === selectedCust) ?? grouped[0];

  const statusOptions = useMemo(() => {
    const s = new Set<string>();
    for (const j of jobsQ.data ?? []) if (j.status) s.add(j.status);
    return Array.from(s).sort();
  }, [jobsQ.data]);
  const techOptions = useMemo(() => {
    const s = new Set<string>();
    for (const j of jobsQ.data ?? []) if (j.technician) s.add(j.technician);
    return Array.from(s).sort();
  }, [jobsQ.data]);

  const filteredJobs = useMemo(() => {
    const jobs = currentCust?.jobs ?? [];
    return jobs.filter(j =>
      (statusFilter === "all" || j.status === statusFilter) &&
      (techFilter === "all" || j.technician === techFilter) &&
      inBucket(j.age_days, ageFilter)
    );
  }, [currentCust, statusFilter, techFilter, ageFilter]);

  const totalJobs = (jobsQ.data ?? []).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Open Jobs</h1>
          <p className="text-sm text-muted-foreground mt-1">{totalJobs} open jobs across {grouped.length} customers — grouped from the latest upload.</p>
        </div>
        <Select value={selectedWeek ?? ""} onValueChange={setWeek}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select week" /></SelectTrigger>
          <SelectContent>{(weeksQ.data ?? []).map(w => <SelectItem key={w} value={w}>Week of {formatWeek(w)}</SelectItem>)}</SelectContent>
        </Select>
      </header>

      {!selectedWeek || (jobsQ.data ?? []).length === 0 ? (
        <Card className="p-8 text-center border-dashed">
          <Briefcase className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Upload an Open Jobs report to see customer-grouped jobs here.</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-[300px_1fr] gap-6">
          <Card className="p-4">
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer…" className="pl-9" />
            </div>
            <div className="space-y-1 max-h-[640px] overflow-auto">
              {grouped.map(c => (
                <button key={c.key} onClick={() => setSelectedCust(c.key)}
                  className={cn("w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                    currentCust?.key === c.key ? "bg-primary/10 text-foreground" : "hover:bg-muted")}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.jobs.length}</span>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <div className="px-6 py-4 border-b space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h2 className="font-display text-lg font-semibold">{currentCust?.name ?? "—"}</h2>
                  <p className="text-xs text-muted-foreground">{filteredJobs.length} of {currentCust?.jobs.length ?? 0} open jobs</p>
                </div>
                {currentCust && (
                  <Button size="sm" variant="outline" onClick={() => downloadXlsx(
                    filteredJobs.map(j => ({ Job: j.job_no, Ticket: j.ticket_no, Address: j.address, Status: j.status, Age: j.age_days, Technician: j.technician, Notes: j.notes, LastActivity: j.last_activity })),
                    `${currentCust.name}-open-jobs.xlsx`
                  )}>
                    <Download className="w-4 h-4 mr-2" />Download
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {statusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={techFilter} onValueChange={setTechFilter}>
                  <SelectTrigger><SelectValue placeholder="Technician" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All technicians</SelectItem>
                    {techOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={ageFilter} onValueChange={setAgeFilter}>
                  <SelectTrigger><SelectValue placeholder="Aging" /></SelectTrigger>
                  <SelectContent>
                    {AGE_BUCKETS.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Job #</th>
                  <th className="text-left px-4 py-3 font-medium">Address</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Age</th>
                  <th className="text-left px-4 py-3 font-medium">Technician</th>
                  <th className="text-left px-4 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((j: any) => (
                  <tr key={j.id} className="border-t">
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                      {j.job_no ?? j.ticket_no ?? "—"}
                      {j.ticket_no && j.job_no && <div className="text-xs text-muted-foreground">#{j.ticket_no}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground max-w-[240px] truncate">{j.address ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{j.status ?? j.order_type ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium", ageBadge(j.age_days))}>
                        {j.age_days != null ? `${j.age_days}d` : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{j.technician ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[240px] truncate">{j.notes ?? j.last_activity ?? "—"}</td>
                  </tr>
                ))}
                {filteredJobs.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">No jobs match these filters.</td></tr>
                )}
              </tbody>
            </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
