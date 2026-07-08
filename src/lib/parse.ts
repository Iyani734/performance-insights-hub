import * as XLSX from "xlsx";

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
  imported: number;
  skipped: number;
  errors: number;
  error_details: { row: number; reason: string }[];
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

export async function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { cellDates: true });
}

export function parseTicketsSheet(wb: XLSX.WorkBook): { rows: ParsedTicket[]; stats: ParseStats } {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });
  const stats: ParseStats = { imported: 0, skipped: 0, errors: 0, error_details: [] };
  const rows: ParsedTicket[] = [];
  raw.forEach((r, i) => {
    try {
      const ticket_no = s(r["Ticket #"]) ?? s(r["TicketID"]);
      if (!ticket_no && !s(r["Job #"])) { stats.skipped++; return; }
      rows.push({
        ticket_no,
        ticket_id: s(r["TicketID"]),
        customer_id_ext: s(r["Customer ID"]),
        customer: s(r["Customer"]),
        status: s(r["Status"]),
        order_type: s(r["OrderType"]),
        order_category: s(r["Order Category"]),
        job_no: s(r["Job #"]),
        type: s(r["Type"]),
        city: s(r["City"]),
        rental_start: toISODate(r["Rental Start"])?.slice(0, 10) ?? null,
        date_recv: toISODate(r["Date Recv"]),
        final_edited_by: s(r["Final Edited By"]) ?? s(r["FinalEditedBy"]),
        void_reason: s(r["Void Reason"]),
        raw: r,
      });
      stats.imported++;
    } catch (e: any) {
      stats.errors++;
      stats.error_details.push({ row: i + 2, reason: e?.message ?? "parse error" });
    }
  });
  return { rows, stats };
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
  const stats: ParseStats = { imported: 0, skipped: 0, errors: 0, error_details: [] };
  const sheet = wb.Sheets[wb.SheetNames[0]];

  // First try: keyed rows (typical CSV/XLSX export with headers)
  const keyed = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });
  const keyedHasHeaders = keyed.length > 0 &&
    Object.keys(keyed[0]).some(k => /customer/i.test(k)) &&
    Object.keys(keyed[0]).some(k => /job|ticket/i.test(k));

  if (keyedHasHeaders) {
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
