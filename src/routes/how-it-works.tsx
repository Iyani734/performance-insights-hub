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
    source: "Total Cycle Time export. The file name must include total cycle time.",
    formula: "business days from the oldest Deliver/Pickup date to today, excluding weekends",
    columns: ["Column J: Deliver/Pickup"],
    why: "The app sorts Deliver/Pickup dates from oldest to newest, uses the oldest date, then counts business days through the current day.",
  },
  {
    key: "review_to_final_edit",
    label: "Tickets QC'd - Review to Final Edit",
    target: "QC row count",
    source: "Ticket QC export. The file name must include QC.",
    formula: "total imported data rows in the QC file",
    columns: ["Any ticket rows"],
    why: "For now this metric displays the number of tickets in the QC file. The earlier percentage calculation is no longer used.",
  },
  {
    key: "ticket_quality",
    label: "Ticket Quality",
    target: "< 3%",
    source: "Manual entry or a future dedicated quality issue source",
    formula: "quality issue count / total invoiced tickets x 100",
    columns: ["Void Reason", "Driver Error", "Quality Issue"],
    why: "The ARC metric is a quality-error rate, so lower is better. The current Active/Review/Final, QC, and Total Cycle Time files do not calculate this automatically.",
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
    source: "Active/Review/Final export. The file name must include active, review, and final.",
    formula:
      "count Status values in column F: A is Active, E or R is Review, and F is Final Edit",
    columns: ["Column F: Status"],
    why: "This gives the dashboard and analytics snapshot directly from the Active/Review/Final source file.",
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
            Performance Tracker now reads each automatic metric from a specific source file name and
            marks the remaining operations metrics as manual.
          </p>
        </header>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-5">
            <Upload className="w-5 h-5 text-primary mb-2" />
            <div className="font-medium">1. Upload the exports</div>
            <p className="text-sm text-muted-foreground mt-1">
              Use file names containing active review final, QC, total cycle time, or open jobs so
              rows go into the right calculation group.
            </p>
          </Card>
          <Card className="p-5">
            <Calculator className="w-5 h-5 text-primary mb-2" />
            <div className="font-medium">2. Automatic KPIs run</div>
            <p className="text-sm text-muted-foreground mt-1">
              The dashboard uses the selected From and To dates to choose matching uploads. Total
              Cycle Time then counts business days through today.
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
            The parser reads a single sheet with a header row. Active/Review/Final expects Status in
            column F, and Total Cycle Time expects Deliver/Pickup in column J.
          </p>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-medium mb-1">Active/Review/Final, Ticket QC, Total Cycle Time</div>
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
                  Active/Review/Final uses column F <code>Status</code>
                </li>
                <li>
                  Total Cycle Time uses column J <code>Deliver/Pickup</code>
                </li>
                <li>
                  Ticket QC uses the total imported data rows
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
