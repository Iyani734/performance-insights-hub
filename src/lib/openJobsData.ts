import { supabase } from "@/integrations/supabase/client";
import { isSeededDemoPayload, isSeededDemoUpload } from "@/lib/liveData";
import { uniqueOpenJobs } from "@/lib/openJobs";
import { isOpenJobsUpload } from "@/lib/reportTypes";
import { fetchAllSupabaseRows } from "@/lib/supabasePagination";

export type OpenJobsUploadRow = {
  id: string;
  kind: string | null;
  file_name: string | null;
  status: string | null;
  week_start: string;
  created_at: string;
};

export async function fetchLatestOpenJobsUpload() {
  const data = await fetchAllSupabaseRows<OpenJobsUploadRow>((from, to) =>
    supabase
      .from("report_uploads")
      .select("id,kind,file_name,status,week_start,created_at")
      .eq("kind", "open_jobs" as any)
      .order("created_at", { ascending: false })
      .range(from, to),
  );

  return (
    data
      .filter((upload) => !isSeededDemoUpload(upload.file_name))
      .filter((upload) => upload.status !== "failed" && upload.status !== "processing")
      .find(isOpenJobsUpload) ?? null
  );
}

export async function fetchLatestOpenJobsRows() {
  const latestUpload = await fetchLatestOpenJobsUpload();
  if (!latestUpload) return { upload: null, rows: [] as any[] };

  const data = await fetchAllSupabaseRows<any>((from, to) =>
    supabase
      .from("open_jobs")
      .select("*")
      .eq("upload_id", latestUpload.id)
      .order("customer_name")
      .range(from, to),
  );

  return {
    upload: latestUpload,
    rows: uniqueOpenJobs(data.filter((row) => !isSeededDemoPayload(row.details))),
  };
}
