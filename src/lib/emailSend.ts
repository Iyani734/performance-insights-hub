import { createServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllSupabaseRows } from "@/lib/supabasePagination";
import { openJobCustomerKey, openJobDetailValue, openJobReportRow, sortOpenJobsBySourceOrder, uniqueOpenJobs } from "@/lib/openJobs";
import { isSeededDemoPayload, isSeededDemoUpload } from "@/lib/liveData";
import { isOpenJobsUpload } from "@/lib/reportTypes";
import { formatDateOnly } from "@/lib/dateLabels";
import { z } from "zod";

type OpenJobRow = {
  job_no?: string | null;
  ticket_no?: string | null;
  address?: string | null;
  status?: string | null;
  age_days?: number | null;
  technician?: string | null;
  notes?: string | null;
  last_activity?: string | null;
  order_type?: string | null;
};

type CustomerRow = {
  id: string;
  key: string;
  name: string;
  email: string | null;
  cc_emails: string[] | null;
  enabled: boolean;
};

type SendResult = {
  sent: number;
  skipped: number;
  failed: number;
  details: { customer: string; status: "sent" | "skipped" | "failed"; reason?: string }[];
};

const sendInputSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  customerIds: z.array(z.string().uuid()).optional(),
  customSubject: z.string().trim().max(200).optional(),
  customMessage: z.string().trim().max(5000).optional(),
});

const DEFAULT_SUBJECT_TEMPLATE = "Open Jobs Report - {{customer_name}} - Week of {{week}}";
const DEFAULT_MESSAGE_TEMPLATE = [
  "Hi {{customer_name}} team,",
  "",
  "Please find attached your current Open Jobs report.",
  "There are {{job_count}} open jobs included.",
].join("\n");

