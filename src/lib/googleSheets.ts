// googleSheets.ts
// Google Sheets API integration
import { parseFlexibleDate as parseFlexibleDateUtil, formatSheetDate } from './dateUtils';
import { enqueue } from './offlineQueue';
import { parseServiceAccountJson, ServiceAccountJson } from './serviceAccount';

// Add these interfaces for type safety 
export interface GoogleSheetsApiResponse {
  sheets: SheetData[];
}

export interface SheetData {
  data: {
    rowData: RowData[];
  }[];
}

export interface RowData {
  values: CellData[];
}

export interface CellData {
  effectiveValue?: {
    stringValue?: string;
    numberValue?: number;
  };
  note?: string;
}

export interface GSheetError {
  error: {
    code: number;
    message: string;
    status: string;
  };
}

export interface GoogleSheetsConfig {
  apiKey?: string;
  // Can be a raw JSON string or a parsed object
  serviceAccountJson?: ServiceAccountJson;
  sheetId: string;
  worksheetNames: string[];
  columnMappings: Record<string, string>;
}

export interface SheetUser {
  name: string;
  email: string;
  phone: string;
  role: 'admin' | 'consultant';
  password: string;
}

export interface SheetLead {
  tripId: string;
  dateAndTime: string;
  consultant: string;
  status: string;
  travellerName: string;
  travelDate: string;
  travelState: string;
  destination?: string;
  remarks: string;
  nights: string;
  pax: string;
  hotelCategory: string;
  mealPlan: string;
  phone: string;
  email: string;
  priority?: string;
  remarkHistory?: string[];
  notes?: string;
  timeStamp?: string;
  _rowNumber?: number; // Actual Google Sheet row number
}

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const OFFLINE_ERROR_SNIPPETS = [
  'failed to fetch',
  'networkerror',
  'network request failed',
  'offline',
];

function isLikelyOfflineError(error: unknown): boolean {
  if (!error) return false;
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!message) return error instanceof TypeError;
  const normalized = message.toLowerCase();
  return OFFLINE_ERROR_SNIPPETS.some((snippet) => normalized.includes(snippet));
}

