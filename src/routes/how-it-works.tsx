import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileSpreadsheet, Calculator, Upload, Mail } from "lucide-react";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How KPIs Are Calculated - Performance Tracker" },
      {
        name: "description",
        content:
          "Learn how each operational KPI is computed from ARC TCR exports and manual quality tracking.",
      },
    ],
  }),
  component: HowItWorks,
});

type MetricSpec = {
  key: string;
  label: string;
  target: string;
  source: string;
  formula: string;
  columns: string[];
  why: string;
};

const METRICS: MetricSpec[] = [
  {
    key: "invoice_cycle_time",
    label: "Invoice Cycle Time (Final Edit to Invoice)",
    target: "<= 3 days",
    source: "Total Tickets export filtered to Final Edit",
    formula: "business days from oldest Final Edit Deliver/Pickup date to selected To date",
    columns: ["Status", "Deliver/Pickup"],
    why: "This follows the ARC TCR instruction: select Final Edit, sort by Deliver/Pickup, then count business days back to the oldest date. June 10 to June 17 counts as 5 business days.",
  },
  {
    key: "review_to_final_edit",
    label: "Tickets Moving Through - Review to Final Edit",
    target: ">= 95%",
    source: "Total Tickets export",
    formula: "count(tickets in Final Edit status) / count(all tickets) x 100",
    columns: ["Status", "Date Final Edited", "Final Edited By", "FinalEditedBy"],
    why: "Matches the TCR workflow: count weekly tickets, then count tickets completed through Final Edit. If Date Final Edited exists, the app uses it for the selected range; otherwise it uses Status F/Final Edit.",
  },
  {
    key: "ticket_quality",
    label: "Ticket Quality",
    target: "< 3%",
    source: "Total Invoiced export plus billing quality issue tracking",
    formula: "quality issue count / total invoiced tickets x 100",
    columns: ["Void Reason", "Driver Error", "Quality Issue"],
    why: "The ARC metric is a quality-error rate, so lower is better. When the upload contains a quality flag such as Void Reason, the app counts it automatically; otherwise the invoicing quality tracker/manual entry supplies the issue count.",
  },
  {
    key: "dispatch_responsiveness",
    label: "Team Responsiveness (within 1 hour)",
    target: ">= 95%",
    source: "Manual entry",
    formula: "requests answered within 1 hour / all requests x 100",
    columns: [],
    why: "The ARC document says the remaining service-quality metrics are managed manually unless the matching request/response source file is supplied.",
  },
  {
    key: "driver_safety",
    label: "Safety",
    target: "<= 20",
    source: "Manual entry",
    formula: "manager-entered safety event count for the selected month",
    columns: [],
    why: "Safety violations, including speeding violations, are tracked outside the TCR ticket export.",
  },
  {
    key: "incomplete_tickets",
    label: "Incomplete Tickets",
    target: "<= 10",
    source: "Manual entry",
    formula: "count tickets missing labor times, internal notes, or required completion details",
    columns: ["Labor Time", "Internal Notes"],
    why: "The current TCR ticket export does not consistently include every field needed to detect incomplete tickets automatically.",
  },
  {
    key: "missed_jobs",
    label: "Missed Jobs / Late Jobs / Client Callbacks / Reworks",
    target: "<= 1",
    source: "Manual entry",
    formula: "missed jobs + late jobs + client callbacks + reworks for the selected month",
    columns: [],
    why: "These exceptions are tracked by operations because some missed jobs do not create a ticket row.",
  },
  {
    key: "status_snapshot",
    label: "Ticket Status Snapshot",
    target: "No target",
    source: "Total Tickets export",
    formula:
      "count Status values matching Active, Review, and Final Edit; codes A, R, and F are recognized",
    columns: ["Status"],
    why: "This gives the dashboard snapshot of active, review, and final-edit tickets from the uploaded TCR data.",
  },
];

