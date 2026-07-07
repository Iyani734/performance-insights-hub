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

export const Route = createFileRoute("/_authenticated/open-jobs")({ component: OpenJobsPage });

function OpenJobsPage() {
  const weeksQ = useQuery({
    queryKey: ["open_jobs_weeks"],
    queryFn: async () => {
      const { data } = await supabase.from("open_jobs").select("week_start").order("week_start", { ascending: false });
      return Array.from(new Set((data ?? []).map((r: any) => r.week_start as string)));
    },
  });
  const [week, setWeek] = useState<string | null>(null);
  const selectedWeek = week ?? weeksQ.data?.[0] ?? null;

  const jobsQ = useQuery({
    queryKey: ["open_jobs", selectedWeek],
    queryFn: async () => {
      if (!selectedWeek) return [];
      const { data } = await supabase.from("open_jobs").select("*").eq("week_start", selectedWeek).order("customer_name");
      return data ?? [];
    },
    enabled: !!selectedWeek,
  });

  const [selectedCust, setSelectedCust] = useState<string | null>(null);
  const [q, setQ] = useState("");

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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Open Jobs</h1>
          <p className="text-sm text-muted-foreground mt-1">Jobs grouped by customer from the latest Open Jobs upload.</p>
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
        <div className="grid md:grid-cols-[320px_1fr] gap-6">
          <Card className="p-4">
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer…" className="pl-9" />
            </div>
            <div className="space-y-1 max-h-[560px] overflow-auto">
              {grouped.map(c => (
                <button key={c.key} onClick={() => setSelectedCust(c.key)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${currentCust?.key === c.key ? "bg-primary/10 text-foreground" : "hover:bg-muted"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.jobs.length}</span>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">{currentCust?.name ?? "—"}</h2>
                <p className="text-xs text-muted-foreground">{currentCust?.jobs.length ?? 0} open jobs</p>
              </div>
              {currentCust && (
                <Button size="sm" variant="outline" onClick={() => downloadXlsx(
                  currentCust.jobs.map(j => ({ Job: j.job_no, Ticket: j.ticket_no, Type: j.order_type, LastActivity: j.last_activity })),
                  `${currentCust.name}-open-jobs.xlsx`
                )}>
                  <Download className="w-4 h-4 mr-2" />Download
                </Button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Job #</th>
                  <th className="text-left px-6 py-3 font-medium">Ticket</th>
                  <th className="text-left px-6 py-3 font-medium">Type</th>
                  <th className="text-left px-6 py-3 font-medium">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {(currentCust?.jobs ?? []).map((j: any) => (
                  <tr key={j.id} className="border-t">
                    <td className="px-6 py-2.5 font-medium">{j.job_no ?? "—"}</td>
                    <td className="px-6 py-2.5 text-muted-foreground">{j.ticket_no ?? "—"}</td>
                    <td className="px-6 py-2.5 text-muted-foreground">{j.order_type ?? "—"}</td>
                    <td className="px-6 py-2.5 text-muted-foreground truncate max-w-[420px]">{j.last_activity ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
