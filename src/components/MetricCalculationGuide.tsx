import { Calculator, FileSpreadsheet, PencilLine } from "lucide-react";
import { Card } from "@/components/ui/card";

type MetricDefinition = {
  label: string;
  source: string;
  formula: string;
  columns: string[];
  note: string;
};

const METRICS: MetricDefinition[] = [
  {
    label: "Total Tickets",
    source: "Total Tickets uploads",
    formula: "Count all stored ticket rows whose upload bucket falls in the selected dashboard date range.",
    columns: [],
    note: "This is the current value behind the Active Tickets card. It is a total count and does not filter by ticket Status.",
  },
  {
    label: "Tickets Invoiced",
    source: "Total Invoiced uploads",
    formula: "Count all stored invoiced rows whose upload bucket falls in the selected dashboard date range.",
    columns: [],
    note: "Each row is counted once after it is uploaded as Total Invoiced.",
  },
  {
    label: "Voided",
    source: "Total Tickets uploads",
    formula: "Count tickets where Void Reason is populated.",
    columns: ["Void Reason"],
    note: "A blank Void Reason is not counted as a void.",
  },
  {
    label: "Review -> Final Edit %",
    source: "Total Tickets uploads",
    formula: "Tickets with Final Edited By or FinalEditedBy populated / all tickets x 100.",
    columns: ["Final Edited By", "FinalEditedBy"],
    note: "The export does not include a separate review-status field, so this measures final-edit completion.",
  },
  {
    label: "Dispatch Completion %",
    source: "Total Tickets uploads",
    formula: "Tickets with a blank Void Reason / all tickets x 100.",
    columns: ["Void Reason"],
    note: "This is currently a not-voided rate. It is not a separate dispatch-status calculation.",
  },
  {
    label: "Ticket Quality %",
    source: "Total Invoiced uploads",
    formula: "Invoiced rows with a blank Void Reason / all invoiced rows x 100.",
    columns: ["Void Reason"],
    note: "Higher is better. A populated Void Reason is counted separately as a quality issue.",
  },
  {
    label: "Quality Issues",
    source: "Total Invoiced uploads",
    formula: "Count invoiced rows where Void Reason is populated.",
    columns: ["Void Reason"],
    note: "This is the count behind the Quality Issues card and the rows excluded from Ticket Quality %.",
  },
  {
    label: "Invoice Cycle Time",
    source: "Total Invoiced uploads",
    formula: "Average number of days from Date Recv to the day after the selected end date.",
    columns: ["Date Recv"],
    note: "Rows without a valid Date Recv are excluded from the average.",
  },
  {
    label: "Incomplete Tickets %",
    source: "Derived from Dispatch Completion",
    formula: "100 - Dispatch Completion %.",
    columns: ["Void Reason"],
    note: "It is the inverse of the current not-voided dispatch measure.",
  },
  {
    label: "Driver Safety Violations",
    source: "Manual entry",
    formula: "A manager-entered count for the selected date range.",
    columns: [],
    note: "No ticket-export column currently supplies this value.",
  },
  {
    label: "Missed Jobs",
    source: "Manual entry",
    formula: "A manager-entered count for the selected date range.",
    columns: [],
    note: "No ticket-export column currently supplies this value.",
  },
  {
    label: "Dispatch Responsiveness",
    source: "Manual entry",
    formula: "A manager-entered average number of hours for the selected date range.",
    columns: [],
    note: "This needs request and dispatch timestamps that are not present in the current exports.",
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
            These are the current live definitions for dashboard values. Automatic calculations use the selected dashboard date range and the report type chosen during upload. Ticket dates inside the workbook are not yet used as the dashboard filter.
          </p>
        </div>
        <div className="border-l-0 md:border-l md:pl-4">
          <div className="flex items-center gap-2 text-primary">
            <FileSpreadsheet className="h-5 w-5" />
            <span className="text-sm font-medium">Upload rule</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            A file name does not determine the calculation. Choose Total Tickets or Total Invoiced before uploading so its rows are stored in the correct calculation group.
          </p>
        </div>
      </section>

      <section className="space-y-3" aria-label="Metric calculation definitions">
        {METRICS.map((metric) => (
          <Card key={metric.label} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">{metric.label}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{metric.source}</p>
              </div>
              <PencilLine className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Calculation</div>
                <code className="mt-1 block whitespace-normal rounded-md bg-muted px-3 py-2 text-xs text-foreground">{metric.formula}</code>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Columns used</div>
                {metric.columns.length ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {metric.columns.map((column) => <code key={column} className="rounded bg-muted px-2 py-1 text-xs">{column}</code>)}
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
