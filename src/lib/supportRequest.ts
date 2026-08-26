import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SUPPORT_EMAIL = "Yvette@triaconsultingus.com";

const supportRequestSchema = z.object({
  subject: z.string().trim().min(1, "Enter a subject.").max(160),
  message: z.string().trim().min(10, "Enter a little more detail.").max(5000),
  page: z.string().trim().max(120).optional(),
});

export const sendSupportRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => supportRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const fallbackReplyTo = process.env.RESEND_REPLY_TO_EMAIL;

    if (!resendApiKey) throw new Error("Missing RESEND_API_KEY environment variable.");
    if (!fromEmail) throw new Error("Missing RESEND_FROM_EMAIL environment variable.");

    const requesterEmail = String((context.claims as any)?.email ?? "").trim();
    const requesterName =
      String((context.claims as any)?.user_metadata?.full_name ?? (context.claims as any)?.user_metadata?.name ?? "").trim() ||
      requesterEmail ||
      context.userId;
    const replyTo = requesterEmail || fallbackReplyTo || undefined;
    const page = data.page?.trim() || "Not specified";
    const subject = `ARC support request: ${data.subject}`;
    const text = [
      "A support request was submitted from ARC Barricades Operations KPIs.",
      "",
      `From: ${requesterName}`,
      `Email: ${requesterEmail || "Not provided"}`,
      `Page / feature: ${page}`,
      "",
      "Message:",
      data.message,
    ].join("\n");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [SUPPORT_EMAIL],
        reply_to: replyTo,
        subject,
        text,
        html: supportHtml({
          requesterName,
          requesterEmail,
          page,
          message: data.message,
        }),
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message ?? `Resend returned HTTP ${response.status}`);
    }

    return { sent: true, to: SUPPORT_EMAIL };
  });

function supportHtml(input: { requesterName: string; requesterEmail: string; page: string; message: string }) {
  return [
    "<div style=\"font-family: Inter, Arial, sans-serif; color: #111827; line-height: 1.5;\">",
    "<h2 style=\"margin: 0 0 16px; font-size: 18px;\">ARC support request</h2>",
    "<table style=\"border-collapse: collapse; margin-bottom: 18px; font-size: 14px;\">",
    row("From", input.requesterName),
    row("Email", input.requesterEmail || "Not provided"),
    row("Page / feature", input.page),
    "</table>",
    "<div style=\"border-top: 1px solid #e5e7eb; padding-top: 16px; white-space: pre-wrap; font-size: 14px;\">",
    escapeHtml(input.message),
    "</div>",
    "</div>",
  ].join("");
}

function row(label: string, value: string) {
  return [
    "<tr>",
    `<td style="padding: 4px 16px 4px 0; color: #6b7280;">${escapeHtml(label)}</td>`,
    `<td style="padding: 4px 0; font-weight: 600;">${escapeHtml(value)}</td>`,
    "</tr>",
  ].join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
