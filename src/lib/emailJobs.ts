export function isQueuedTestEmail(row: { subject?: string | null; attachment_name?: string | null }) {
  return (
    /^\s*\[test\]\s*open jobs report\b/i.test(String(row.subject ?? "")) ||
    /-test\.xlsx$/i.test(String(row.attachment_name ?? ""))
  );
}
