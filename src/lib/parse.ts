import * as XLSX from "xlsx";

const DEFAULT_WORKBOOK_PASSWORD = "ARC2026barricades";

export type ParsedTicket = {
  ticket_no?: string;
  ticket_id?: string;
  customer_id_ext?: string;
  customer?: string;
  status?: string;
  order_type?: string;
  order_category?: string;
  job_no?: string;
  type?: string;
  city?: string;
  rental_start?: string | null;
  date_recv?: string | null;
  final_edited_by?: string;
  void_reason?: string;
  raw: Record<string, any>;
};

export type ParseStats = {
  source_rows: number;
  sheet_rows?: number;
  imported: number;
  skipped: number;
  errors: number;
  error_details: { row: number; reason: string }[];
};

export type TicketQualityCountSource = "errors" | "total";

export type ParsedCountRow = {
  raw: Record<string, any>;
};

function toISODate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") {
    const utc = new Date(Math.round((v - 25569) * 86400 * 1000));
    return utc.toISOString();
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function s(v: any): string | undefined {
  if (v == null) return undefined;
  const str = String(v).trim();
  return str === "" ? undefined : str;
}

function pickInt(v: any): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

function daysBetween(dateStr: string | null | undefined): number | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return undefined;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
}

function sheetRowCount(sheet: XLSX.WorkSheet): number | undefined {
  if (!sheet["!ref"]) return undefined;
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  return range.e.r - range.s.r + 1;
}

export async function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { cellDates: true, password: DEFAULT_WORKBOOK_PASSWORD });
}

export function parseTicketsSheet(wb: XLSX.WorkBook): { rows: ParsedTicket[]; stats: ParseStats } {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });
  const cells = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null });
  const stats: ParseStats = { source_rows: raw.length, sheet_rows: sheetRowCount(sheet), imported: 0, skipped: 0, errors: 0, error_details: [] };
  const rows: ParsedTicket[] = [];
  raw.forEach((r, i) => {
    try {
      const rowCells = cells[i + 1] ?? [];
      const rowRaw = { ...r };
      if (!hasHeader(rowRaw, "Status") && rowCells[5] != null) rowRaw["Status"] = rowCells[5];
      if (!hasHeader(rowRaw, "Deliver/Pickup") && rowCells[9] != null)
        rowRaw["Deliver/Pickup"] = rowCells[9];
      const ticket_no = s(r["Ticket #"]) ?? s(r["TicketID"]);
      if (!ticket_no && !s(r["Job #"])) { stats.skipped++; return; }
      rows.push({
        ticket_no,
        ticket_id: s(r["TicketID"]),
        customer_id_ext: s(r["Customer ID"]),
        customer: s(r["Customer"]),
        status: s(rowRaw["Status"]),
        order_type: s(r["OrderType"]),
        order_category: s(r["Order Category"]),
        job_no: s(r["Job #"]),
        type: s(r["Type"]),
        city: s(r["City"]),
        rental_start: toISODate(r["Rental Start"])?.slice(0, 10) ?? null,
        date_recv: toISODate(r["Date Recv"]),
        final_edited_by: s(r["Final Edited By"]) ?? s(r["FinalEditedBy"]),
        void_reason: s(r["Void Reason"]),
        raw: rowRaw,
      });
      stats.imported++;
    } catch (e: any) {
      stats.errors++;
      stats.error_details.push({ row: i + 2, reason: e?.message ?? "parse error" });
    }
  });
  return { rows, stats };
}

export function parseTicketQualityCountSheet(
  wb: XLSX.WorkBook,
  source: TicketQualityCountSource,
): { rows: ParsedCountRow[]; stats: ParseStats } {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });
  const headerIndex = findCountHeaderIndex(rows, source);
  const headers = (rows[headerIndex] ?? []).map((cell, index) => s(cell) ?? `Column ${index + 1}`);
  const dataRows = rows.slice(headerIndex + 1);
  const stats: ParseStats = {
    source_rows: dataRows.length,
    sheet_rows: sheetRowCount(sheet),
    imported: 0,
    skipped: 0,
    errors: 0,
    error_details: [],
  };
  const parsedRows: ParsedCountRow[] = [];

  dataRows.forEach((row, index) => {
    try {
      if (!rowHasAnyValue(row)) {
        stats.skipped++;
        return;
      }
      const record = rowToRecord(headers, row);
      if (!isCountableRow(record, row, source)) {
        stats.skipped++;
        return;
      }
      parsedRows.push({ raw: record });
      stats.imported++;
    } catch (e: any) {
      stats.errors++;
      stats.error_details.push({ row: headerIndex + index + 2, reason: e?.message ?? "parse error" });
    }
  });

  return { rows: parsedRows, stats };
}

