// googleSheets.ts
// Google Sheets API integration

export interface GoogleSheetsConfig {
  apiKey?: string;
  serviceAccountJson?: string;
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
  _rowNumber?: number; // Actual Google Sheet row number
}

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export class GoogleSheetsService {
  private config: GoogleSheetsConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  
  private leadsCache: { data: SheetLead[]; timestamp: number } | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(config: GoogleSheetsConfig) {
    this.config = config;
  }

  /** Generate access token using Service Account JSON */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;

    if (!this.config.serviceAccountJson) {
      throw new Error('Service Account JSON required for write operations.');
    }

    const serviceAccount = JSON.parse(this.config.serviceAccountJson);
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

    const privateKey = serviceAccount.private_key
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

  public clearLeadsCache(): void {
    this.leadsCache = null;
    console.log('🗑️ Leads cache cleared');
  }

  /** Fetch users */
  async fetchUsers(): Promise<SheetUser[]> {
    const worksheetName = this.config.worksheetNames[1] || 'BACKEND SHEET';
    const range = `${worksheetName}!A2:Z1000`;

    let url: string;
    let headers: Record<string, string> = {};
    // Prefer service account if available (works for private sheets)
    if (this.config.serviceAccountJson) {
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
    const rows = data.values || [];
    const cm = this.config.columnMappings;

    return rows
      .map((row: any[]) => ({
        name: String(row[this.columnToIndex(cm.name || 'C')] || '').trim(),
        email: String(row[this.columnToIndex(cm.email || 'D')] || '').trim(),
        phone: String(row[this.columnToIndex(cm.phone || 'E')] || '').trim(),
        role: String(row[this.columnToIndex(cm.role || 'M')] || 'consultant')
          .toLowerCase()
          .trim() as 'admin' | 'consultant',
        password: String(row[this.columnToIndex(cm.password || 'N')] || '').trim(),
      }))
      .filter((u) => u.email && u.password);
  }

  /** 
   * ✅ FIXED: Fetch leads with ACTUAL row numbers
   * Now fetches ALL rows including empty ones to preserve row numbering
   */
  async fetchLeads(forceRefresh = false): Promise<SheetLead[]> {
    if (!forceRefresh && this.leadsCache && Date.now() - this.leadsCache.timestamp < this.CACHE_TTL) {
      console.log('✅ Returning cached leads');
      return this.leadsCache.data;
    }

    console.log('🔄 Fetching fresh leads from Google Sheets...');
    
    const worksheetName = this.config.worksheetNames[0] || 'MASTER DATA';
    const range = `${worksheetName}!A2:AZ10000`;

    let url: string;
    let headers: Record<string, string> = {};
    // Prefer service account if available (works for private sheets)
    if (this.config.serviceAccountJson) {
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
    const rows = data.values || [];
    const cm = this.config.columnMappings;

    // ✅ CRITICAL FIX: Get the actual starting row from the range response
    // Google Sheets API might not return empty rows, so we need to track actual positions
    
    // Fetch with row metadata to get actual row numbers
    let actualRowNumbers: number[] = [];
    try {
      // Use the spreadsheet.get API to get row data with metadata
      const metadataUrl = this.config.serviceAccountJson
        ? `${SHEETS_API_BASE}/${this.config.sheetId}?ranges=${encodeURIComponent(range)}&fields=sheets.data.rowData.values.effectiveValue`
        : `${SHEETS_API_BASE}/${this.config.sheetId}?ranges=${encodeURIComponent(range)}&fields=sheets.data.rowData.values.effectiveValue&key=${this.config.apiKey}`;

      const metadataHeaders = this.config.serviceAccountJson
        ? { Authorization: `Bearer ${await this.getAccessToken()}` }
        : {};
      const metadataResponse = await fetch(metadataUrl, { headers: metadataHeaders });
      
      if (metadataResponse.ok) {
        const metadataData = await metadataResponse.json();
        const rowData = metadataData.sheets?.[0]?.data?.[0]?.rowData || [];
        
        // Map which rows have data (starting from row 2)
        rowData.forEach((row: any, index: number) => {
          if (row.values && row.values.some((v: any) => v.effectiveValue)) {
            actualRowNumbers.push(index + 2); // +2 because we start from A2
          }
        });
        
        console.log(`📊 Found ${actualRowNumbers.length} rows with data out of ${rowData.length} total rows`);
      }
    } catch (err) {
      console.warn('⚠️ Failed to fetch row metadata, falling back to sequential numbering:', err);
      // Fallback: assume sequential numbering
      actualRowNumbers = rows.map((_: any, i: number) => i + 2);
    }

    // Optional notes
    let notesMap: Record<number, string> = {};
    try {
      const notesUrl = this.config.serviceAccountJson
        ? `${SHEETS_API_BASE}/${this.config.sheetId}?ranges=${encodeURIComponent(
            worksheetName
          )}!K2:K10000&fields=sheets.data.rowData.values.note`
        : `${SHEETS_API_BASE}/${this.config.sheetId}?ranges=${encodeURIComponent(
            worksheetName
          )}!K2:K10000&fields=sheets.data.rowData.values.note&key=${this.config.apiKey}`;

      const notesHeaders = this.config.serviceAccountJson
        ? { Authorization: `Bearer ${await this.getAccessToken()}` }
        : {};
      const notesResponse = await fetch(notesUrl, { headers: notesHeaders });
      if (notesResponse.ok) {
        const notesData = await notesResponse.json();
        const rowData = notesData.sheets?.[0]?.data?.[0]?.rowData || [];
        rowData.forEach((row: any, index: number) => {
          if (row.values?.[0]?.note) notesMap[index] = row.values[0].note;
        });
      }
    } catch (err) {
      console.warn('Failed to fetch notes:', err);
    }

    const leads = rows
      .map((row: any[], i: number) => {
        const travellerName = row[this.columnToIndex(cm.travellerName || 'E')] || '';
        const dateAndTime = row[this.columnToIndex(cm.dateAndTime || 'B')] || '';
        
        // ✅ Use actual row number from metadata, or fallback to sequential
        const actualRow = actualRowNumbers[i] || (i + 2);
        
        return {
          tripId: row[this.columnToIndex(cm.tripId || 'A')] || '',
          dateAndTime,
          consultant: row[this.columnToIndex(cm.consultant || 'C')] || '',
          status: row[this.columnToIndex(cm.status || 'D')] || '',
          travellerName,
          travelDate: row[this.columnToIndex(cm.travelDate || 'G')] || '',
          travelState: row[this.columnToIndex(cm.travelState || 'H')] || '',
          remarks: row[this.columnToIndex(cm.remarks || 'K')] || '',
          nights: row[this.columnToIndex(cm.nights || 'L')] || '',
          pax: row[this.columnToIndex(cm.pax || 'M')] || '',
          hotelCategory: row[this.columnToIndex(cm.hotelCategory || 'N')] || '',
          mealPlan: row[this.columnToIndex(cm.mealPlan || 'O')] || '',
          phone: row[this.columnToIndex(cm.phone || 'P')] || '',
          email: row[this.columnToIndex(cm.email || 'Q')] || '',
          priority: row[this.columnToIndex(cm.priority || '')] || '',
          remarkHistory:
            (cm.remarkHistory
              ? (row[this.columnToIndex(cm.remarkHistory || '')] || '').toString().split(';')
              : []) || [],
          notes: notesMap[i] || '',
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
    const worksheetName = this.config.worksheetNames[0] || 'MASTER DATA';
    const range = `${worksheetName}!A:Z`;
    const token = await this.getAccessToken();
    const cm = this.config.columnMappings;

    const row: any[] = [];
    const maxCol = Math.max(...Object.values(cm).map((c) => this.columnToIndex(c)));

    for (let i = 0; i <= maxCol; i++) row[i] = '';

    for (const [key, col] of Object.entries(cm)) {
      if (!col) continue;
      const idx = this.columnToIndex(col);
      if (key in lead && lead[key as keyof SheetLead] !== undefined) {
        const value = lead[key as keyof SheetLead];
        row[idx] = Array.isArray(value) ? value.join('; ') : value;
      }
    }

    const url = `${SHEETS_API_BASE}/${this.config.sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ values: [row] }),
    });

    if (!res.ok) throw new Error(await res.text());
    console.log('✅ Lead appended');
    
    this.clearLeadsCache();
  }

  /** Parse a date from common formats into a Date object */
  private parseFlexibleDate(input: string): Date | null {
    if (!input) return null;
    const s = String(input).trim();

    // mm/dd/yyyy
    const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m1) {
      const mm = Number(m1[1]);
      const dd = Number(m1[2]);
      let yy = Number(m1[3]);
      if (yy < 100) yy = 2000 + yy;
      const d = new Date(yy, mm - 1, dd);
      return isNaN(d.getTime()) ? null : d;
    }

    // dd-Month-yy or dd-Month-yyyy (e.g., 03-April-25)
    const m2 = s.match(/^(\d{1,2})-([A-Za-z]+)-(\d{2,4})$/);
    if (m2) {
      const dd = Number(m2[1]);
      const monthName = m2[2];
      let yy = Number(m2[3]);
      if (yy < 100) yy = 2000 + yy;
      const monthIndex = new Date(`${monthName} 1, 2000`).getMonth();
      if (isNaN(monthIndex)) return null;
      const d = new Date(yy, monthIndex, dd);
      return isNaN(d.getTime()) ? null : d;
    }

    return null;
  }

  /** Format Date to mm/dd/yyyy */
  private toMMDDYYYY(date: Date): string {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = String(date.getFullYear());
    return `${mm}/${dd}/${yyyy}`;
  }

  /** Update a lead by (date+traveller) using stored row number */
  async updateLead(dateAndTime: string, travellerName: string, updates: Partial<SheetLead>): Promise<void>;
  async updateLead(lead: Pick<SheetLead, 'dateAndTime' | 'travellerName'>, updates: Partial<SheetLead>): Promise<void>;
  async updateLead(a: any, b: any, c?: any): Promise<void> {
    let dateAndTime: string;
    let travellerName: string;
    let updates: Partial<SheetLead>;

    if (typeof a === 'string') {
      dateAndTime = a;
      travellerName = b;
      updates = c || {};
    } else {
      dateAndTime = a?.dateAndTime;
      travellerName = a?.travellerName;
      updates = b || {};
    }

    if (!dateAndTime || !travellerName) {
      throw new Error('Date + Traveller Name required to update lead');
    }

    const leads = await this.fetchLeads();

    const targetDate = this.parseFlexibleDate(dateAndTime);

    const sameDay = (d1: Date | null, d2: Date | null) =>
      !!d1 && !!d2 && 
      d1.getFullYear() === d2.getFullYear() && 
      d1.getMonth() === d2.getMonth() && 
      d1.getDate() === d2.getDate();

    const matchedLead = leads.find((l) => {
      const ld = this.parseFlexibleDate(l.dateAndTime);
      const dateMatch = sameDay(targetDate, ld) || String(l.dateAndTime).trim() === String(dateAndTime).trim();
      const nameMatch = String(l.travellerName).trim().toLowerCase() === String(travellerName).trim().toLowerCase();
      return dateMatch && nameMatch;
    });

    if (!matchedLead) {
      console.error('❌ Lead not found. Search criteria:', { dateAndTime, travellerName });
      console.error('📋 Available leads sample:', leads.slice(0, 3).map(l => ({
        date: l.dateAndTime,
        name: l.travellerName,
        row: l._rowNumber
      })));
      throw new Error(`Lead not found for Date: "${dateAndTime}" and Traveller: "${travellerName}"`);
    }

    if (!matchedLead._rowNumber || matchedLead._rowNumber < 2) {
      throw new Error('Invalid row number detected. Please refresh leads data.');
    }

    const rowNumber = matchedLead._rowNumber;
    
    console.log(`🎯 Updating lead:`, {
      date: dateAndTime,
      traveller: travellerName,
      actualSheetRow: rowNumber,
      updates: Object.keys(updates),
    });

    const cm = this.config.columnMappings;
    const token = await this.getAccessToken();

    const updateData: { range: string; values: any[][] }[] = [];
    
    for (const [key, rawValue] of Object.entries(updates)) {
      if (rawValue === undefined || ['tripId', 'dateAndTime', 'notes', '_rowNumber'].includes(key)) {
        continue;
      }
      
      const col = cm[key as keyof typeof cm];
      if (!col) continue;

      let value: any = rawValue;
      
      if (key === 'travelDate' && typeof value === 'string') {
        const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) {
          const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
          value = this.toMMDDYYYY(d);
        } else {
          const d = this.parseFlexibleDate(value);
          if (d) value = this.toMMDDYYYY(d);
        }
      }

      const cellRange = `${this.config.worksheetNames[0]}!${col}${rowNumber}`;
      updateData.push({ 
        range: cellRange, 
        values: [[value]] 
      });
      
      console.log(`  📝 Updating ${cellRange} = "${value}"`);
    }

    if (updateData.length === 0) {
      console.log('⚠️ No fields to update');
      return;
    }

    const batchUrl = `${SHEETS_API_BASE}/${this.config.sheetId}/values:batchUpdate`;
    const res = await fetch(batchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updateData }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('❌ Failed to update lead in Google Sheets:', errText);
      throw new Error(errText);
    }
    
    console.log(`✅ Lead updated successfully at row ${rowNumber}`);
    
    this.clearLeadsCache();
  }
}
