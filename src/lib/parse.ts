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

function toISODate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") {
    // Excel serial date
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

export async function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { cellDates: true });
}

export function parseTicketsSheet(wb: XLSX.WorkBook): ParsedTicket[] {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });
  return rows.map((r) => ({
    ticket_no: s(r["Ticket #"]),
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
  }));
}

export type ParsedOpenJob = {
  customer_key: string;
  customer_name: string;
  job_no?: string;
  ticket_no?: string;
  order_type?: string;
  last_activity?: string;
  details: Record<string, any>;
};

// Open Jobs TCR export uses a customer-grouped layout: rows like
// "Customer: KEY - Name" followed by job rows underneath.
export function parseOpenJobsSheet(wb: XLSX.WorkBook): ParsedOpenJob[] {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null });
  const out: ParsedOpenJob[] = [];
  let currentKey = "UNKNOWN";
  let currentName = "Unknown Customer";
  for (const row of rows) {
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;
    const first = row[0] ? String(row[0]).trim() : "";
    const m = first.match(/^Customer:\s*([^\s-]+)\s*-\s*(.+)$/i);
    if (m) {
      currentKey = m[1].trim();
      currentName = m[2].trim();
      continue;
    }
    // skip header/section rows
    if (/^Job #|^Ticket|^-{3,}/i.test(first)) continue;
    if (/Job Count:/i.test(String(row[row.length - 1] ?? ""))) continue;

    // job rows: assume first non-empty cell = Job #, then Ticket #, etc.
    const cells = row.map((c) => (c == null ? "" : String(c).trim()));
    const nonEmpty = cells.filter((c) => c !== "");
    if (nonEmpty.length === 0) continue;
    out.push({
      customer_key: currentKey,
      customer_name: currentName,
      job_no: cells[0] || undefined,
      ticket_no: cells[1] || undefined,
      order_type: cells[2] || undefined,
      last_activity: cells[5] || cells[4] || undefined,
      details: { row: cells },
    });
  }
  return out;
}

export function downloadXlsx(rows: any[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, filename);
}
