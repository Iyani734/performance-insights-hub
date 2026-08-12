import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllSupabaseRows } from "@/lib/supabasePagination";
import {
  identifyTicketQcStageFromFileName,
  identifyTicketQualitySourceFromFileName,
} from "@/lib/reportTypes";

type UploadRow = {
  id: string;
  kind: string | null;
  file_name: string | null;
  file_path: string | null;
  uploaded_by?: string | null;
  week_start: string;
  effective_from: string | null;
  effective_to: string | null;
};

const replaceInputSchema = z.object({
  uploadIds: z.array(z.string().uuid()).min(1),
});

export const replaceSupersededUploads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => replaceInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const newUploadIds = new Set(data.uploadIds);

    const { data: newUploads, error: newUploadsError } = await supabaseAdmin
      .from("report_uploads")
      .select("id,kind,file_name,file_path,uploaded_by,week_start,effective_from,effective_to")
      .in("id", data.uploadIds);

    if (newUploadsError) throw newUploadsError;
    if (!newUploads?.length) return { deleted: 0, storageErrors: [] as string[] };

    if (!(await canEditUploads(supabaseAdmin, context.userId))) {
      throw new Error("You need Uploads edit access before replacing older uploads.");
    }

    const kinds = Array.from(
      new Set(newUploads.map((upload) => upload.kind).filter((kind): kind is string => !!kind)),
    );
    if (!kinds.length) return { deleted: 0, storageErrors: [] as string[] };

    const candidates = await fetchAllSupabaseRows<UploadRow>((from, to) =>
      supabaseAdmin
        .from("report_uploads")
        .select("id,kind,file_name,file_path,uploaded_by,week_start,effective_from,effective_to")
        .in("kind", kinds as any)
        .range(from, to),
    );

    const toDelete = new Map<string, UploadRow>();
    for (const upload of newUploads as UploadRow[]) {
      const uploadKey = replacementKey(upload);
      for (const candidate of candidates) {
        if (newUploadIds.has(candidate.id)) continue;
        if (replacementKey(candidate) === uploadKey) toDelete.set(candidate.id, candidate);
      }
    }

    const oldUploads = Array.from(toDelete.values());
    if (!oldUploads.length) return { deleted: 0, storageErrors: [] as string[] };

    const { error: deleteError } = await supabaseAdmin
      .from("report_uploads")
      .delete()
      .in(
        "id",
        oldUploads.map((upload) => upload.id),
      );
    if (deleteError) throw deleteError;

    const filePaths = oldUploads.map((upload) => upload.file_path).filter((path): path is string => !!path);
    const storageErrors: string[] = [];
    if (filePaths.length) {
      const { error: storageError } = await supabaseAdmin.storage.from("report-files").remove(filePaths);
      if (storageError) storageErrors.push(storageError.message);
    }

    return { deleted: oldUploads.length, storageErrors };
  });

function replacementKey(upload: UploadRow) {
  if (upload.kind === "active_review_final") return "active_review_final|snapshot";

  return [
    upload.kind ?? "",
    effectiveFrom(upload),
    effectiveTo(upload),
    sourceKey(upload),
  ].join("|");
}

function sourceKey(upload: UploadRow) {
  if (upload.kind === "ticket_qc") {
    return identifyTicketQcStageFromFileName(upload.file_name ?? "") ?? "unknown";
  }
  if (upload.kind === "ticket_quality") {
    return identifyTicketQualitySourceFromFileName(upload.file_name ?? "") ?? "unknown";
  }
  return "default";
}

function effectiveFrom(upload: UploadRow) {
  return upload.effective_from ?? upload.week_start;
}

function effectiveTo(upload: UploadRow) {
  return upload.effective_to ?? addDaysUtc(upload.week_start, 6);
}

function addDaysUtc(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function canEditUploads(supabaseAdmin: any, userId: string) {
  const [{ data: roles, error: rolesError }, { data: perm, error: permError }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin.from("page_permissions").select("can_edit").eq("user_id", userId).eq("page", "uploads").maybeSingle(),
  ]);
  if (rolesError) throw rolesError;
  if (permError) throw permError;
  if ((roles ?? []).some((row: any) => row.role === "super_admin")) return true;
  return !!perm?.can_edit;
}
