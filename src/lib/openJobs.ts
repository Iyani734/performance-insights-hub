export function openJobIdentity(job: any) {
  const customerKey = String(job?.customer_key ?? "").trim();
  const details = job?.details && typeof job.details === "object" ? job.details : {};
  const jobId = String(details.job_id_job_ref ?? job?.job_no ?? "").trim();
  if (customerKey && jobId) return `${customerKey}|${jobId}`;
  return String(job?.id ?? `${customerKey}|${jobId}`);
}

export function hasOpenJobId(job: any) {
  const details = job?.details && typeof job.details === "object" ? job.details : {};
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