export const sendOpenJobsEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => sendInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const replyTo = process.env.RESEND_REPLY_TO_EMAIL;

    if (!resendApiKey) throw new Error("Missing RESEND_API_KEY environment variable.");
    if (!fromEmail) throw new Error("Missing RESEND_FROM_EMAIL environment variable.");

    const uploads = await fetchAllSupabaseRows<any>((from, to) =>
      supabaseAdmin
        .from("report_uploads")
        .select("id,kind,file_name,status,week_start,created_at")
        .eq("kind", "open_jobs")
        .order("created_at", { ascending: false })
        .range(from, to),
    );
    const latestUpload =
      uploads
        .filter((upload) => !isSeededDemoUpload(upload.file_name))
        .filter((upload) => upload.status !== "failed" && upload.status !== "processing")
        .find(isOpenJobsUpload) ?? null;
    if (!latestUpload) throw new Error("No current Open Jobs upload found.");
    const currentPeriod = latestUpload.week_start ?? data.weekStart;

    const jobsData = await fetchAllSupabaseRows<any>((from, to) =>
      supabaseAdmin.from("open_jobs").select("*").eq("upload_id", latestUpload.id).range(from, to),
    );

    const jobsByCustomer = new Map<string, OpenJobRow[]>();
    for (const job of sortOpenJobsBySourceOrder(uniqueOpenJobs((jobsData ?? []).filter((row) => !isSeededDemoPayload(row.details))))) {
      const key = openJobCustomerKey(job);
      if (!key) continue;
      const rows = jobsByCustomer.get(key) ?? [];
      rows.push(job);
      jobsByCustomer.set(key, rows);
    }

    if (jobsByCustomer.size === 0) throw new Error("No open jobs found for the current upload.");

    const customerKeys = Array.from(jobsByCustomer.keys());
    const customersData = await fetchAllSupabaseRows<CustomerRow>((from, to) => {
      let customerQuery = supabaseAdmin
        .from("customers")
        .select("id,key,name,email,cc_emails,enabled")
        .in("key", customerKeys)
        .range(from, to);

      if (data.customerIds?.length) {
        customerQuery = customerQuery.in("id", data.customerIds);
      }

      return customerQuery;
    });

    const customers = customersData.filter(
      (customer) => customer.enabled && customer.email,
    );
    if (customers.length === 0) throw new Error("No enabled customers with email addresses found.");

    const result: SendResult = { sent: 0, skipped: 0, failed: 0, details: [] };

    for (const customer of customers) {
      const jobs = jobsByCustomer.get(customer.key) ?? [];
      const email = customer.email?.trim();
      if (!jobs.length || !email) {
        result.skipped++;
        result.details.push({ customer: customer.name, status: "skipped", reason: "No jobs or email" });
        continue;
      }
      const batchId = crypto.randomUUID();
      const templateValues = {
        customerName: customer.name,
        weekLabel: formatWeekLabel(currentPeriod),
        jobCount: jobs.length,
      };
      const subject = renderEmailTemplate(data.customSubject || DEFAULT_SUBJECT_TEMPLATE, templateValues);
      const message = renderEmailTemplate(data.customMessage || DEFAULT_MESSAGE_TEMPLATE, templateValues);
      const attachmentName = attachmentFor(customer.name, currentPeriod);
      const logPayload = {
        batch_id: batchId,
        week_start: currentPeriod,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_email: email,
        cc_emails: customer.cc_emails ?? [],
        subject,
        attachment_name: attachmentName,
        job_count: jobs.length,
        status: "pending",
        error: null,
        created_by: context.userId,
      };

      const { data: log, error: logError } = await supabaseAdmin
        .from("email_jobs")
        .insert(logPayload)
        .select("id")
        .single();
      if (logError || !log) {
        result.failed++;
        result.details.push({
          customer: customer.name,
          status: "failed",
          reason: logError?.message ?? "Could not create email log",
        });
        continue;
      }

      try {
        const resendMessageId = await sendWithResend({
          apiKey: resendApiKey,
          from: fromEmail,
          replyTo,
          to: email,
          cc: customer.cc_emails ?? [],
          subject,
          html: emailHtml(message, jobs),
          text: emailText(message),
          attachmentName,
          attachmentContent: xlsxBase64(jobs),
        });
        const now = new Date().toISOString();
        const { error: updateError } = await supabaseAdmin
          .from("email_jobs")
          .update({
            status: "sent",
            sent_at: now,
            error: null,
          })
          .eq("id", log.id);
        if (updateError) throw updateError;

        await supabaseAdmin
          .from("email_jobs")
          .update({
            provider: "resend",
            resend_message_id: resendMessageId,
          } as any)
          .eq("id", log.id);

        await supabaseAdmin
          .from("customers")
          .update({ last_email_sent_at: now, updated_at: now })
          .eq("id", customer.id);

        result.sent++;
        result.details.push({ customer: customer.name, status: "sent" });
      } catch (error: any) {
        const reason = error?.message ?? "Resend failed";
        await supabaseAdmin
          .from("email_jobs")
          .update({
            status: "failed",
            error: reason,
            provider: "resend",
          } as any)
          .eq("id", log.id);
        result.failed++;
        result.details.push({ customer: customer.name, status: "failed", reason });
      }
    }

    return result;
  });

function attachmentFor(name: string, week: string) {
  return `${name.replace(/[^A-Za-z0-9]+/g, "_")}-open-jobs-${week}.xlsx`;
}

async function sendWithResend(input: {
  apiKey: string;
  from: string;
  replyTo?: string;
  to: string;
  cc: string[];
  subject: string;
  html: string;
  text: string;
  attachmentName: string;
  attachmentContent: string;
}) {
  const body = {
    from: input.from,
    to: [input.to],
    cc: input.cc.length ? input.cc : undefined,
    reply_to: input.replyTo || undefined,
    subject: input.subject,
    html: input.html,
    text: input.text,
    attachments: [
      {
        filename: input.attachmentName,
        content: input.attachmentContent,
      },
    ],
  };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.message ?? `Resend returned HTTP ${response.status}`);
  }
  return payload?.id ?? null;
}

