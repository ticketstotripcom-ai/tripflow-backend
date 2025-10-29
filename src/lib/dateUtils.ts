// Unified date utilities for display, parsing, sorting, and Sheets I/O

export type DateInput = string | number | Date | null | undefined;

/** Parse various date shapes commonly seen in Sheets into a Date */
export function parseFlexibleDate(input: DateInput): Date | null {
  if (input === null || input === undefined) return null;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === 'number') {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(input).trim();
  if (!s) return null;

  // mm/dd/yyyy or mm/dd/yy
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const mm = Number(m[1]);
    const dd = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy = 2000 + yy;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // dd-Month-yy or dd-Month-yyyy (e.g., 03-April-25)
  m = s.match(/^(\d{1,2})-([A-Za-z]+)-(\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const monthName = m[2];
    let yy = Number(m[3]);
    if (yy < 100) yy = 2000 + yy;
    const monthIndex = new Date(`${monthName} 1, 2000`).getMonth();
    if (isNaN(monthIndex)) return null;
    const d = new Date(yy, monthIndex, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // dd/mm/yyyy or dd-mm-yyyy (ambiguous with mm/dd/yyyy). If first > 12, treat as dd/mm/yyyy
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy = 2000 + yy;
    const d = a > 12 ? new Date(yy, b - 1, a) : new Date(yy, a - 1, b);
    return isNaN(d.getTime()) ? null : d;
  }

  // ISO or other JS-parseable formats
  const iso = new Date(s);
  return isNaN(iso.getTime()) ? null : iso;
}

/** Format Date objects into `mm/dd/yyyy` for Google Sheets */
export function formatSheetDate(input: DateInput): string {
  const d = parseFlexibleDate(input);
  if (!d) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

/** Format for UI: `25 October 2025` (no commas, full month) */
export function formatDisplayDate(input: DateInput): string {
  const d = parseFlexibleDate(input);
  if (!d) return '';
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const day = String(d.getDate());
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/** `yyyy-MM-dd` for inputs */
export function formatISODate(input: DateInput): string {
  const d = parseFlexibleDate(input);
  if (!d) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Compare descending by date (newest first). Undefined/invalid last. */
export function compareDescByDate(a: DateInput, b: DateInput): number {
  const da = parseFlexibleDate(a);
  const db = parseFlexibleDate(b);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return db.getTime() - da.getTime();
}

export function isPast(input: DateInput): boolean {
  const d = parseFlexibleDate(input);
  if (!d) return false;
  const today = new Date();
  today.setHours(0,0,0,0);
  d.setHours(0,0,0,0);
  return d.getTime() < today.getTime();
}

export function isToday(input: DateInput): boolean {
  const d = parseFlexibleDate(input);
  if (!d) return false;
  const today = new Date();
  return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
}

/** Attempt to extract a date embedded inside a free-form text (e.g., notes) */
export function extractAnyDateFromText(text: string | null | undefined): Date | null {
  if (!text) return null;
  // Try common mm/dd/yyyy and dd-Month-yyyy patterns
  const mmddyyyy = text.match(/(\b\d{1,2}\/\d{1,2}\/\d{2,4}\b)/);
  if (mmddyyyy) {
    return parseFlexibleDate(mmddyyyy[1]);
  }
  const ddMonY = text.match(/(\b\d{1,2}-[A-Za-z]+-\d{2,4}\b)/);
  if (ddMonY) {
    return parseFlexibleDate(ddMonY[1]);
  }
  // Try yyyy-mm-dd
  const iso = text.match(/(\b\d{4}-\d{2}-\d{2}\b)/);
  if (iso) return parseFlexibleDate(iso[1]);
  return null;
}
