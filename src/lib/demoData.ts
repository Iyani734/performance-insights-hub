import type { KpiTarget } from "@/lib/kpi";

export type DateRangeValue = { from: string; to: string };

export function dateOnly(date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return dateOnly(d);
}

export function defaultLast7DaysRange(): DateRangeValue {
  const to = dateOnly();
  return { from: addDays(to, -6), to };
}

export function previousDateRange(range: DateRangeValue): DateRangeValue {
  const fromDate = new Date(`${range.from}T00:00:00`);
  const toDate = new Date(`${range.to}T00:00:00`);
  const days = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1);
  return {
    from: addDays(range.from, -days),
    to: addDays(range.from, -1),
  };
}

function rangeOverlaps(aFrom: string, aTo: string, bFrom: string, bTo: string) {
  return aFrom <= bTo && aTo >= bFrom;
}

function formatDemoDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export const DEMO_CURRENT_WEEK = defaultLast7DaysRange().from;
export const DEMO_WEEKS = Array.from({ length: 4 }, (_, index) => addDays(DEMO_CURRENT_WEEK, index * -7));

export const DEMO_TARGETS: KpiTarget[] = [
  {
    id: "demo-target-review",
    kpi_key: "review_to_final_edit",
    label: "Tickets Moving Through - Review to Final Edit",
    owner: "Dispatch",
    cadence: "Weekly",
    unit: "%",
    direction: "higher_is_better",
    green_min: 95,
    yellow_min: 85,
    target_display: ">= 95%",
    auto: true,
    sort_order: 1,
  },
  {
    id: "demo-target-quality",
    kpi_key: "ticket_quality",
    label: "Ticket Quality",
    owner: "Dispatch/Drivers",
    cadence: "Monthly",
    unit: "%",
    direction: "lower_is_better",
    green_min: 3,
    yellow_min: 5,
    target_display: "< 3%",
    auto: true,
    sort_order: 2,
  },
  {
    id: "demo-target-invoice",
    kpi_key: "invoice_cycle_time",
    label: "Invoice Cycle Time (Final Edit to Invoice)",
    owner: "Invoicing",
    cadence: "Weekly",
    unit: "days",
    direction: "lower_is_better",
    green_min: 3,
    yellow_min: 5,
    target_display: "<= 3 days",
    auto: true,
    sort_order: 3,
  },
  {
    id: "demo-target-responsiveness",
    kpi_key: "dispatch_responsiveness",
    label: "Team Responsiveness (within 1 hour)",
    owner: "Dispatch Service Quality",
    cadence: "Daily",
    unit: "%",
    direction: "higher_is_better",
    green_min: 95,
    yellow_min: 85,
    target_display: ">= 95%",
    auto: true,
    sort_order: 4,
  },
  {
    id: "demo-target-safety",
    kpi_key: "driver_safety",
    label: "Safety",
    owner: "Drivers",
    cadence: "Monthly",
    unit: "count",
    direction: "lower_is_better",
    green_min: 20,
    yellow_min: 20,
    target_display: "<= 20",
    auto: false,
    sort_order: 5,
  },
  {
    id: "demo-target-incomplete",
    kpi_key: "incomplete_tickets",
    label: "Incomplete Tickets",
    owner: "Drivers",
    cadence: "Monthly",
    unit: "count",
    direction: "lower_is_better",
    green_min: 10,
    yellow_min: 10,
    target_display: "<= 10",
    auto: false,
    sort_order: 6,
  },
  {
    id: "demo-target-missed-jobs",
    kpi_key: "missed_jobs",
    label: "Missed Jobs / Late Jobs / Client Callbacks / Reworks",
    owner: "Job Service Quality",
    cadence: "Monthly",
    unit: "count",
    direction: "lower_is_better",
    green_min: 1,
    yellow_min: 1,
    target_display: "<= 1",
    auto: false,
    sort_order: 7,
  },
];

