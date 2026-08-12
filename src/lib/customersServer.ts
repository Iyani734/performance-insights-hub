import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const customerPayloadSchema = z.object({
  key: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255).nullable().optional(),
  cc_emails: z.array(z.string().trim().email()).default([]),
  last_email_sent_at: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
});

const upsertCustomerInputSchema = z.object({
  id: z.string().uuid().optional(),
  customer: customerPayloadSchema,
});

const syncCustomersInputSchema = z.object({
  uploadId: z.string().uuid(),
  customers: z.array(
    z.object({
      key: z.string().trim().min(1).max(50),
      name: z.string().trim().min(1).max(200),
    }),
  ),
});

export const upsertCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => upsertCustomerInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCanEditPage(supabaseAdmin, context.userId, "customers");
    const payload = {
      ...data.customer,
      active: data.customer.enabled,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("customers").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }

    const { data: row, error } = await supabaseAdmin
      .from("customers")
      .upsert(payload, { onConflict: "key" })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row?.id ?? null };
  });

export const deleteCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCanEditPage(supabaseAdmin, context.userId, "customers");
    const { error } = await supabaseAdmin.from("customers").delete().eq("id", data.id);
    if (error) throw error;
    return { deleted: true };
  });

export const syncOpenJobCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => syncCustomersInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertCanEditPage(supabaseAdmin, context.userId, "uploads");
    const { data: count, error: rpcError } = await supabaseAdmin.rpc("sync_customers_from_open_jobs_upload", {
      p_upload_id: data.uploadId,
    });
    if (!rpcError) return { synced: Number(count ?? data.customers.length), usedFallback: false };

    const rows = data.customers.map((customer) => ({
      key: customer.key,
      name: customer.name,
      updated_at: new Date().toISOString(),
    }));
    if (!rows.length) return { synced: 0, usedFallback: true };

    const { error } = await supabaseAdmin.from("customers").upsert(rows, { onConflict: "key" });
    if (error) throw error;
    return { synced: rows.length, usedFallback: true };
  });

async function assertCanEditPage(supabaseAdmin: any, userId: string, page: string) {
  const [{ data: roles, error: rolesError }, { data: perms, error: permsError }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin.from("page_permissions").select("can_edit").eq("user_id", userId).eq("page", page).maybeSingle(),
  ]);
  if (rolesError) throw rolesError;
  if (permsError) throw permsError;
  if ((roles ?? []).some((row: any) => row.role === "super_admin")) return;
  if (perms?.can_edit) return;
  throw new Error("You do not have edit access for this page yet.");
}