function HowItWorks() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 md:p-10 space-y-8">
        <div className="flex items-center justify-between">
          <Link to="/auth">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </Link>
          <Link to="/auth">
            <Button size="sm">Sign in</Button>
          </Link>
        </div>

        <header className="space-y-3">
          <h1 className="font-display text-4xl font-semibold">How the KPIs are calculated</h1>
          <p className="text-muted-foreground">
            Performance Tracker follows the ARC TCR workflow where the export has enough data, and
            marks the remaining operations metrics as manual.
          </p>
        </header>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-5">
            <Upload className="w-5 h-5 text-primary mb-2" />
            <div className="font-medium">1. Upload the exports</div>
            <p className="text-sm text-muted-foreground mt-1">
              Use the report type selector so Total Tickets, Total Invoiced, and Open Jobs rows go
              into the right calculation group.
            </p>
          </Card>
          <Card className="p-5">
            <Calculator className="w-5 h-5 text-primary mb-2" />
            <div className="font-medium">2. Automatic KPIs run</div>
            <p className="text-sm text-muted-foreground mt-1">
              The dashboard uses the selected From and To dates, with the To date acting as the
              report date for invoice cycle time.
            </p>
          </Card>
          <Card className="p-5">
            <Mail className="w-5 h-5 text-primary mb-2" />
            <div className="font-medium">3. Customer updates continue</div>
            <p className="text-sm text-muted-foreground mt-1">
              Open-job reports are grouped by customer and prepared from the uploaded open-jobs
              data.
            </p>
          </Card>
        </div>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <FileSpreadsheet className="w-4 h-4" />
            <h2 className="font-display text-lg font-semibold">Expected upload columns</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            The parser reads a single sheet with a header row. Column order does not matter, but the
            header names should match the TCR export.
          </p>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-medium mb-1">Total Tickets / Total Invoiced</div>
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                <li>
                  <code>Ticket #</code> or <code>TicketID</code>
                </li>
                <li>
                  <code>Customer ID</code>, <code>Customer</code>
                </li>
                <li>
                  <code>OrderType</code>, <code>Order Category</code>, <code>Status</code>
                </li>
                <li>
                  <code>Job #</code>, <code>Type</code>, <code>City</code>
                </li>
                <li>
                  <code>Deliver/Pickup</code>, <code>Rental Start</code>, <code>Date Recv</code>
                </li>
                <li>
                  <code>Date Final Edited</code>, when exported
                </li>
                <li>
                  <code>Final Edited By</code> / <code>FinalEditedBy</code>
                </li>
                <li>
                  <code>Void Reason</code>, when used as a quality flag
                </li>
              </ul>
            </div>
            <div>
              <div className="font-medium mb-1">Open Jobs (optional)</div>
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                <li>
                  <code>Customer</code> / <code>Customer ID</code>
                </li>
                <li>
                  <code>Job #</code>, <code>Ticket #</code>
                </li>
                <li>
                  <code>Order Type</code>, <code>Address</code>, <code>Status</code>
                </li>
                <li>
                  <code>Age</code>, <code>Technician</code>, <code>Notes</code>
                </li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                Also supports the grouped "Customer: KEY - Name" section layout.
              </p>
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">Metric by metric</h2>
          <div className="space-y-3">
            {METRICS.map((m) => (
              <Card key={m.key} className="p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-lg font-semibold">{m.label}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    Target {m.target}
                  </span>
                </div>
                <div className="grid md:grid-cols-3 gap-4 mt-3 text-sm">
                  <div>
                    <div className="text-xs uppercase text-muted-foreground tracking-wide">
                      Source
                    </div>
                    <div>{m.source}</div>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs uppercase text-muted-foreground tracking-wide">
                      Formula
                    </div>
                    <code className="text-xs bg-muted/60 px-2 py-1 rounded inline-block mt-1">
                      {m.formula}
                    </code>
                  </div>
                </div>
                {m.columns.length > 0 && (
                  <div className="mt-3 text-sm">
                    <span className="text-xs uppercase text-muted-foreground tracking-wide mr-2">
                      Columns used:
                    </span>
                    {m.columns.map((c) => (
                      <code key={c} className="text-xs bg-muted/60 px-1.5 py-0.5 rounded mr-1">
                        {c}
                      </code>
                    ))}
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-3">{m.why}</p>
              </Card>
            ))}
          </div>
        </div>

        <Card className="p-6 bg-primary/5 border-primary/20">
          <h3 className="font-display text-lg font-semibold mb-2">Want to see it in action?</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Load the demo workspace with realistic operational data.
          </p>
          <Link to="/auth">
            <Button>Open the demo dashboard</Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