// Optional safe fallback for Node-style Google client usage
export function getAuthorizedClient(serviceAccountJson: ServiceAccountJson) {
  try {
    if (!serviceAccountJson) throw new Error('Missing service account JSON');
    // @ts-expect-error - `google` may not be available in this environment; this is an optional helper
    return new google.auth.JWT({
      email: serviceAccountJson.client_email,
      key: String(serviceAccountJson.private_key || '').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } catch (err) {
    console.error('❌ Failed to build JWT client:', err);
    return null;
  }
}

export class GoogleSheetsService {
  private config: GoogleSheetsConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private parsedServiceAccount: ServiceAccountJson = null;
  
  private leadsCache: { data: SheetLead[]; timestamp: number } | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(config: GoogleSheetsConfig) {
    this.config = config;
  }

  /** Ensure and return parsed Service Account object, with localStorage fallback */
  private getParsedServiceAccount(): ServiceAccountJson {
    let sa = this.config.serviceAccountJson;

    // If missing, try localStorage fallback to reduce chances of missing credentials in previews
    if (!sa && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('serviceAccountJson');
        if (saved) {
          sa = saved;
        }
      } catch (e) {
        // Ignore potential security errors from localStorage access
      }
    }

    if (!sa) return null;

    if (typeof sa === 'string') {
      const parsed = parseServiceAccountJson(sa);
      if (!parsed) return null;
      this.config.serviceAccountJson = parsed;
      this.parsedServiceAccount = parsed;
      return parsed;
    }

    // Already an object
    this.parsedServiceAccount = sa;
    return sa;
  }

  /** Normalize sheet name by stripping any accidental range syntax */
  private normalizeSheetName(name: string): string {
    if (!name) return '';
    return name.includes('!') ? name.split('!')[0] : name;
  }

  /** Generate access token using Service Account JSON */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;

    const serviceAccount = this.getParsedServiceAccount();
    if (!serviceAccount || !serviceAccount.private_key) {
      console.error('❌ Missing or invalid service account JSON');
      throw new Error('Service account JSON invalid or missing');
    }
    console.log('✅ Using valid service account credentials');

    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 3600;

    const header = { alg: 'RS256', typ: 'JWT', kid: serviceAccount.private_key_id };
    const payload = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: expiry,
      iat: now,
    };

    const base64url = (str: string) =>
      btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const headerEncoded = base64url(JSON.stringify(header));
    const payloadEncoded = base64url(JSON.stringify(payload));
    const unsignedToken = `${headerEncoded}.${payloadEncoded}`;

    const privateKey = String(serviceAccount.private_key)
      .replace(/\\n/g, '\n')
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\s/g, '');

    const binaryKey = Uint8Array.from(atob(privateKey), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(unsignedToken)
    );
    const signatureBase64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
    const jwt = `${unsignedToken}.${signatureBase64}`;

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000 - 60000;
    return this.accessToken;
  }

  private columnToIndex(col: string): number {
    let index = 0;
    for (let i = 0; i < col.length; i++) {
      index = index * 26 + (col.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return index - 1;
  }

  private indexToColumn(index: number): string {
    let col = "";
    let n = index + 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      col = String.fromCharCode(65 + rem) + col;
      n = Math.floor((n - 1) / 26);
    }
    return col;
  }

  /** Simple wrapper to read rows from a worksheet. If a range like 'A2:K10000' is provided, it is used as-is. */
  async getRows(sheetName: string, range?: string): Promise<(string | number | null)[][]> {
    const worksheetName = this.normalizeSheetName(sheetName);
    const r = range ? `${worksheetName}!${range}` : `${worksheetName}`;
    let url: string;
    const headers: Record<string, string> = {};
    if (this.config.serviceAccountJson) {
      const sa = this.getParsedServiceAccount();
      if (!sa || !sa.private_key) throw new Error('Service account JSON invalid or missing');
      const token = await this.getAccessToken();
      url = `${SHEETS_API_BASE}/${this.config.sheetId}/values/${encodeURIComponent(r)}`;
      headers['Authorization'] = `Bearer ${token}`;
    } else if (this.config.apiKey) {
      url = `${SHEETS_API_BASE}/${this.config.sheetId}/values/${encodeURIComponent(r)}?key=${this.config.apiKey}`;
    } else {
      throw new Error('Missing credentials: provide Service Account JSON or API Key');
    }
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Failed to fetch rows: ${response.statusText}`);
    const data = await response.json();
    const values: (string | number | null)[][] = data.values || [];
    // If no explicit range was provided, slice header
    return range ? values : (values.length > 1 ? values.slice(1) : []);
  }

  /** Append a row to a worksheet. Requires Service Account JSON. */
  async appendRow(sheetName: string, row: (string | number | null)[]): Promise<void> {
    if (!this.config.serviceAccountJson) throw new Error('Service Account JSON required to append rows');
    const sa = this.getParsedServiceAccount();
    if (!sa || !sa.private_key) throw new Error('Service account JSON invalid or missing');
    const worksheetName = this.normalizeSheetName(sheetName);
    const token = await this.getAccessToken();
    const url = `${SHEETS_API_BASE}/${this.config.sheetId}/values/${encodeURIComponent(worksheetName)}:append?valueInputOption=USER_ENTERED`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ values: [row] }),
    });
    if (!res.ok) throw new Error(await res.text());
  }

  /** Batch update individual cells by zero-based column index and 1-based row number. */
  async batchUpdateCells(sheetName: string, updates: { row: number; column: number; value: string | number | boolean }[]): Promise<void> {
    if (!this.config.serviceAccountJson) throw new Error('Service Account JSON required to update cells');
    const sa = this.getParsedServiceAccount();
    if (!sa || !sa.private_key) throw new Error('Service account JSON invalid or missing');
    const token = await this.getAccessToken();
    const worksheetName = this.normalizeSheetName(sheetName);
    const data = updates.map((u) => ({
      range: `${worksheetName}!${this.indexToColumn(u.column)}${u.row}`,
      values: [[u.value]],
    }));
    const batchUrl = `${SHEETS_API_BASE}/${this.config.sheetId}/values:batchUpdate`;
    const res = await fetch(batchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
    });
    if (!res.ok) throw new Error(await res.text());
  }

  public clearLeadsCache(): void {
    this.leadsCache = null;
    console.log('🗑️ Leads cache cleared');
  }

  /** Fetch users */
  async fetchUsers(): Promise<SheetUser[]> {
    const worksheetName = this.normalizeSheetName(this.config.worksheetNames[1] || 'BACKEND SHEET');
    // Read the entire used range by specifying only the sheet name
    const range = `${worksheetName}`;

    let url: string;
    const headers: Record<string, string> = {};
    // Prefer service account if available (works for private sheets)
    if (this.config.serviceAccountJson) {
      const sa = this.getParsedServiceAccount();
      if (!sa || !sa.private_key) {
        console.error('❌ Missing or invalid service account JSON');
        throw new Error('Service account JSON invalid or missing');
      }
      console.log('✅ Using valid service account credentials');
      const token = await this.getAccessToken();
      url = `${SHEETS_API_BASE}/${this.config.sheetId}/values/${encodeURIComponent(range)}`;
      headers['Authorization'] = `Bearer ${token}`;
    } else if (this.config.apiKey) {
      url = `${SHEETS_API_BASE}/${this.config.sheetId}/values/${encodeURIComponent(range)}?key=${this.config.apiKey}`;
    } else {
      throw new Error('Missing credentials: provide Service Account JSON or API Key');
    }

    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Failed to fetch users: ${response.statusText}`);
    const data = await response.json();
    const rows: (string | number | null)[][] = data.values || [];

    // ✅ Skip the header row
    const slicedRows = rows.length > 1 ? rows.slice(1) : [];

    // Map using fixed columns per spec: C,D,E,M,N (0-based: 2,3,4,12,13)
    return slicedRows
      .map((row: (string | number | null)[]) => ({
        name: String(row[2] ?? '').trim(),
        email: String(row[3] ?? '').trim(),
        phone: String(row[4] ?? '').trim(),
        role: String(row[12] ?? 'consultant').toLowerCase().trim() as 'admin' | 'consultant',
        password: String(row[13] ?? '').trim(),
      }))
      .filter((u) => u.email && u.password);
  }

  /** Append a user to BACKEND SHEET */
  async appendUser(user: SheetUser): Promise<void> {
    if (!this.config.serviceAccountJson) {
      throw new Error('Service Account JSON required to add users');
    }
    const sa = this.getParsedServiceAccount();
    if (!sa || !sa.private_key) {
      console.error('❌ Missing or invalid service account JSON');
      throw new Error('Service account JSON invalid or missing');
    }
    console.log('✅ Using valid service account credentials');
    const worksheetName = this.normalizeSheetName(this.config.worksheetNames[1] || 'BACKEND SHEET');
    const range = `${worksheetName}`;
    const token = await this.getAccessToken();
    const cm = this.config.columnMappings;

    const row: (string | number | null)[] = [];
    const maxCol = Math.max(
      ...['name', 'email', 'phone', 'role', 'password']
        .map((k) => cm[k as keyof typeof cm] || '')
        .filter(Boolean)
        .map((c) => this.columnToIndex(c))
    );
    for (let i = 0; i <= maxCol; i++) row[i] = '';

    const mapping: Record<string, string> = {
      name: cm.name || 'C',
      email: cm.email || 'D',
      phone: cm.phone || 'E',
      role: cm.role || 'M',
      password: cm.password || 'N',
    };

    Object.entries(mapping).forEach(([key, col]) => {
      const idx = this.columnToIndex(col);
      const value = user[key as keyof SheetUser];
      row[idx] = value ?? '';
    });

    console.log(`✅ Appending to sheet: ${worksheetName}`);
    console.log('✅ Using Service Account for Sheets write operation');
    const url = `${SHEETS_API_BASE}/${this.config.sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ values: [row] }),
    });
    if (!res.ok) throw new Error(await res.text());
  }

  /** 
   * ✅ FIXED: Fetch leads with ACTUAL row numbers
   * Now fetches ALL rows including empty ones to preserve row numbering
   */
  async fetchLeads(forceRefresh = false, signal?: AbortSignal): Promise<SheetLead[]> {
    if (!forceRefresh && this.leadsCache && Date.now() - this.leadsCache.timestamp < this.CACHE_TTL) {
      console.log('✅ Returning cached leads');
      return this.leadsCache.data;
    }

    console.log('🔄 Fetching fresh leads from Google Sheets...');
    
    const worksheetName = this.normalizeSheetName(this.config.worksheetNames[0] || 'MASTER DATA');
    const range = `${worksheetName}`;

    let url: string;
    const headers: Record<string, string> = {};
    // Prefer service account if available (works for private sheets)
    if (this.config.serviceAccountJson) {
      const sa = this.getParsedServiceAccount();
      if (!sa || !sa.private_key) {
        console.error('❌ Missing or invalid service account JSON');
        throw new Error('Service account JSON invalid or missing');
      }
      console.log('✅ Using valid service account credentials');
      const token = await this.getAccessToken();
      url = `${SHEETS_API_BASE}/${this.config.sheetId}/values/${encodeURIComponent(range)}`;
      headers['Authorization'] = `Bearer ${token}`;
    } else if (this.config.apiKey) {
      url = `${SHEETS_API_BASE}/${this.config.sheetId}/values/${encodeURIComponent(range)}?key=${this.config.apiKey}`;
    } else {
      throw new Error('Missing credentials: provide Service Account JSON or API Key');
    }

    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Failed to fetch leads: ${response.statusText}`);
    const data = await response.json();
    const allRows: (string | number | null)[][] = data.values || [];
    // ✅ Skip header row
    const rows: (string | number | null)[][] = allRows.length > 1 ? allRows.slice(1) : [];
    const cm = this.config.columnMappings;

    // ✅ CRITICAL FIX: Get the actual starting row from the range response
    // Google Sheets API might not return empty rows, so we need to track actual positions
    
    // Fetch with row metadata to get actual row numbers
    let actualRowNumbers: number[] = [];
    try {
      // Use the spreadsheet.get API to get row data with metadata for the entire sheet
      const metadataUrl = this.config.serviceAccountJson
        ? `${SHEETS_API_BASE}/${this.config.sheetId}?ranges=${encodeURIComponent(worksheetName)}&fields=sheets.data.rowData.values.effectiveValue`
        : `${SHEETS_API_BASE}/${this.config.sheetId}?ranges=${encodeURIComponent(worksheetName)}&fields=sheets.data.rowData.values.effectiveValue&key=${this.config.apiKey}`;

      const metadataHeaders = this.config.serviceAccountJson
        ? { Authorization: `Bearer ${await this.getAccessToken()}` }
        : {};
      const metadataResponse = await fetch(metadataUrl, { headers: metadataHeaders });
      
      if (metadataResponse.ok) {
        const metadataData: GoogleSheetsApiResponse = await metadataResponse.json();
        const rowData = metadataData.sheets?.[0]?.data?.[0]?.rowData || [];
        
        // Map which rows have data (skip header at index 0)
        rowData.forEach((row: RowData, index: number) => {
          if (index === 0) return; // skip header row
          if (row.values && row.values.some((v: CellData) => v.effectiveValue)) {
            actualRowNumbers.push(index + 1); // actual sheet row number
          }
        });
        
        console.log(`📊 Found ${actualRowNumbers.length} data rows (excluding header) out of ${rowData.length} total rows`);
      } else {
        const errorData: GSheetError = await metadataResponse.json();
        console.warn('⚠️ Failed to fetch row metadata:', errorData.error.message);
      }
    } catch (err) {
      console.warn('⚠️ Failed to fetch row metadata, falling back to sequential numbering:', err);
      // Fallback: assume sequential numbering
      actualRowNumbers = rows.map((_, i: number) => i + 2); // rows[] is header-sliced, so +2 is correct
    }

    // Optional notes
    const notesMap: Record<number, string> = {};
    try {
      const notesUrl = this.config.serviceAccountJson
        ? `${SHEETS_API_BASE}/${this.config.sheetId}?ranges=${encodeURIComponent(worksheetName)}&fields=sheets.data.rowData.values.note`
        : `${SHEETS_API_BASE}/${this.config.sheetId}?ranges=${encodeURIComponent(worksheetName)}&fields=sheets.data.rowData.values.note&key=${this.config.apiKey}`;

      const notesHeaders = this.config.serviceAccountJson
        ? { Authorization: `Bearer ${await this.getAccessToken()}` }
        : {};
      const notesResponse = await fetch(notesUrl, { headers: notesHeaders });
      if (notesResponse.ok) {
        const notesData: GoogleSheetsApiResponse = await notesResponse.json();
        const rowData = notesData.sheets?.[0]?.data?.[0]?.rowData || [];
        rowData.forEach((row: RowData, index: number) => {
          if (index === 0) return; // skip header row
          const cellNotes: string[] = (row.values || [])
            .map((v: CellData) => (v && v.note ? String(v.note) : ''))
            .filter((s: string) => !!s);
          if (cellNotes.length) notesMap[index - 1] = cellNotes.join(' | '); // align with header-sliced rows
        });
      }
    } catch (err) {
      console.warn('Failed to fetch notes:', err);
    }

    const leads = rows
      .map((row: (string | number | null)[], i: number) => {
        const travellerName = row[this.columnToIndex(cm.travellerName || 'E')] || '';
        const dateAndTime = row[this.columnToIndex(cm.dateAndTime || 'B')] || '';
        
        // ✅ Use actual row number from metadata, or fallback to sequential
        const actualRow = actualRowNumbers[i] || (i + 2);
        
        return {
          tripId: String(row[this.columnToIndex(cm.tripId || 'A')] || ''),
          dateAndTime: String(dateAndTime),
          consultant: String(row[this.columnToIndex(cm.consultant || 'C')] || ''),
          status: String(row[this.columnToIndex(cm.status || 'D')] || ''),
          travellerName: String(travellerName),
          travelDate: String(row[this.columnToIndex(cm.travelDate || 'G')] || ''),
          travelState: String(row[this.columnToIndex(cm.travelState || 'H')] || ''),
          destination: String(row[this.columnToIndex(cm.destination || 'I')] || ''),
          remarks: String(row[this.columnToIndex(cm.remarks || 'K')] || ''),
          nights: String(row[this.columnToIndex(cm.nights || 'L')] || ''),
          pax: String(row[this.columnToIndex(cm.pax || 'M')] || ''),
          hotelCategory: String(row[this.columnToIndex(cm.hotelCategory || 'N')] || ''),
          mealPlan: String(row[this.columnToIndex(cm.mealPlan || 'O')] || ''),
          phone: String(row[this.columnToIndex(cm.phone || 'P')] || ''),
          email: String(row[this.columnToIndex(cm.email || 'Q')] || ''),
          priority: String(row[this.columnToIndex(cm.priority || '')] || ''),
          remarkHistory:
            (cm.remarkHistory
              ? (String(row[this.columnToIndex(cm.remarkHistory || '')] || '')).split(';')
              : []) || [],
          notes: notesMap[i] || '',
          timeStamp: cm.timeStamp ? String((row[this.columnToIndex(cm.timeStamp || '')] || '')) : undefined,
          // ✅ CRITICAL: Store the ACTUAL row number from Google Sheets
          _rowNumber: actualRow,
        };
      })
      .filter((l) => l.travellerName && l.dateAndTime);

    // Debug logging
    if (leads.length > 0) {
      console.log(`📍 Sample lead row numbers:`, {
        first: `Row ${leads[0]._rowNumber}: ${leads[0].travellerName}`,
        last: `Row ${leads[leads.length - 1]._rowNumber}: ${leads[leads.length - 1].travellerName}`,
      });
    }

    this.leadsCache = {
      data: leads,
      timestamp: Date.now(),
    };

    console.log(`✅ Fetched ${leads.length} leads and cached them`);
    return leads;
  }

  /** Append new lead */
  async appendLead(lead: Partial<SheetLead>): Promise<void> {
    const queueOffline = async () => {
      await enqueue({ type: 'appendLead', config: this.config, lead });
      console.log('Offline: queued appendLead for later sync');
    };

    try {
      const worksheetName = this.normalizeSheetName(this.config.worksheetNames[0] || 'MASTER DATA');
      const range = `${worksheetName}`;
      console.log(`Appending to sheet: ${worksheetName}`);
      console.log('Using Service Account for Sheets write operation');
      const sa = this.getParsedServiceAccount();
      if (!sa || !sa.private_key) {
        console.error('??O Missing or invalid service account JSON');
        throw new Error('Service account JSON invalid or missing');
      }
      console.log('Using valid service account credentials');
      const token = await this.getAccessToken();
      const cm = this.config.columnMappings;

      const row: (string | number | null)[] = [];
      const maxCol = Math.max(...Object.values(cm).map((c) => this.columnToIndex(c)));

      for (let i = 0; i <= maxCol; i++) row[i] = '';

      for (const [key, col] of Object.entries(cm)) {
        if (!col) continue;
        const idx = this.columnToIndex(col);
        if (key in lead && lead[key as keyof SheetLead] !== undefined) {
          let value = lead[key as keyof SheetLead];
          if ((key === 'travelDate' || key === 'dateAndTime' || key === 'date') && typeof value === 'string') {
            value = formatSheetDate(value);
          }
          row[idx] = Array.isArray(value) ? value.join('; ') : value;
        }
      }

      // Explicit logging for critical fields
      console.log('dY+ Appending lead with fields:', {
        travellerName: lead.travellerName,
        travelDate: lead.travelDate,
        travelState: lead.travelState,
      });

      const url = `${SHEETS_API_BASE}/${this.config.sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ values: [row] }),
      });

      if (!res.ok) throw new Error(await res.text());
      console.log('Lead appended');
      
      this.clearLeadsCache();
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        await queueOffline();
        return;
      }
      throw error;
    }
  }

  // Date parsing/formatting is provided by dateUtils

  /** Update cell notes using the batchUpdate API */
  async updateCellNotes(sheetName: string, updates: { row: number; column: number; note: string }[]): Promise<void> {
    if (!this.config.serviceAccountJson) throw new Error('Service Account JSON required to update cell notes');
    const sa = this.getParsedServiceAccount();
    if (!sa || !sa.private_key) throw new Error('Service account JSON invalid or missing');
    const token = await this.getAccessToken();
    const worksheetName = this.normalizeSheetName(sheetName);

    // First, get the sheet ID from the spreadsheet
    const sheetMetadataUrl = `${SHEETS_API_BASE}/${this.config.sheetId}?fields=sheets.properties`;
    const metadataRes = await fetch(sheetMetadataUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!metadataRes.ok) {
      throw new Error(`Failed to fetch sheet metadata: ${await metadataRes.text()}`);
    }

    const metadata = await metadataRes.json();
    const sheet = metadata.sheets.find((s: any) => s.properties.title === worksheetName);
    
    if (!sheet) {
      throw new Error(`Sheet "${worksheetName}" not found`);
    }

    const sheetId = sheet.properties.sheetId;

    const requests = updates.map((u) => ({
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: u.row - 1, // 0-based index
          endRowIndex: u.row,
          startColumnIndex: u.column, // 0-based index
          endColumnIndex: u.column + 1,
        },
        rows: [{
          values: [{
            note: u.note
          }]
        }],
        fields: 'note'
      }
    }));

    const batchUrl = `${SHEETS_API_BASE}/${this.config.sheetId}:batchUpdate`;
    const res = await fetch(batchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requests }),
    });

    if (!res.ok) throw new Error(await res.text());
  }

  /** Update a lead by (date+traveller) using stored row number */
  async updateLead(
    identity: { dateAndTime: string; travellerName: string },
    updates: Partial<SheetLead>
  ): Promise<void> {
    const { dateAndTime, travellerName } = identity;

    if (!dateAndTime || !travellerName) {
      throw new Error('Date + Traveller Name required to update lead');
    }

    const queueOffline = async () => {
      await enqueue({ type: 'updateLead', config: this.config, identity, updates });
      console.log('Offline: queued updateLead for later sync');
    };

    const performUpdate = async () => {
      const leads = await this.fetchLeads();

      const targetDate = parseFlexibleDateUtil(dateAndTime);

      const sameDay = (d1: Date | null, d2: Date | null) =>
        !!d1 &&
        !!d2 &&
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();

      const matchedLead = leads.find((l) => {
        const ld = parseFlexibleDateUtil(l.dateAndTime);
        const dateMatch =
          sameDay(targetDate, ld) ||
          String(l.dateAndTime).trim() === String(dateAndTime).trim();
        const nameMatch =
          String(l.travellerName).trim().toLowerCase() ===
          String(travellerName).trim().toLowerCase();
        return dateMatch && nameMatch;
      });

      if (!matchedLead) {
        console.error('??O Lead not found. Search criteria:', { dateAndTime, travellerName });
        console.error(
          'dY"< Available leads sample:',
          leads.slice(0, 3).map((l) => ({
            date: l.dateAndTime,
            name: l.travellerName,
            row: l._rowNumber,
          }))
        );
        throw new Error(
          `Lead not found for Date: "${dateAndTime}" and Traveller: "${travellerName}"`
        );
      }

      if (!matchedLead._rowNumber || matchedLead._rowNumber < 2) {
        throw new Error('Invalid row number detected. Please refresh leads data.');
      }

      const rowNumber = matchedLead._rowNumber;

      console.log(`dYZ_ Updating lead:`, {
        date: dateAndTime,
        traveller: travellerName,
        actualSheetRow: rowNumber,
        updates: Object.keys(updates),
      });

      const cm = this.config.columnMappings;
      console.log('Using Service Account for Sheets write operation');
      const sa = this.getParsedServiceAccount();
      if (!sa || !sa.private_key) {
        console.error('??O Missing or invalid service account JSON');
        throw new Error('Service account JSON invalid or missing');
      }
      console.log('Using valid service account credentials');
      const token = await this.getAccessToken();

      const updateData: { range: string; values: (string | number | null)[][] }[] = [];
      let notesUpdate: { row: number; column: number; note: string } | null = null;

      for (const [key, rawValue] of Object.entries(updates)) {
        if (
          rawValue === undefined ||
          ['tripId', 'dateAndTime', '_rowNumber'].includes(key)
        ) {
          continue;
        }

        // Handle notes separately using cell notes API
        if (key === 'notes') {
          const remarksCol = cm['remarks'];
          if (remarksCol && rawValue) {
            notesUpdate = {
              row: rowNumber,
              column: this.columnToIndex(remarksCol),
              note: String(rawValue)
            };
          }
          continue;
        }

        const col = cm[key as keyof typeof cm];
        if (!col) continue;

        let value: string | number | null = rawValue as any;

        if (
          (key === 'travelDate' || key === 'dateAndTime' || key === 'date') &&
          typeof value === 'string'
        ) {
          value = formatSheetDate(value);
        }

        const cellRange = `${this.normalizeSheetName(
          this.config.worksheetNames[0]
        )}!${col}${rowNumber}`;
        updateData.push({
          range: cellRange,
          values: [[value]],
        });

        console.log(`Updating ${cellRange} = "${value}"`);
      }

      if (updateData.length === 0 && !notesUpdate) {
        console.log('No fields to update');
        return;
      }

      // Update cell values first
      if (updateData.length > 0) {
        const batchUrl = `${SHEETS_API_BASE}/${this.config.sheetId}/values:batchUpdate`;
        const res = await fetch(batchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updateData }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error('??O Failed to update lead in Google Sheets:', errText);
          throw new Error(errText);
        }
      }

      // Update cell notes if needed
      if (notesUpdate) {
        await this.updateCellNotes(this.config.worksheetNames[0], [notesUpdate]);
        console.log(`Updated cell note at row ${notesUpdate.row}, column ${notesUpdate.column}`);
      }

      console.log(`Lead updated successfully at row ${rowNumber}`);

      this.clearLeadsCache();
    };

    try {
      await performUpdate();
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        await queueOffline();
        return;
      }
      throw error;
    }
  }

}