function hasHeader(row: Record<string, any>, header: string) {
  const target = normalizeHeader(header);
  return Object.keys(row).some((key) => normalizeHeader(key) === target);
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function findCountHeaderIndex(rows: any[][], source: TicketQualityCountSource) {
  const expected =
    source === "total"
      ? ["ticketid", "ticket", "job"]
      : ["name", "infractiontype", "ticketnumber"];

  const found = rows.findIndex((row) => {
    const normalized = row.map((cell) => normalizeHeader(String(cell ?? "")));
    return expected.some((header) => normalized.includes(header));
  });

  return found >= 0 ? found : 0;
}

function rowToRecord(headers: string[], row: any[]) {
  return row.reduce<Record<string, any>>((record, value, index) => {
    record[headers[index] ?? `Column ${index + 1}`] = value;
    return record;
  }, {});
}

function rowHasAnyValue(row: any[]) {
  return row.some((value) => hasCellValue(value));
}

function hasCellValue(value: unknown) {
  return String(value ?? "").trim() !== "";
}

function isCountableRow(record: Record<string, any>, row: any[], source: TicketQualityCountSource) {
  if (source === "total") {
    return hasAnyNormalizedRecordValue(record, ["ticketid", "ticket", "ticketno", "job", "jobno"]) || rowHasAnyValue(row);
  }

  return (
    hasAnyNormalizedRecordValue(record, ["name"]) &&
    hasAnyNormalizedRecordValue(record, ["ticketnumber", "infractiontype", "infractionsummary"])
  );
}

function hasAnyNormalizedRecordValue(record: Record<string, any>, normalizedKeys: string[]) {
  const entries = Object.entries(record);
  return normalizedKeys.some((wanted) =>
    entries.some(([key, value]) => normalizeHeader(key).includes(wanted) && hasCellValue(value)),
  );
}

export type ParsedOpenJob = {
  customer_key: string;
  customer_name: string;
  job_no?: string;
  ticket_no?: string;
  order_type?: string;
  address?: string;
  status?: string;
  age_days?: number;
  technician?: string;
  notes?: string;
  last_activity?: string;
  details: Record<string, any>;
};

// Handles both grouped ("Customer: KEY - Name" section headers) and flat tables.
export function parseOpenJobsSheet(wb: XLSX.WorkBook): { rows: ParsedOpenJob[]; stats: ParseStats } {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const stats: ParseStats = { source_rows: 0, sheet_rows: sheetRowCount(sheet), imported: 0, skipped: 0, errors: 0, error_details: [] };

  // First try: keyed rows (typical CSV/XLSX export with headers)
  const keyed = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });
  const keyedHasHeaders = keyed.length > 0 &&
    Object.keys(keyed[0]).some(k => /customer/i.test(k)) &&
    Object.keys(keyed[0]).some(k => /job|ticket/i.test(k));

  if (keyedHasHeaders) {
    stats.source_rows = keyed.length;
    const rows: ParsedOpenJob[] = [];
    keyed.forEach((r, i) => {
      try {
        const name = s(r["Customer"]) ?? s(r["Customer Name"]) ?? s(r["Company"]);
        if (!name) { stats.skipped++; return; }
        const key = s(r["Customer ID"]) ?? s(r["Customer Key"]) ?? name.toUpperCase().replace(/\W+/g, "").slice(0, 20);
        const last = s(r["Last Activity"]) ?? s(r["LastActivity"]);
        rows.push({
          customer_key: key!,
          customer_name: name,
          job_no: s(r["Job #"]) ?? s(r["Job"]),
          ticket_no: s(r["Ticket #"]) ?? s(r["Ticket"]),
          order_type: s(r["Type"]) ?? s(r["Order Type"]),
          address: s(r["Address"]) ?? s(r["Location"]) ?? s(r["Site"]),
          status: s(r["Status"]) ?? s(r["State"]),
          age_days: pickInt(r["Age"]) ?? pickInt(r["Aging"]) ?? daysBetween(toISODate(r["Created"]) ?? toISODate(r["Date"]) ?? last),
          technician: s(r["Technician"]) ?? s(r["Driver"]) ?? s(r["Assigned To"]) ?? s(r["Assigned"]),
          notes: s(r["Notes"]) ?? s(r["Comments"]) ?? s(r["Remarks"]),
          last_activity: last,
          details: r,
        });
        stats.imported++;
      } catch (e: any) {
        stats.errors++;
        stats.error_details.push({ row: i + 2, reason: e?.message ?? "parse error" });
      }
    });
    return { rows, stats };
  }

  // Fallback: the grouped section-header layout
  const arrRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null });
  stats.source_rows = arrRows.length;
  const rows: ParsedOpenJob[] = [];
  let currentKey = "UNKNOWN";
  let currentName = "Unknown Customer";
  arrRows.forEach((row, i) => {
    if (!row || row.every((c) => c == null || String(c).trim() === "")) return;
    const first = row[0] ? String(row[0]).trim() : "";
    const m = first.match(/^Customer:\s*([^\s-]+)\s*-\s*(.+)$/i);
    if (m) { currentKey = m[1].trim(); currentName = m[2].trim(); return; }
    if (/^Job #|^Ticket|^-{3,}/i.test(first)) return;
    if (/Job Count:/i.test(String(row[row.length - 1] ?? ""))) return;
    const cells = row.map((c) => (c == null ? "" : String(c).trim()));
    if (cells.every(c => c === "")) return;
    try {
      rows.push({
        customer_key: currentKey,
        customer_name: currentName,
        job_no: cells[0] || undefined,
        ticket_no: cells[1] || undefined,
        order_type: cells[2] || undefined,
        address: cells[3] || undefined,
        status: cells[4] || undefined,
        technician: cells[6] || undefined,
        last_activity: cells[5] || undefined,
        age_days: daysBetween(cells[5]),
        details: { row: cells },
      });
      stats.imported++;
    } catch (e: any) {
      stats.errors++;
      stats.error_details.push({ row: i + 1, reason: e?.message ?? "parse error" });
    }
  });
  return { rows, stats };
}

export function downloadXlsx(rows: any[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, filename);
}
