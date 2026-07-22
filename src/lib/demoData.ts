import type { KpiTarget } from "@/lib/kpi";

export const DEMO_CURRENT_WEEK = "2026-05-24";
export const DEMO_WEEKS = ["2026-05-24", "2026-05-17", "2026-05-10", "2026-05-03"];

export const DEMO_TARGETS: KpiTarget[] = [
  {
    id: "demo-target-review",
    kpi_key: "review_to_final_edit",
    label: "Review -> Final Edit %",
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
    label: "Ticket Quality %",
    owner: "QA",
    cadence: "Weekly",
    unit: "%",
    direction: "lower_is_better",
    green_min: 2,
    yellow_min: 5,
    target_display: "<= 2%",
    auto: true,
    sort_order: 2,
  },
  {
    id: "demo-target-invoice",
    kpi_key: "invoice_cycle_time",
    label: "Invoice Cycle Time (days)",
    owner: "Billing",
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
    id: "demo-target-dispatch",
    kpi_key: "dispatch_completion",
    label: "Dispatch Completion %",
    owner: "Dispatch",
    cadence: "Weekly",
    unit: "%",
    direction: "higher_is_better",
    green_min: 95,
    yellow_min: 85,
    target_display: ">= 95%",
    auto: true,
    sort_order: 4,
  },
];

const DEMO_SERIES: Record<string, number[]> = {
  review_to_final_edit: [97.8, 97.4, 96.8, 96.2],
  ticket_quality: [1.1, 1.3, 1.5, 1.8],
  invoice_cycle_time: [2.0, 2.2, 2.4, 2.7],
  dispatch_completion: [98.5, 98.1, 97.7, 97.2],
};

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
    dispatch_completion: DEMO_SERIES.dispatch_completion[index],
    totals: {
      tickets: 126 - index * 4,
      invoiced: 118 - index * 3,
      quality_issues: 2 + index,
      voided: 2 + index,
    },
  };
}

export function demoEmailStats() {
  return { ready: 2, sent: 4, pending: 2, failed: 1 };
}

export function demoUploads() {
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
  return DEMO_CUSTOMERS.map(([key, name, email, cc_emails], index) => ({
    id: `demo-customer-${key.toLowerCase()}`,
    key,
    name,
    email,
    cc_emails,
    active: true,
    enabled: true,
    last_email_sent_at: `2026-05-${String(22 + (index % 5)).padStart(2, "0")}T14:00:00.000Z`,
    created_at: "2026-05-01T09:00:00.000Z",
    updated_at: "2026-05-26T10:00:00.000Z",
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
      subject: `Open Jobs Report - ${customer.name} - Week of May 24, 2026`,
      attachment_name: `${customer.name.replace(/[^A-Za-z0-9]+/g, "_")}-open-jobs-${week}.xlsx`,
      scheduled_for: sent ? null : `${week}T${String(16 + index).padStart(2, "0")}:00:00.000Z`,
      cc_emails: customer.cc_emails,
    };
  });
}