const DEMO_SERIES: Record<string, number[]> = {
  review_to_final_edit: [97.8, 97.4, 96.8, 96.2],
  ticket_quality: [1.1, 1.3, 1.5, 1.8],
  invoice_cycle_time: [2.0, 2.2, 2.4, 2.7],
  dispatch_responsiveness: [97.8, 97.2, 96.8, 96.1],
  driver_safety: [12, 14, 16, 18],
  incomplete_tickets: [6, 7, 8, 9],
  missed_jobs: [0, 1, 1, 1],
};

export type DemoUploadKind = "total_tickets" | "total_invoiced" | "open_jobs";

export type DemoUploadMetrics = {
  tickets?: number;
  finalEdited?: number;
  ticketVoids?: number;
  invoiced?: number;
  invoiceQualityIssues?: number;
  invoiceCycleDaysTotal?: number;
  invoiceCycleCount?: number;
};

export type DemoUploadRecord = {
  id: string;
  kind: DemoUploadKind;
  week_start: string;
  effective_from?: string | null;
  effective_to?: string | null;
  file_name: string;
  file_path: string | null;
  row_count: number;
  uploaded_by: string | null;
  created_at: string;
  rows_skipped: number;
  errors_count: number;
  processing_ms: number;
  error_details: { row: number; reason: string }[];
  status: string;
  metrics?: DemoUploadMetrics;
};

export const DEMO_LOCAL_UPLOADS_KEY = "perf-tracker-demo-uploads";

const DEMO_CUSTOMERS = [
  ["ACMEHEALTH", "Acme Health Network", "operations@acmehealth.example", ["dispatch@acmehealth.example", "billing@acmehealth.example"]],
  ["NORTHSTAR", "Northstar Facilities", "service@northstar.example", ["ops@northstar.example"]],
  ["MERIDIAN", "Meridian Retail Group", "maintenance@meridian.example", ["regional@meridian.example", "finance@meridian.example"]],
  ["HARBOR", "Harbor Logistics", "facilities@harbor.example", ["yardops@harbor.example"]],
  ["SUMMIT", "Summit Hospitality", "engineering@summit.example", ["gm@summit.example"]],
  ["VERDANT", "Verdant Public Works", "publicworks@verdant.example", ["fieldops@verdant.example", "procurement@verdant.example"]],
] as const;

export function demoKpiValues() {
  return DEMO_WEEKS.flatMap((week, weekIndex) =>
    Object.entries(DEMO_SERIES).map(([kpi_key, values]) => ({
      id: `demo-kpi-${week}-${kpi_key}`,
      kpi_key,
      week_start: week,
      actual: values[weekIndex],
      source: "demo",
      entered_by: null,
      created_at: `${week}T18:00:00.000Z`,
    })),
  ).sort((a, b) => a.week_start.localeCompare(b.week_start));
}

export function demoAutoKpis(week: string) {
  const index = Math.max(0, DEMO_WEEKS.indexOf(week));
  return {
    review_to_final_edit: DEMO_SERIES.review_to_final_edit[index],
    ticket_quality: DEMO_SERIES.ticket_quality[index],
    invoice_cycle_time: DEMO_SERIES.invoice_cycle_time[index],
    dispatch_completion: null,
    totals: {
      tickets: 126 - index * 4,
      invoiced: 118 - index * 3,
      quality_issues: 2 + index,
      voided: 2 + index,
      active_tickets: 18 - index,
      review_tickets: 9,
      final_edit_tickets: 99 - index * 3,
    },
  };
}

export function demoEmailStats() {
  return { ready: 2, sent: 4, pending: 2, failed: 1 };
}

