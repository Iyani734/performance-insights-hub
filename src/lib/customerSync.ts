import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const syncOpenJobCustomersInput = z.object({
  uploadId: z.string().uuid(),
});

export const syncOpenJobCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => syncOpenJobCustomersInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: jobs, error: jobsError } = await supabaseAdmin
      .from("open_jobs")
      .select("customer_key, customer_name")
      .eq("upload_id", data.uploadId);

    if (jobsError) throw jobsError;

    const byKey = new Map<string, string>();
    for (const job of jobs ?? []) {
      const key = String(job.customer_key ?? "").trim();
      const name = String(job.customer_name ?? "").trim();
      if (key && name) byKey.set(key, name);
    }

    const customers = Array.from(byKey, ([key, name]) => ({
      key,
      name,
      updated_at: new Date().toISOString(),
    }));

    if (customers.length === 0) return { synced: 0 };

    const { error: customersError } = await supabaseAdmin
      .from("customers")
      .upsert(customers, { onConflict: "key" });

    if (customersError) throw customersError;

    return { synced: customers.length };
  });
