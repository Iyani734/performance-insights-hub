export const UNKNOWN_OPEN_JOB_CUSTOMER_KEY = "UNKNOWN";
export const UNKNOWN_OPEN_JOB_CUSTOMER_NAME = "Unknown";

function openJobDetails(job: any) {
  return job?.details && typeof job.details === "object" ? job.details : {};
}

export function openJobCustomerKey(job: any) {
  const key = String(job?.customer_key ?? "").trim();
  return key || UNKNOWN_OPEN_JOB_CUSTOMER_KEY;
}

export function openJobCustomerName(job: any) {
  const name = String(job?.customer_name ?? "").trim();
  if (!name || /^unknown(?:\s+customer)?$/i.test(name)) return UNKNOWN_OPEN_JOB_CUSTOMER_NAME;
  return name;
}

export function isUnknownOpenJobCustomer(job: any) {
  return (
    openJobCustomerKey(job).toUpperCase() === UNKNOWN_OPEN_JOB_CUSTOMER_KEY ||
    openJobCustomerName(job) === UNKNOWN_OPEN_JOB_CUSTOMER_NAME
  );
}

export function openJobDetailValue(job: any, key: string, fallback?: any) {
  const details = openJobDetails(job);
  const value = details[key];
  if (value == null || value === "") return fallback ?? null;
  if (Array.isArray(value)) return value.filter(Boolean).join(" / ");
  return value;
}

function openJobSourceOrder(job: any, fallbackIndex: number) {
  const details = openJobDetails(job);
  const order = Number(details.excel_row ?? details.source_order ?? details.import_order);
  return Number.isFinite(order) ? order : fallbackIndex + 1_000_000;
}

export function sortOpenJobsBySourceOrder<T = any>(jobs: T[]): T[] {
  return jobs
    .map((job, index) => ({ job, index, order: openJobSourceOrder(job, index) }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((entry) => entry.job);
}

export function openJobReportRow(job: any, options: { includeCustomer?: boolean } = {}) {
  const row: Record<string, any> = {};
  if (options.includeCustomer) {
    row.Customer = openJobCustomerName(job);
    row["Customer Key"] = openJobCustomerKey(job);
  }
  row["Job ID / Job Ref."] = openJobDetailValue(job, "job_id_job_ref", job.job_no);
  row["Purchase Order # / Customer Job#"] = openJobDetailValue(
    job,
    "purchase_order_customer_job_lines",
    openJobDetailValue(job, "purchase_order_customer_job", job.ticket_no),
  );
  row["Srv Int"] = openJobDetailValue(job, "srv_int", job.order_type);
  row.Zone = openJobDetailValue(job, "zone", job.status);
  row["Opened / First Ticket"] = openJobDetailValue(job, "opened_first_ticket_lines", openJobDetailValue(job, "opened_first_ticket"));
  row["Last Ticket"] = openJobDetailValue(job, "last_ticket", job.last_activity);
  row["Job Address/City"] = openJobDetailValue(job, "job_address_city_lines", openJobDetailValue(job, "job_address_city", job.address));
  row.Foreman = openJobDetailValue(job, "foreman", job.technician);
  return row;
}

export function openJobIdentity(job: any) {
  const customerKey = openJobCustomerKey(job);
  const details = openJobDetails(job);
  const jobId = String(details.job_id_job_ref ?? job?.job_no ?? "").trim();
  if (customerKey && jobId) return `${customerKey}|${jobId}`;
  return String(job?.id ?? `${customerKey}|${jobId}`);
}

export function hasOpenJobId(job: any) {
  const details = openJobDetails(job);
  const jobId = String(details.job_id_job_ref ?? job?.job_no ?? "").trim();
  return /^\d{3,}$/.test(jobId) || /^OJ-/i.test(jobId);
}

export function uniqueOpenJobs<T = any>(jobs: T[]): T[] {
  const seen = new Set<string>();
  const rows: T[] = [];
  for (const job of jobs) {
    if (!hasOpenJobId(job)) continue;
    const key = openJobIdentity(job);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(job);
  }
  return rows;
}
