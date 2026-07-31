import { Calculator, FileSpreadsheet, PencilLine } from "lucide-react";
import { Card } from "@/components/ui/card";

type MetricDefinition = {
  label: string;
  owner: string;
  cadence: string;
  target: string;
  source: string;
  formula: string;
  columns: string[];
  note: string;
};

const METRICS: MetricDefinition[] = [
  {
    label: "Tickets Moving Through - Review to Final Edit",
    owner: "Dispatch",
    cadence: "Weekly",
    target: ">= 95%",
    source: "Total Tickets uploads",
    formula:
      "Tickets in Final Edit status / all tickets x 100. If Date Final Edited exists, only rows final edited inside the selected range are counted.",
    columns: ["Status", "Date Final Edited", "Final Edited By", "FinalEditedBy"],
    note: "This follows the TCR process: count weekly tickets, then count tickets completed through Final Edit. If the export has no final-edit date, Status F/Final Edit is used; FinalEditedBy is only a fallback.",
  },
  {
    label: "Ticket Quality",
    owner: "Dispatch/Drivers",
    cadence: "Monthly",
    target: "< 3%",
    source: "Total Invoiced uploads plus the billing quality-issue tracker",
    formula: "Quality issue count / total invoiced tickets x 100.",
    columns: ["Void Reason", "Driver Error", "Quality Issue"],
    note: "Lower is better. The ARC document says the quality-issue count is tracked by the Invoicing team. When an upload includes a quality flag such as Void Reason, the app counts populated values automatically; otherwise enter the issue rate manually.",
  },
  {
    label: "Quality Issues",
    owner: "Dispatch/Drivers",
    cadence: "Monthly",
    target: "Supporting count",
    source: "Same source used for Ticket Quality",
    formula: "Count rows flagged as billing/ticket quality issues.",
    columns: ["Void Reason", "Driver Error", "Quality Issue"],
    note: "This is the numerator behind Ticket Quality and the Quality Issues dashboard count. The billing quality sheet remains the authoritative manual source when those columns are not in the upload.",
  },
  {
    label: "Invoice Cycle Time (Final Edit to Invoice)",
    owner: "Invoicing",
    cadence: "Weekly",
    target: "<= 3 days",
    source: "Total Tickets uploads filtered to Final Edit",
    formula:
      "Business days from the oldest Deliver/Pickup date in Final Edit to the selected Effective to date.",
    columns: ["Status", "Deliver/Pickup"],
    note: "This matches the TCR instructions: select Final Edit, sort by Deliver/Pickup, then count business days back to the oldest date. Example: Jun 10 to Jun 17 is 5 business days.",
  },
  {
    label: "Team Responsiveness (within 1 hour)",
    owner: "Dispatch Service Quality",
    cadence: "Daily",
    target: ">= 95%",
    source: "Manual entry until request and response timestamps are supplied",
    formula: "Requests responded to within 1 hour / all requests x 100.",
    columns: ["Request timestamp", "First response timestamp"],
    note: "The current exports do not contain both timestamps, so this is recorded manually for now.",
  },
  {
    label: "Safety",
    owner: "Drivers",
    cadence: "Monthly",
    target: "<= 20",
    source: "Manual entry",
    formula: "A manager-entered count for the selected date range.",
    columns: [],
    note: "Record the total safety events, including speeding violations, for the month.",
  },
  {
    label: "Incomplete Tickets",
    owner: "Drivers",
    cadence: "Monthly",
    target: "<= 10",
    source: "Manual entry until the required fields are supplied",
    formula: "Count tickets missing labour time or internal notes.",
    columns: ["Labour Time", "Internal Notes"],
    note: "The current exports do not consistently provide these columns, so the dashboard no longer treats a voided ticket as incomplete.",
  },
  {
    label: "Missed Jobs / Late Jobs / Client Callbacks / Reworks",
    owner: "Job Service Quality",
    cadence: "Monthly",
    target: "<= 1",
    source: "Manual entry",
    formula: "Missed jobs + late jobs + client callbacks + reworks for the selected month.",
    columns: [],
    note: "Record one total monthly count across these four job service quality categories.",
  },
  {
    label: "Ticket Status Snapshot",
    owner: "Dispatch",
    cadence: "Current view",
    target: "No target",
    source: "Total Tickets uploads",
    formula:
      "Count ticket Status values matching Active, Review, and Final Edit; codes A, R, and F are also recognized.",
    columns: ["Status"],
    note: "Active is Status A/Active, Review is Status R/Review, and Final Edit is Status F/Final Edit. The dashboard and analytics use those exact buckets from uploaded Total Tickets rows.",
  },
];

export function MetricCalculationGuide() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2 border-b pb-4 md:border-b-0 md:pb-0">
          <div className="flex items-center gap-2 text-primary">
            <Calculator className="h-5 w-5" />
            <span className="text-sm font-medium">Calculation definitions</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            These definitions align the dashboard to the Performance Tracker. Automatic calculations
            use the selected dashboard date range and the report type chosen during upload; each
            manual KPI names the source fields still required for automation.
          </p>
        </div>
        <div className="border-l-0 md:border-l md:pl-4">
          <div className="flex items-center gap-2 text-primary">
            <FileSpreadsheet className="h-5 w-5" />
            <span className="text-sm font-medium">Upload rule</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            A file name does not determine the calculation. Choose Total Tickets or Total Invoiced
            before uploading so its rows are stored in the correct calculation group.
          </p>
        </div>
      </section>

      <section className="space-y-3" aria-label="Metric calculation definitions">
        {METRICS.map((metric) => (
          <Card key={metric.label} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">{metric.label}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {metric.owner} · {metric.cadence} · Target {metric.target}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{metric.source}</p>
              </div>
              <PencilLine className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Calculation
                </div>
                <code className="mt-1 block whitespace-normal rounded-md bg-muted px-3 py-2 text-xs text-foreground">
                  {metric.formula}
                </code>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Columns used
                </div>
                {metric.columns.length ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {metric.columns.map((column) => (
                      <code key={column} className="rounded bg-muted px-2 py-1 text-xs">
                        {column}
                      </code>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">No upload column</p>
                )}
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{metric.note}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
