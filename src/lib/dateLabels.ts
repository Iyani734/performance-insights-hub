const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

export function formatDateOnly(
  iso: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" },
) {
  const match = DATE_ONLY_RE.exec(iso);
  if (!match) return iso;

  const [, yearValue, monthValue, dayValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return iso;

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString(undefined, {
    ...options,
    timeZone: "UTC",
  });
}
