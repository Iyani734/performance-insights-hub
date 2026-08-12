import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const signupNotificationSchema = z.object({
  userId: z.string().uuid(),
});

export const notifyAdminsOfSignup = createServerFn({ method: "POST" })
  .validator((input) => signupNotificationSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userResult, error: userError } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (userError) throw userError;
    const signupUser = userResult.user;
    if (!signupUser) throw new Error("Signup user was not found.");

    const email = signupUser.email ?? "";
    const name =
      String(signupUser.user_metadata?.nickname ?? signupUser.user_metadata?.full_name ?? "").trim() ||
      email ||
      data.userId;

    const { data: existingNotice } = await supabaseAdmin
      .from("system_logs")
      .select("id")
      .eq("action", "signup_admin_notified")
      .eq("entity_id", data.userId)
      .maybeSingle();
    if (existingNotice) return { notified: 0, alreadyNotified: true, emailEnabled: hasResendConfig() };

    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "super_admin");
    if (rolesError) throw rolesError;

    const adminIds = (roles ?? []).map((row) => row.user_id).filter(Boolean);
    const { data: profiles, error: profilesError } = adminIds.length
      ? await supabaseAdmin.from("profiles").select("id,email,full_name").in("id", adminIds)
      : { data: [], error: null };
    if (profilesError) throw profilesError;

    const recipients = Array.from(
      new Set(
        (profiles ?? [])
          .map((profile) => String(profile.email ?? "").trim().toLowerCase())
          .filter((address) => address.includes("@")),
      ),
    );

    let notified = 0;
    if (hasResendConfig() && recipients.length) {
      await Promise.all(
        recipients.map(async (to) => {
          await sendAdminSignupEmail({
            to,
            name,
            email,
          });
          notified += 1;
        }),
      );
    }

    await supabaseAdmin.from("system_logs").insert({
      actor_id: data.userId,
      actor_email: email || null,
      action: "signup_admin_notified",
      entity_type: "user",
      entity_id: data.userId,
      summary: hasResendConfig()
        ? `Admin notification sent for new account: ${email || name}`
        : `New account waiting for access approval: ${email || name}. Resend is not configured.`,
      metadata: {
        signup_email: email,
        signup_name: name,
        recipients,
        notified,
        email_enabled: hasResendConfig(),
      },
    });

    return { notified, alreadyNotified: false, emailEnabled: hasResendConfig() };
  });

function hasResendConfig() {
  return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL;
}

async function sendAdminSignupEmail(input: { to: string; name: string; email: string }) {
  const siteUrl = process.env.SITE_URL || process.env.APP_URL || process.env.URL || "";
  const settingsUrl = siteUrl ? `${siteUrl.replace(/\/$/, "")}/settings` : "/settings";
  const subject = `New ARC Barricades account needs approval: ${input.email || input.name}`;
  const text = [
    "A new account was created and is waiting for access approval.",
    "",
    `Name: ${input.name}`,
    `Email: ${input.email || "Not provided"}`,
    "",
    `Open Settings to approve or block access: ${settingsUrl}`,
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: [input.to],
      reply_to: process.env.RESEND_REPLY_TO_EMAIL || undefined,
      subject,
      text,
      html: text
        .split("\n")
        .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "<br />"))
        .join(""),
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? `Resend returned HTTP ${response.status}`);
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
