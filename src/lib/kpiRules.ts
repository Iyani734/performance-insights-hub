export type TicketLike = {
  final_edited_by?: unknown;
  void_reason?: unknown;
  date_recv?: unknown;
  status?: unknown;
  raw?: unknown;
};

export type TicketQualityResult = {
  actual: number | null;
  issues: number;
  sourceRows: number;
};

const FINAL_EDIT_DATE_KEYS = [
  "Date Final Edited",
  "Final Edit Date",
  "Final Edited Date",
  "Final Edit Time",
  "Final Edited At",
  "Final Edit Timestamp",
  "Date Final Edit",
];

const DELIVER_PICKUP_DATE_KEYS = [
  "Deliver/Pickup",
  "Deliver/Pickup Date",
  "Delivery/Pickup",
  "Delivery Pickup",
  "Pickup/Delivery",
  "Pickup Date",
  "Delivery Date",
];

const QUALITY_ISSUE_KEYS = [
  "Void Reason",
  "Quality Issue",
  "Quality Issues",
  "Billing Issue",
  "Billing Issues",
  "Driver Error",
  "Driver Errors",
  "Error Type",
];

export function hasValue(value: unknown) {
  return String(value ?? "").trim() !== "";
}

export function normalizeTicketStatus(status: unknown) {
  const value = String(status ?? "")
    .trim()
    .toLowerCase();
  const compact = value.replace(/[\s_-]+/g, "");

  if (compact === "a" || compact === "active") return "active";
  if (compact === "e" || compact === "r" || compact === "review") return "review";
  if (compact === "f" || compact === "final" || compact === "finaledit" || compact === "finaledited") return "final edit";
  if (compact === "i" || compact === "invoiced" || compact === "invoice") return "invoiced";
  if (compact === "v" || compact === "void" || compact === "voided") return "voided";

  return value;
}

export function isFinalEditTicket(row: TicketLike) {
  return normalizeTicketStatus(row.status) === "final edit";
}

export function toDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const text = String(value).trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dateFromRaw(raw: unknown, keys: string[]): Date | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  for (const key of keys) {
    const exact = toDate(record[key]);
    if (exact) return exact;
  }

  const normalized = new Map(Object.keys(record).map((key) => [normalizeHeader(key), key]));
  for (const key of keys) {
    const actual = normalized.get(normalizeHeader(key));
    const value = actual ? toDate(record[actual]) : null;
    if (value) return value;
  }
  return null;
}

export function finalEditDateFromRow(row: TicketLike) {
  return dateFromRaw(row.raw, FINAL_EDIT_DATE_KEYS);
}

export function deliverPickupDateFromRow(row: TicketLike) {
  return dateFromRaw(row.raw, DELIVER_PICKUP_DATE_KEYS);
}

export function calculateReviewToFinalEdit(tickets: TicketLike[], from: string, to: string) {
  if (!tickets.length) return null;

  const hasFinalEditStatus = tickets.some((row) => isFinalEditTicket(row));
  const hasFinalEditDates = tickets.some((row) => finalEditDateFromRow(row));

  if (hasFinalEditDates) {
    const reviewed = tickets.filter((row) => {
      const finalEditDate = finalEditDateFromRow(row);
      if (!finalEditDate || !isDateInIsoRange(finalEditDate, from, to)) return false;
      return hasFinalEditStatus ? isFinalEditTicket(row) : true;
    }).length;
    return (reviewed / tickets.length) * 100;
  }

  const reviewed = hasFinalEditStatus
    ? tickets.filter((row) => isFinalEditTicket(row)).length
    : tickets.filter((row) => hasValue(row.final_edited_by)).length;
  return (reviewed / tickets.length) * 100;
}

/**
 * Count from the oldest Final Edit delivery/pickup date through the report's
 * selected Effective to date. This calculation must not depend on today's date.
 */
export function calculateInvoiceCycleTime(tickets: TicketLike[], effectiveToIso: string) {
  const effectiveTo = toDate(`${effectiveToIso}T00:00:00Z`);
  if (!effectiveTo) return null;

  const finalEditRows = tickets.filter((row) => isFinalEditTicket(row));
  const finalEditedByRows = tickets.filter((row) => hasValue(row.final_edited_by));
  const sourceRows = finalEditRows.length
    ? finalEditRows
    : finalEditedByRows.length
      ? finalEditedByRows
      : tickets;
  const deliverDates = sourceRows
    .map((row) => deliverPickupDateFromRow(row))
    .filter((date): date is Date => !!date && Number.isFinite(date.getTime()));

  if (!deliverDates.length) return null;
  const oldestDeliverPickup = deliverDates.reduce((oldest, date) =>
    date.getTime() < oldest.getTime() ? date : oldest,
  );

  return businessDaysBetween(oldestDeliverPickup, effectiveTo);
}

export function calculateTotalCycleTime(tickets: TicketLike[], throughDate = new Date()) {
  const oldestDeliverPickup = oldestDeliverPickupDate(tickets);
  if (!oldestDeliverPickup) return null;
  return businessDaysBetween(oldestDeliverPickup, throughDate);
}

export function oldestDeliverPickupDate(tickets: TicketLike[]) {
  const deliverDates = tickets
    .map((row) => deliverPickupDateFromRow(row))
    .filter((date): date is Date => !!date && Number.isFinite(date.getTime()));

  if (!deliverDates.length) return null;
  return deliverDates.reduce((oldest, date) =>
    date.getTime() < oldest.getTime() ? date : oldest,
  );
}

export function calculateTicketQuality(
  invoiced: TicketLike[],
  tickets: TicketLike[],
): TicketQualityResult {
  const source = invoiced.length > 0 ? invoiced : tickets;
  if (!source.length) return { actual: null, issues: 0, sourceRows: 0 };

  const issues = source.filter((row) => isQualityIssue(row)).length;
  return {
    actual: (issues / source.length) * 100,
    issues,
    sourceRows: source.length,
  };
}

function isQualityIssue(row: TicketLike) {
  if (hasValue(row.void_reason)) return true;
  if (!row.raw || typeof row.raw !== "object") return false;
  const record = row.raw as Record<string, unknown>;
  const normalized = new Map(Object.keys(record).map((key) => [normalizeHeader(key), key]));

  for (const key of QUALITY_ISSUE_KEYS) {
    const actual = normalized.get(normalizeHeader(key));
    if (actual && hasValue(record[actual])) return true;
  }
  return false;
}

function isDateInIsoRange(date: Date, from: string, to: string) {
  const day = toIsoDate(date);
  return day >= from && day <= to;
}

function businessDaysBetween(start: Date, end: Date) {
  const cursor = startOfUtcDay(start);
  const stop = startOfUtcDay(end);
  if (cursor >= stop) return 0;

  let days = 0;
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= stop) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) days++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toIsoDate(date: Date) {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