function emailHtml(message: string, jobs: OpenJobRow[]) {
  const previewRows = jobs
    .slice(0, 50)
    .map(
      (job) => `
        <tr>
          <td style="border-bottom: 1px solid #eef1f6; padding: 6px; vertical-align: top;">${escapeHtml(openJobDetailValue(job, "job_id_job_ref", job.job_no) ?? "")}</td>
          <td style="border-bottom: 1px solid #eef1f6; padding: 6px; vertical-align: top;">${escapeHtml(openJobDetailValue(job, "purchase_order_customer_job_lines", openJobDetailValue(job, "purchase_order_customer_job", job.ticket_no)) ?? "")}</td>
          <td style="border-bottom: 1px solid #eef1f6; padding: 6px; vertical-align: top;">${escapeHtml(openJobDetailValue(job, "srv_int", job.order_type) ?? "")}</td>
          <td style="border-bottom: 1px solid #eef1f6; padding: 6px; vertical-align: top;">${escapeHtml(openJobDetailValue(job, "zone", job.status) ?? "")}</td>
          <td style="border-bottom: 1px solid #eef1f6; padding: 6px; vertical-align: top;">${escapeHtml(openJobDetailValue(job, "opened_first_ticket_lines", openJobDetailValue(job, "opened_first_ticket")) ?? "")}</td>
          <td style="border-bottom: 1px solid #eef1f6; padding: 6px; vertical-align: top;">${escapeHtml(openJobDetailValue(job, "last_ticket", job.last_activity) ?? "")}</td>
          <td style="border-bottom: 1px solid #eef1f6; padding: 6px; vertical-align: top;">${escapeHtml(openJobDetailValue(job, "job_address_city_lines", openJobDetailValue(job, "job_address_city", job.address)) ?? "")}</td>
          <td style="border-bottom: 1px solid #eef1f6; padding: 6px; vertical-align: top;">${escapeHtml(openJobDetailValue(job, "foreman", job.technician) ?? "")}</td>
        </tr>`,
    )
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; color: #172033; line-height: 1.5;">
      ${messageToHtml(message)}
      <table style="border-collapse: collapse; width: 100%; font-size: 12px;">
        <thead>
          <tr>
            <th align="left" style="border-bottom: 1px solid #d9dee8; padding: 6px;">Job ID / Job Ref.</th>
            <th align="left" style="border-bottom: 1px solid #d9dee8; padding: 6px;">Purchase Order # / Customer Job#</th>
            <th align="left" style="border-bottom: 1px solid #d9dee8; padding: 6px;">Srv Int</th>
            <th align="left" style="border-bottom: 1px solid #d9dee8; padding: 6px;">Zone</th>
            <th align="left" style="border-bottom: 1px solid #d9dee8; padding: 6px;">Opened / First Ticket</th>
            <th align="left" style="border-bottom: 1px solid #d9dee8; padding: 6px;">Last Ticket</th>
            <th align="left" style="border-bottom: 1px solid #d9dee8; padding: 6px;">Job Address/City</th>
            <th align="left" style="border-bottom: 1px solid #d9dee8; padding: 6px;">Foreman</th>
          </tr>
        </thead>
        <tbody>${previewRows}</tbody>
      </table>
      ${jobs.length > 50 ? `<p>Showing first 50 rows here. The Excel attachment contains all ${jobs.length} jobs.</p>` : ""}
    </div>`;
}

function emailText(message: string) {
  return message;
}

function xlsxBase64(jobs: OpenJobRow[]) {
  const header = [
    "Job ID / Job Ref.",
    "Purchase Order # / Customer Job#",
    "Srv Int",
    "Zone",
    "Opened / First Ticket",
    "Last Ticket",
    "Job Address/City",
    "Foreman",
  ];
  const rows = jobs.map((job) => {
    const reportRow = openJobReportRow(job);
    return header.map((column) => reportRow[column] ?? "");
  });
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Open Jobs");
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return base64Bytes(new Uint8Array(bytes));
}

function base64Bytes(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function formatWeekLabel(iso: string) {
  return formatDateOnly(iso);
}

function renderEmailTemplate(
  template: string,
  values: { customerName: string; weekLabel: string; jobCount: number },
) {
  return template
    .replace(/\{\{\s*customer(?:_name)?\s*\}\}/gi, values.customerName)
    .replace(/\{\{\s*week\s*\}\}/gi, values.weekLabel)
    .replace(/\{\{\s*job_count\s*\}\}/gi, String(values.jobCount));
}

function messageToHtml(message: string) {
  return message
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.split(/\n/).map(escapeHtml).join("<br />")}</p>`)
    .join("\n");
}


function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
