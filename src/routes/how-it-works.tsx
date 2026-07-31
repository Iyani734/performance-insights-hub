import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileSpreadsheet, Calculator, Upload, Mail } from "lucide-react";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How KPIs Are Calculated — Performance Tracker" },
      { name: "description", content: "Learn how each operational KPI is automatically computed from your weekly ticket exports." },
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
    key: "review_to_final_edit",
    label: "Review → Final Edit %",
    target: "≥ 95%",
    source: "Total Tickets export",
    formula: "count(tickets where Final Edited By is set) ÷ count(all tickets) × 100",
    columns: ["Final Edited By", "FinalEditedBy"],
    why: "Measures how consistently the dispatch team reviews every ticket before it closes.",
  },
  {
    key: "ticket_quality",
    label: "Ticket Quality %",
    target: "≤ 2%",
    source: "Total Invoiced export, or Total Tickets when no invoiced upload exists",
    formula: "count(rows where Void Reason is set) ÷ count(all rows in the quality source) × 100",
    columns: ["Void Reason"],
    why: "Void reasons flag tickets that had to be corrected. The calculator prefers invoiced rows, then falls back to ticket rows so the dispatch export can still populate quality.",
  },
  {
    key: "invoice_cycle_time",
    label: "Invoice Cycle Time (days)",
    target: "≤ 3 days",
    source: "Total Invoiced export; falls back to invoiced-status rows in Total Tickets",
    formula: "average of max(0, invoice date − final edit date), in calendar days",
    columns: ["Final Edit Date", "Invoice Date", "Date Recv", "Deliver/Pickup"],
    why: "Measures how quickly final-edited work becomes invoiced. The ARC export fallback uses Date Recv as the final-edit handoff date and Deliver/Pickup as the invoice/completion date.",
  },
  {
    key: "dispatch_completion",
    label: "Dispatch Completion %",
    target: "≥ 95%",
    source: "Total Tickets export",
    formula: "count(tickets where Void Reason is empty) ÷ count(all tickets) × 100",
    columns: ["Void Reason"],
    why: "The share of dispatched tickets that were completed without a void.",
  },
  {
    key: "incomplete_tickets",
    label: "Incomplete Tickets %",
    target: "≤ 2%",
    source: "Total Tickets export (derived)",
    formula: "100 − Dispatch Completion %",
    columns: ["Void Reason"],
    why: "The mirror of dispatch completion; used on customer-facing summaries.",
  },
  {
    key: "quality_issues",
    label: "Quality Issues %",
    target: "≤ 2%",
    source: "Same source used for Ticket Quality",
    formula: "Same rule as Ticket Quality — tracked separately for the ops scorecard.",
    columns: ["Void Reason"],
    why: "Kept as its own line so operations and billing can each own a target.",
  },
  {
    key: "driver_safety",
    label: "Driver Safety Violations",
    target: "≤ 10 per week",
    source: "Manual entry",
    formula: "Entered on the Dashboard from your safety report each week.",
    columns: [],
    why: "Safety data doesn't live in the ticket export, so managers key it in weekly.",
  },
  {
    key: "missed_jobs",
    label: "Missed Jobs",
    target: "0",
    source: "Manual entry",
    formula: "Entered on the Dashboard.",
    columns: [],
    why: "Missed jobs are logged by the on-call manager — no ticket is created for a no-show.",
  },
  {
    key: "dispatch_responsiveness",
    label: "Dispatch Responsiveness (h)",
    target: "≤ 2 h",
    source: "Manual entry",
    formula: "Average hours from customer request to dispatched ticket, entered on the Dashboard.",
    columns: [],
    why: "Requires call-log data that isn't in the ticket export today.",
  },
];

