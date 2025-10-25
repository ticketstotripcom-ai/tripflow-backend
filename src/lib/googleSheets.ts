// googleSheet.ts
// Google Sheets API integration – fixed for row targeting & travel date parsing

export interface GoogleSheetsConfig {
  apiKey?: string;
  serviceAccountJson?: any;
  sheetId: string;
  worksheetNames: string[];
  columnMappings: Record<string, string>;
}

export interface SheetUser {
  name: string;
  email: string;
  phone: string;
  role: 'admin' | 'consultant' | 'other';
  password: string;
}

export interface SheetLead {
  tripId?: string;
  dateAndTime: string; // Column B - mm/dd/yyyy (fixed)
  travellerName: string; // Column E
  travelDate?: string; // Column G - mm/dd/yyyy
  consultant?: string;
  destination?: string;
  status?: string;
  priority?: string;
  remarkHistory?: string[];
  notes?: string;
  [key: string]: any;
}

export class GoogleSheetsService {
  private config: GoogleSheetsConfig;
  private cachedToken: string | null = null;
  private tokenExpiry = 0;

  constructor(config: GoogleSheetsConfig) {
    this.config = config;
  }

  /** Get JWT access token using service account */
  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiry) return this.cachedToken;
    const sa = this.config.serviceAccountJson;
    if (!sa) throw new Error('Missing serviceAccountJson for write access');

    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };

    const enc = (obj: any) =>
      btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const toSign = `${enc(header)}.${enc(payload)}`;

    const key = await crypto.subtle.importKey(
      'pkcs8',
      this.pemToArrayBuffer(sa.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(toSign));
    const jwt = `${toSign}.${btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')}`;

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    }).then(r => r.json());

    this.cachedToken = tokenResp.access_token;
    this.tokenExpiry = Date.now() + (tokenResp.expires_in - 60) * 1000;
    return this.cachedToken!;
  }

  private pemToArrayBuffer(pem: string): ArrayBuffer {
    const b64 = pem.replace(/-----.*?-----/g, '').replace(/\s+/g, '');
    const binary = atob(b64);
    const buf = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
    return buf;
  }

  private columnToIndex(col: string): number {
    let idx = 0;
    for (let i = 0; i < col.length; i++)
      idx = idx * 26 + (col.charCodeAt(i) - 64);
    return idx - 1;
  }

  /** Flexible date parser for mm/dd/yyyy or dd-Month-yyyy */
  private parseFlexibleDate(input?: string): Date | null {
    if (!input) return null;
    const str = input.trim();

    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
      const [m, d, y] = str.split('/').map(Number);
      return new Date(y, m - 1, d);
    }

    if (/^\d{1,2}-[A-Za-z]+-\d{2,4}$/.test(str)) {
      const [d, mon, y] = str.split('-');
      const yr = y.length === 2 ? Number('20' + y) : Number(y);
      const monthIndex = new Date(`${mon} 1, 2000`).getMonth();
      return new Date(yr, monthIndex, Number(d));
    }

    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  private toMMDDYYYY(date?: string | Date | null): string {
    const d = typeof date === 'string' ? this.parseFlexibleDate(date) : date;
    if (!d) return '';
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${m}/${day}/${d.getFullYear()}`;
  }

  /** Fetch all leads */
  async fetchLeads(): Promise<SheetLead[]> {
    const sheet = this.config.worksheetNames[0];
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.config.sheetId}/values/${sheet}!A1:AZ10000?key=${this.config.apiKey}`;
    const res = await fetch(url);
    const json = await res.json();
    const rows: string[][] = json.values || [];

    if (rows.length <= 1) return [];
    const dataRows = rows.slice(1);

    return dataRows.map(row => ({
      tripId: row[this.columnToIndex('A')],
      dateAndTime: this.toMMDDYYYY(row[this.columnToIndex('B')]),
      consultant: row[this.columnToIndex('C')],
      travellerName: (row[this.columnToIndex('E')] || '').trim(),
      travelDate: this.toMMDDYYYY(row[this.columnToIndex('G')]),
      destination: row[this.columnToIndex('H')],
      status: row[this.columnToIndex('I')],
      priority: row[this.columnToIndex('J')],
      notes: row[this.columnToIndex('K')],
    })).filter(l => l.travellerName && l.dateAndTime);
  }

  /** Update a lead using Column B (Date) + Column E (Traveller Name) */
  async updateLead(
    dateAndTime: string,
    travellerName: string,
    updates: Partial<SheetLead>
  ): Promise<void> {
    const sheet = this.config.worksheetNames[0];
    const token = await this.getAccessToken();

    // fetch all rows including header to get exact indices
    const resp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${this.config.sheetId}/values/${sheet}!A1:AZ10000?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const { values } = await resp.json();
    if (!values) throw new Error('No data found');

    const targetRow = values.findIndex((row: string[]) => {
      const sheetDate = this.toMMDDYYYY(row[1]);
      const leadDate = this.toMMDDYYYY(dateAndTime);
      const sheetTraveller = (row[4] || '').trim().toLowerCase();
      const leadTraveller = travellerName.trim().toLowerCase();
      return sheetDate === leadDate && sheetTraveller === leadTraveller;
    });

    if (targetRow === -1) throw new Error('Lead not found in sheet');
    const actualRow = targetRow+2; // exact row number in sheet

    const data: { range: string; values: any[][] }[] = [];
    for (const [key, value] of Object.entries(updates)) {
      const col = this.config.columnMappings[key];
      if (!col) continue;
      const val = key === 'travelDate' ? this.toMMDDYYYY(value as any) : value;
      data.push({
        range: `${sheet}!${col}${actualRow}`,
        values: [[val ?? '']],
      });
    }

    if (data.length === 0) return;

    const batchBody = { valueInputOption: 'USER_ENTERED', data };
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${this.config.sheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batchBody),
      }
    );
    console.log(`✅ Lead updated at row ${actualRow}`);
  }
}
