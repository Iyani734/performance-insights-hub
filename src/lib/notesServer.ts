import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const noteIdSchema = z.object({
  id: z.string().uuid(),
});

const updateNoteSchema = noteIdSchema.extend({
  note: z.string().trim().min(1, "Enter a note before saving.").max(5000, "Keep notes under 5,000 characters."),
});

export const updateManagerNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => updateNoteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertSuperAdmin(supabaseAdmin, context.userId);

    const { error } = await supabaseAdmin
      .from("kpi_notes")
      .update({ note: data.note })
      .eq("id", data.id)
      .select("id")
      .single();

    if (error) throw error;
    return { updated: true };
  });

export const deleteManagerNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => noteIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertSuperAdmin(supabaseAdmin, context.userId);

    const { error } = await supabaseAdmin
      .from("kpi_notes")
      .delete()
      .eq("id", data.id)
      .select("id")
      .single();

    if (error) throw error;
    return { deleted: true };
  });

async function assertSuperAdmin(supabaseAdmin: any, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Only super admins can edit or delete manager notes.");
}