function HowItWorks() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 md:p-10 space-y-8">
        <div className="flex items-center justify-between">
          <Link to="/auth"><Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="w-4 h-4" />Back</Button></Link>
          <Link to="/auth"><Button size="sm">Sign in</Button></Link>
        </div>

        <header className="space-y-3">
          <h1 className="font-display text-4xl font-semibold">How the KPIs are calculated</h1>
          <p className="text-muted-foreground">
            Performance Tracker automates the weekly operations report. You upload two exports; the app extracts, cleans, and scores every metric.
          </p>
        </header>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-5">
            <Upload className="w-5 h-5 text-primary mb-2" />
            <div className="font-medium">1. Upload your weekly exports</div>
            <p className="text-sm text-muted-foreground mt-1">Two files: <strong>Total Tickets</strong> and <strong>Total Invoiced</strong>. Both are XLSX exports from your dispatch system.</p>
          </Card>
          <Card className="p-5">
            <Calculator className="w-5 h-5 text-primary mb-2" />
            <div className="font-medium">2. Metrics compute automatically</div>
            <p className="text-sm text-muted-foreground mt-1">Each KPI is derived from specific columns using the formulas below. No spreadsheets or macros.</p>
          </Card>
          <Card className="p-5">
            <Mail className="w-5 h-5 text-primary mb-2" />
            <div className="font-medium">3. Customer emails go out</div>
            <p className="text-sm text-muted-foreground mt-1">Open-job reports are grouped by customer and sent from the Emails page.</p>
          </Card>
        </div>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <FileSpreadsheet className="w-4 h-4" />
            <h2 className="font-display text-lg font-semibold">Expected upload columns</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            The parser reads a single sheet with a header row. Column order doesn't matter — only the header names.
          </p>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-medium mb-1">Total Tickets / Total Invoiced</div>
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                <li><code>Ticket #</code> or <code>TicketID</code></li>
                <li><code>Customer ID</code>, <code>Customer</code></li>
                <li><code>OrderType</code>, <code>Order Category</code>, <code>Status</code></li>
                <li><code>Job #</code>, <code>Type</code>, <code>City</code></li>
                <li><code>Rental Start</code>, <code>Date Recv</code></li>
                <li><code>Final Edited By</code> / <code>FinalEditedBy</code></li>
                <li><code>Void Reason</code></li>
              </ul>
            </div>
            <div>
              <div className="font-medium mb-1">Open Jobs (optional)</div>
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                <li><code>Customer</code> / <code>Customer ID</code></li>
                <li><code>Job #</code>, <code>Ticket #</code></li>
                <li><code>Order Type</code>, <code>Address</code>, <code>Status</code></li>
                <li><code>Age</code>, <code>Technician</code>, <code>Notes</code></li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">Also supports the grouped "Customer: KEY - Name" section layout.</p>
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
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Target {m.target}</span>
                </div>
                <div className="grid md:grid-cols-3 gap-4 mt-3 text-sm">
                  <div>
                    <div className="text-xs uppercase text-muted-foreground tracking-wide">Source</div>
                    <div>{m.source}</div>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs uppercase text-muted-foreground tracking-wide">Formula</div>
                    <code className="text-xs bg-muted/60 px-2 py-1 rounded inline-block mt-1">{m.formula}</code>
                  </div>
                </div>
                {m.columns.length > 0 && (
                  <div className="mt-3 text-sm">
                    <span className="text-xs uppercase text-muted-foreground tracking-wide mr-2">Columns used:</span>
                    {m.columns.map(c => <code key={c} className="text-xs bg-muted/60 px-1.5 py-0.5 rounded mr-1">{c}</code>)}
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-3">{m.why}</p>
              </Card>
            ))}
          </div>
        </div>

        <Card className="p-6 bg-primary/5 border-primary/20">
          <h3 className="font-display text-lg font-semibold mb-2">Want to see it in action?</h3>
          <p className="text-sm text-muted-foreground mb-4">Load the demo workspace with 6 months of realistic operational data.</p>
          <Link to="/auth"><Button>Open the demo dashboard</Button></Link>
        </Card>
      </div>
    </div>
  );
}