export function demoUploads(): DemoUploadRecord[] {
  const kinds = [
    ["total_tickets", "demo-total-tickets.xlsx", 126],
    ["total_invoiced", "demo-total-invoiced.xlsx", 118],
    ["open_jobs", "demo-open-jobs.xlsx", 26],
  ] as const;
  return DEMO_WEEKS.flatMap((week, weekIndex) =>
    kinds.map(([kind, file_name, row_count], kindIndex) => ({
      id: `demo-upload-${week}-${kind}`,
      kind,
      week_start: week,
      effective_from: week,
      effective_to: addDays(week, 6),
      file_name,
      file_path: null,
      row_count: row_count - weekIndex * 2,
      uploaded_by: null,
      created_at: `${week}T${String(13 + kindIndex).padStart(2, "0")}:15:00.000Z`,
      rows_skipped: 1,
      errors_count: 0,
      processing_ms: 620 + weekIndex * 20 + kindIndex * 35,
      error_details: [],
      status: "success",
    })),
  ).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function loadDemoLocalUploads(): DemoUploadRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DEMO_LOCAL_UPLOADS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDemoLocalUploads(rows: DemoUploadRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_LOCAL_UPLOADS_KEY, JSON.stringify(rows.slice(0, 25)));
}

export function demoUploadsWithLocal(): DemoUploadRecord[] {
  return [...loadDemoLocalUploads(), ...demoUploads()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function demoUploadsForRange(range: DateRangeValue): DemoUploadRecord[] {
  return demoUploadsWithLocal().filter((u) => {
    const from = u.effective_from ?? u.week_start;
    const to = u.effective_to ?? addDays(u.week_start, 6);
    return rangeOverlaps(from, to, range.from, range.to);
  });
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function generatedDemoAutoKpisForRange(range: DateRangeValue) {
  const weeks = DEMO_WEEKS.filter((week) => rangeOverlaps(week, addDays(week, 6), range.from, range.to));
  const indices = weeks.map((week) => DEMO_WEEKS.indexOf(week)).filter((index) => index >= 0);
  return {
    review_to_final_edit: average(indices.map((index) => DEMO_SERIES.review_to_final_edit[index])),
    ticket_quality: average(indices.map((index) => DEMO_SERIES.ticket_quality[index])),
    invoice_cycle_time: average(indices.map((index) => DEMO_SERIES.invoice_cycle_time[index])),
    dispatch_completion: null,
    totals: indices.reduce(
      (totals, index) => ({
        tickets: totals.tickets + (126 - index * 4),
        invoiced: totals.invoiced + (118 - index * 3),
        quality_issues: totals.quality_issues + (2 + index),
        voided: totals.voided + (2 + index),
        active_tickets: totals.active_tickets + (18 - index),
        review_tickets: totals.review_tickets + 9,
        final_edit_tickets: totals.final_edit_tickets + (99 - index * 3),
      }),
      { tickets: 0, invoiced: 0, quality_issues: 0, voided: 0, active_tickets: 0, review_tickets: 0, final_edit_tickets: 0 },
    ),
  };
}

function localDemoAutoKpisForRange(range: DateRangeValue) {
  const metrics = demoUploadsForRange(range).reduce(
    (totals, upload) => {
      const m = upload.metrics;
      if (!m) return totals;
      totals.tickets += m.tickets ?? 0;
      totals.finalEdited += m.finalEdited ?? 0;
      totals.ticketVoids += m.ticketVoids ?? 0;
      totals.invoiced += m.invoiced ?? 0;
      totals.invoiceQualityIssues += m.invoiceQualityIssues ?? 0;
      totals.invoiceCycleDaysTotal += m.invoiceCycleDaysTotal ?? 0;
      totals.invoiceCycleCount += m.invoiceCycleCount ?? 0;
      totals.hasTickets = totals.hasTickets || m.tickets != null;
      totals.hasInvoiced = totals.hasInvoiced || m.invoiced != null;
      return totals;
    },
    {
      tickets: 0,
      finalEdited: 0,
      ticketVoids: 0,
      invoiced: 0,
      invoiceQualityIssues: 0,
      invoiceCycleDaysTotal: 0,
      invoiceCycleCount: 0,
      hasTickets: false,
      hasInvoiced: false,
    },
  );

  return {
    review_to_final_edit: metrics.hasTickets && metrics.tickets > 0 ? (metrics.finalEdited / metrics.tickets) * 100 : null,
    ticket_quality: metrics.hasInvoiced && metrics.invoiced > 0 ? (metrics.invoiceQualityIssues / metrics.invoiced) * 100 : null,
    invoice_cycle_time: metrics.invoiceCycleCount > 0 ? metrics.invoiceCycleDaysTotal / metrics.invoiceCycleCount : null,
    dispatch_completion: metrics.hasTickets && metrics.tickets > 0 ? ((metrics.tickets - metrics.ticketVoids) / metrics.tickets) * 100 : null,
    totals: {
      tickets: metrics.tickets,
      invoiced: metrics.invoiced,
      quality_issues: metrics.invoiceQualityIssues,
      voided: metrics.ticketVoids,
      active_tickets: 0,
      review_tickets: 0,
      final_edit_tickets: 0,
    },
    hasTickets: metrics.hasTickets,
    hasInvoiced: metrics.hasInvoiced,
  };
}

export function demoAutoKpisForRange(range: DateRangeValue) {
  const generated = generatedDemoAutoKpisForRange(range);
  const local = localDemoAutoKpisForRange(range);
  return {
    review_to_final_edit: local.review_to_final_edit ?? generated.review_to_final_edit,
    ticket_quality: local.ticket_quality ?? generated.ticket_quality,
    invoice_cycle_time: local.invoice_cycle_time ?? generated.invoice_cycle_time,
    dispatch_completion: local.dispatch_completion ?? generated.dispatch_completion,
    totals: {
      tickets: local.hasTickets ? local.totals.tickets : generated.totals.tickets,
      invoiced: local.hasInvoiced ? local.totals.invoiced : generated.totals.invoiced,
      quality_issues: local.hasInvoiced ? local.totals.quality_issues : generated.totals.quality_issues,
      voided: local.hasTickets ? local.totals.voided : generated.totals.voided,
      active_tickets: local.hasTickets ? local.totals.active_tickets : generated.totals.active_tickets,
      review_tickets: local.hasTickets ? local.totals.review_tickets : generated.totals.review_tickets,
      final_edit_tickets: local.hasTickets ? local.totals.final_edit_tickets : generated.totals.final_edit_tickets,
    },
  };
}

export function demoKpiValuesWithLocal() {
  const localValues = loadDemoLocalUploads().flatMap((upload) => {
    const m = upload.metrics;
    if (!m) return [];
    const week_start = upload.effective_from ?? upload.week_start;
    const created_at = upload.created_at;
    const rows = [];
    if (m.tickets != null && m.tickets > 0) {
      rows.push({
        id: `${upload.id}-review`,
        kpi_key: "review_to_final_edit",
        week_start,
        actual: ((m.finalEdited ?? 0) / m.tickets) * 100,
        source: "demo-upload",
        entered_by: null,
        created_at,
      });
      rows.push({
        id: `${upload.id}-dispatch`,
        kpi_key: "dispatch_completion",
        week_start,
        actual: ((m.tickets - (m.ticketVoids ?? 0)) / m.tickets) * 100,
        source: "demo-upload",
        entered_by: null,
        created_at,
      });
    }
    if (m.invoiced != null && m.invoiced > 0) {
      rows.push({
        id: `${upload.id}-quality`,
        kpi_key: "ticket_quality",
        week_start,
        actual: ((m.invoiceQualityIssues ?? 0) / m.invoiced) * 100,
        source: "demo-upload",
        entered_by: null,
        created_at,
      });
    }
    if ((m.invoiceCycleCount ?? 0) > 0) {
      rows.push({
        id: `${upload.id}-invoice-cycle`,
        kpi_key: "invoice_cycle_time",
        week_start,
        actual: (m.invoiceCycleDaysTotal ?? 0) / (m.invoiceCycleCount ?? 1),
        source: "demo-upload",
        entered_by: null,
        created_at,
      });
    }
    return rows;
  });
  return [...demoKpiValues(), ...localValues].sort((a, b) => a.week_start.localeCompare(b.week_start));
}

export function demoNotes(week: string) {
  return [
    {
      id: `demo-note-${week}-general`,
      week_start: week,
      kpi_key: "general",
      note: "Healthy demo week: dispatch completion, invoice cycle, and ticket quality are tracking on target.",
      author_id: null,
      author_name: "Demo Operations Manager",
      created_at: `${week}T17:30:00.000Z`,
    },
    {
      id: `demo-note-${week}-billing`,
      week_start: week,
      kpi_key: "invoice_cycle_time",
      note: "Billing handoff stayed under the three-day target with clean invoice packets.",
      author_id: null,
      author_name: "Demo Operations Manager",
      created_at: `${week}T16:45:00.000Z`,
    },
  ];
}

export function demoCustomers() {
  const { from, to } = defaultLast7DaysRange();
  return DEMO_CUSTOMERS.map(([key, name, email, cc_emails], index) => ({
    id: `demo-customer-${key.toLowerCase()}`,
    key,
    name,
    email,
    cc_emails,
    active: true,
    enabled: true,
    last_email_sent_at: `${addDays(to, -(index % 5))}T14:00:00.000Z`,
    created_at: `${from}T09:00:00.000Z`,
    updated_at: `${to}T10:00:00.000Z`,
  }));
}

export function demoOpenJobs(week = DEMO_CURRENT_WEEK) {
  const statuses = ["Scheduled", "In Progress", "Customer Confirmed", "Awaiting Parts", "Ready for Billing"];
  const technicians = ["A. Patel", "M. Rivera", "J. Brooks", "S. Chen", "T. Morgan"];
  return demoCustomers().flatMap((customer, customerIndex) =>
    Array.from({ length: customerIndex < 3 ? 5 : 4 }, (_, jobIndex) => ({
      id: `demo-open-job-${week}-${customer.key}-${jobIndex + 1}`,
      upload_id: `demo-upload-${week}-open_jobs`,
      week_start: week,
      customer_key: customer.key,
      customer_name: customer.name,
      job_no: `OJ-202622-${customerIndex + 1}${jobIndex + 1}`,
      ticket_no: `TCK-202622-${String(customerIndex * 20 + jobIndex + 1).padStart(4, "0")}`,
      order_type: ["Repair", "Inspection", "Preventive Maintenance", "Install"][jobIndex % 4],
      last_activity: "Customer update prepared for the weekly report",
      details: { demo: true, priority: jobIndex === 0 ? "high" : "normal" },
      created_at: `${week}T${String(12 + jobIndex).padStart(2, "0")}:20:00.000Z`,
      address: `${100 + customerIndex * 25} Demo Service Road, Suite ${100 + jobIndex * 10}`,
      status: statuses[jobIndex % statuses.length],
      age_days: jobIndex + 2 + (customerIndex % 2),
      technician: technicians[(customerIndex + jobIndex) % technicians.length],
      notes: jobIndex === 3 ? "Waiting on stocked part confirmation" : "On track for the weekly customer update",
    })),
  );
}

export function demoEmailJobs(week = DEMO_CURRENT_WEEK) {
  return demoCustomers().map((customer, index) => {
    const sent = index < 4;
    return {
      id: `demo-email-${week}-${customer.key}`,
      batch_id: `demo-email-batch-${week}`,
      week_start: week,
      customer_id: customer.id,
      customer_name: customer.name,
      customer_email: customer.email,
      job_count: 4 + (index % 2),
      status: sent ? "sent" : "pending",
      error: null,
      sent_at: sent ? `${week}T${String(12 + index).padStart(2, "0")}:30:00.000Z` : null,
      created_by: null,
      created_at: `${week}T10:${String(index * 8).padStart(2, "0")}:00.000Z`,
      subject: `Open Jobs Report - ${customer.name} - Period starting ${formatDemoDate(week)}`,
      attachment_name: `${customer.name.replace(/[^A-Za-z0-9]+/g, "_")}-open-jobs-${week}.xlsx`,
      scheduled_for: sent ? null : `${week}T${String(16 + index).padStart(2, "0")}:00:00.000Z`,
      cc_emails: customer.cc_emails,
    };
  });
}
