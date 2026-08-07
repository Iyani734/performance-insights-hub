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
    label: "Tickets QC'd - Review to Final Edit",
    owner: "Dispatch",
    cadence: "Weekly",
    target: ">= 95%",
    source: "Ticket QC uploads. The file names must include TicketQC REVIEW and TicketQC FINAL.",
    formula: "TicketQC FINAL imported rows / TicketQC REVIEW imported rows x 100.",
    columns: ["TicketQC REVIEW rows", "TicketQC FINAL rows"],
    note: "The header rows are not counted. The KPI stays blank until both Review and Final files exist for the selected date range.",
  },
  {
    label: "Ticket Quality",
    owner: "Dispatch/Drivers",
    cadence: "Monthly",
    target: "< 3%",
    source: "Ticket Quality and TCR Total uploads. File names must include Ticket Quality or TCR Total.",
    formula: "Ticket Quality error rows / TCR Total rows x 100.",
    columns: ["Ticket Quality: data rows", "TCR Total: data rows"],
    note: "Lower is better. The sample files calculate as 14 Ticket Quality rows / 1,246 TCR Total rows = 1.1%.",
  },
  {
    label: "Quality Issues",
    owner: "Dispatch/Drivers",
    cadence: "Monthly",
    target: "Supporting count",
    source: "Ticket Quality upload. The file name must include Ticket Quality.",
    formula: "Count imported data rows in the Ticket Quality file.",
    columns: ["Ticket Quality: data rows"],
    note: "This is the numerator behind Ticket Quality.",
  },
  {
    label: "Invoice Cycle Time (Final Edit to Invoice)",
    owner: "Invoicing",
    cadence: "Weekly",
    target: "<= 3 days",
    source: "Invoice Cycle Time uploads. The file name must include invoice cycle time or total cycle time.",
    formula:
      "Business days from the oldest Deliver/Pickup date in the file to today, excluding weekends.",
    columns: ["Column J: Deliver/Pickup"],
    note: "The app sorts Deliver/Pickup dates from oldest to newest, uses the oldest date, then counts business days through the current day.",
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
    source: "Active/Review/Final uploads. The file name must include active, review, and final.",
    formula:
      "Count Status values in column F: A is Active, E or R is Review, and F is Final Edit.",
    columns: ["Column F: Status"],
    note: "The dashboard and analytics use only the Active/Review/Final source file for these status buckets.",
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
            now use specific source files identified by file name; each manual KPI names the source
            fields still required for automation.
          </p>
        </div>
        <div className="border-l-0 md:border-l md:pl-4">
          <div className="flex items-center gap-2 text-primary">
            <FileSpreadsheet className="h-5 w-5" />
            <span className="text-sm font-medium">Upload rule</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            The file name determines the calculation. Use names containing active review final,
            TicketQC REVIEW, TicketQC FINAL, Ticket Quality, TCR Total, invoice cycle time,
            total cycle time, or open jobs; the selected report type must match the file name.
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
