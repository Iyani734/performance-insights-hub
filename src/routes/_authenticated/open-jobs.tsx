import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, Search, Briefcase } from "lucide-react";
import { downloadXlsx } from "@/lib/parse";
import { cn } from "@/lib/utils";
import { useDemoMode } from "@/lib/demoMode";
import { DEMO_CURRENT_WEEK, demoOpenJobs } from "@/lib/demoData";
import { fetchLatestOpenJobsRows } from "@/lib/openJobsData";
import {
  openJobCustomerKey,
  openJobCustomerName,
  openJobDetailValue,
  openJobReportRow,
  sortOpenJobsBySourceOrder,
  UNKNOWN_OPEN_JOB_CUSTOMER_NAME,
} from "@/lib/openJobs";

export const Route = createFileRoute("/_authenticated/open-jobs")({ component: OpenJobsPage });

function OpenJobsPage() {
  const demoMode = useDemoMode();
  const jobsQ = useQuery({
    queryKey: ["open_jobs_current_snapshot", demoMode],
    queryFn: async () => {
      if (demoMode) {
        return {
          upload: {
            file_name: "demo-open-jobs.xlsx",
            created_at: new Date().toISOString(),
            week_start: DEMO_CURRENT_WEEK,
          },
          rows: demoOpenJobs(DEMO_CURRENT_WEEK),
        };
      }
      return fetchLatestOpenJobsRows();
    },
  });
  const jobs = jobsQ.data?.rows ?? [];
  const latestUpload = jobsQ.data?.upload ?? null;

  const [selectedCust, setSelectedCust] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [jobIdFilter, setJobIdFilter] = useState("");
  const [poFilter, setPoFilter] = useState("");

  const sortedJobs = useMemo(() => sortOpenJobsBySourceOrder(jobs), [jobs]);

  const groupedAll = useMemo(() => {
    const map = new Map<string, { key: string; name: string; jobs: any[] }>();
    for (const job of sortedJobs) {
      const key = openJobCustomerKey(job);
      const name = openJobCustomerName(job);
      if (!map.has(key)) map.set(key, { key, name, jobs: [] });
      map.get(key)!.jobs.push(job);
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.name === UNKNOWN_OPEN_JOB_CUSTOMER_NAME && b.name !== UNKNOWN_OPEN_JOB_CUSTOMER_NAME) return 1;
      if (b.name === UNKNOWN_OPEN_JOB_CUSTOMER_NAME && a.name !== UNKNOWN_OPEN_JOB_CUSTOMER_NAME) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [sortedJobs]);

  const grouped = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return groupedAll;
    return groupedAll.filter(
      (customer) =>
        customer.name.toLowerCase().includes(q) ||
        customer.key.toLowerCase().includes(q),
    );
  }, [customerQuery, groupedAll]);

  const currentCust = selectedCust ? groupedAll.find((customer) => customer.key === selectedCust) ?? null : null;
  const activeJobs = currentCust ? currentCust.jobs : sortedJobs;

  const filteredJobs = useMemo(() => {
    const jobNeedle = jobIdFilter.trim().toLowerCase();
    const poNeedle = poFilter.trim().toLowerCase();

    return activeJobs.filter((job) => {
      const jobId = String(openJobDetailValue(job, "job_id_job_ref", job.job_no) ?? "").toLowerCase();
      const purchaseOrder = String(
        openJobDetailValue(
          job,
          "purchase_order_customer_job_lines",
          openJobDetailValue(job, "purchase_order_customer_job", job.ticket_no),
        ) ?? "",
      ).toLowerCase();

      return (!jobNeedle || jobId.includes(jobNeedle)) && (!poNeedle || purchaseOrder.includes(poNeedle));
    });
  }, [activeJobs, jobIdFilter, poFilter]);

  const totalJobs = sortedJobs.length;
  const totalCustomers = groupedAll.length;
  const viewTitle = currentCust ? currentCust.name : "All open jobs";
  const viewCount = currentCust ? currentCust.jobs.length : sortedJobs.length;

  function downloadCurrentView() {
    downloadXlsx(
      filteredJobs.map((job) => openJobReportRow(job, { includeCustomer: true })),
      `${currentCust ? currentCust.name : "all"}-open-jobs.xlsx`,
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Open Jobs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalJobs} open jobs across {totalCustomers} customers from the current upload.
          </p>
        </div>
        {latestUpload?.file_name && (
          <div className="text-right text-xs text-muted-foreground">
            <div className="font-medium text-foreground">{latestUpload.file_name}</div>
            {latestUpload.created_at ? <div>{new Date(latestUpload.created_at).toLocaleString()}</div> : null}
          </div>
        )}
      </header>

      {jobs.length === 0 ? (
        <Card className="border-dashed p-8 text-center">
          <Briefcase className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Upload an Open Jobs report to see customer-grouped jobs here.</p>
        </Card>
      ) : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="p-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={customerQuery}
                onChange={(event) => setCustomerQuery(event.target.value)}
                placeholder="Search customers..."
                className="pl-9"
              />
            </div>
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setSelectedCust(null)}
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                  !currentCust ? "bg-primary/10 text-foreground" : "hover:bg-muted",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">All jobs</span>
                  <span className="text-xs text-muted-foreground">{totalJobs}</span>
                </div>
              </button>
            </div>
            <div className="max-h-[640px] space-y-1 overflow-auto pr-1">
              {grouped.map((customer) => (
                <button
                  key={customer.key}
                  type="button"
                  onClick={() => setSelectedCust(customer.key)}
                  className={cn(
                    "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                    currentCust?.key === customer.key ? "bg-primary/10 text-foreground" : "hover:bg-muted",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-medium">{customer.name}</span>
                    <span className="text-xs text-muted-foreground">{customer.jobs.length}</span>
                  </div>
                  {customer.name === UNKNOWN_OPEN_JOB_CUSTOMER_NAME && (
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-warning">
                      No customer name in upload
                    </div>
                  )}
                </button>
              ))}
              {grouped.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No customers match that search.
                </div>
              )}
            </div>
          </Card>

          <Card className="min-w-0 overflow-hidden">
            <div className="space-y-3 border-b px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold">{viewTitle}</h2>
                  <p className="text-xs text-muted-foreground">
                    {filteredJobs.length} of {viewCount} open jobs
                    {!currentCust ? " with customer shown on each row" : ""}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={downloadCurrentView}>
                  <Download className="mr-2 h-4 w-4" />Download
                </Button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={jobIdFilter}
                    onChange={(event) => setJobIdFilter(event.target.value)}
                    placeholder="Filter by job ID"
                    className="pl-9"
                  />
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={poFilter}
                    onChange={(event) => setPoFilter(event.target.value)}
                    placeholder="Filter by purchase order / customer job"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
            <div className="max-w-full overflow-x-auto">
              <table className="min-w-[1180px] text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Customer</th>
                    <th className="px-4 py-3 text-left font-medium">Job ID / Job Ref.</th>
                    <th className="px-4 py-3 text-left font-medium">Purchase Order # / Customer Job#</th>
                    <th className="px-4 py-3 text-left font-medium">Srv Int</th>
                    <th className="px-4 py-3 text-left font-medium">Zone</th>
                    <th className="px-4 py-3 text-left font-medium">Opened / First Ticket</th>
                    <th className="px-4 py-3 text-left font-medium">Last Ticket</th>
                    <th className="px-4 py-3 text-left font-medium">Job Address/City</th>
                    <th className="px-4 py-3 text-left font-medium">Foreman</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map((job: any) => {
                    const customerName = openJobCustomerName(job);
                    return (
                      <tr key={job.id} className="border-t">
                        <td className="px-4 py-2.5">
                          <div className="font-medium">
                            {customerName === UNKNOWN_OPEN_JOB_CUSTOMER_NAME ? (
                              <span className="rounded bg-warning/15 px-2 py-0.5 text-warning">Unknown</span>
                            ) : (
                              customerName
                            )}
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground">{openJobCustomerKey(job)}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium">
                          {openJobDetailValue(job, "job_id_job_ref", job.job_no) ?? "-"}
                        </td>
                        <td className="max-w-[260px] whitespace-pre-line px-4 py-2.5 text-muted-foreground">
                          {openJobDetailValue(
                            job,
                            "purchase_order_customer_job_lines",
                            openJobDetailValue(job, "purchase_order_customer_job", job.ticket_no),
                          ) ?? "-"}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{openJobDetailValue(job, "srv_int", job.order_type) ?? "-"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{openJobDetailValue(job, "zone", job.status) ?? "-"}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                          {openJobDetailValue(job, "opened_first_ticket_lines", openJobDetailValue(job, "opened_first_ticket")) ?? "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                          {openJobDetailValue(job, "last_ticket", job.last_activity) ?? "-"}
                        </td>
                        <td className="max-w-[300px] whitespace-pre-line px-4 py-2.5 text-muted-foreground">
                          {openJobDetailValue(
                            job,
                            "job_address_city_lines",
                            openJobDetailValue(job, "job_address_city", job.address),
                          ) ?? "-"}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{openJobDetailValue(job, "foreman", job.technician) ?? "-"}</td>
                      </tr>
                    );
                  })}
                  {filteredJobs.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                        No jobs match these filters.
                      </td>
                    </tr>
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
