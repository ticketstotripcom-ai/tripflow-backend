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
  date: string;
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
  notes?: string; // Cell notes from Column K
}

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export class GoogleSheetsService {
  private config: GoogleSheetsConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: GoogleSheetsConfig) {
    this.config = config;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;

    if (!this.config.serviceAccountJson) {
      throw new Error('Service Account JSON required for write operations. Please configure in Settings.');
    }

    try {
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

      const base64url = (str: string) => btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      const headerEncoded = base64url(JSON.stringify(header));
      const payloadEncoded = base64url(JSON.stringify(payload));
      const unsignedToken = `${headerEncoded}.${payloadEncoded}`;

      const privateKey = serviceAccount.private_key
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s/g, '');

      const binaryKey = Uint8Array.from(atob(privateKey), c => c.charCodeAt(0));
      const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        binaryKey,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsignedToken));
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
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
      return this.accessToken;
    } catch (error) {
      console.error('Error getting access token:', error);
      throw new Error('Failed to authenticate with Service Account. Check your Service Account JSON.');
    }
  }

  private columnToIndex(col: string): number {
    let index = 0;
    for (let i = 0; i < col.length; i++) {
      index = index * 26 + (col.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return index - 1;
  }

  /** Fetch all users from Google Sheets */
  async fetchUsers(): Promise<SheetUser[]> {
    try {
      const worksheetName = this.config.worksheetNames[1] || 'BACKEND SHEET';
      const range = `${worksheetName}!A2:Z1000`;

      let url: string;
      let headers: Record<string, string> = {};
      if (this.config.apiKey) {
        url = `${SHEETS_API_BASE}/${this.config.sheetId}/values/${encodeURIComponent(range)}?key=${this.config.apiKey}`;
      } else {
        const token = await this.getAccessToken();
        url = `${SHEETS_API_BASE}/${this.config.sheetId}/values/${encodeURIComponent(range)}`;
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`Failed to fetch users: ${response.statusText}`);

      const data = await response.json();
      const rows = data.values || [];
      const cm = this.config.columnMappings;

      return rows.map((row: any[]) => ({
        name: row[this.columnToIndex(cm.name || 'C')] || '',
        email: row[this.columnToIndex(cm.email || 'D')] || '',
        phone: row[this.columnToIndex(cm.phone || 'E')] || '',
        role: (row[this.columnToIndex(cm.role || 'M')] || 'consultant').toLowerCase() as 'admin' | 'consultant',
        password: row[this.columnToIndex(cm.password || 'N')] || '',
      })).filter(u => u.email && u.password);
    } catch (err) {
      console.error('Error fetching users:', err);
      throw err;
    }
  }

  /** Fetch all leads from Google Sheets */
  async fetchLeads(): Promise<SheetLead[]> {
    try {
      const worksheetName = this.config.worksheetNames[0] || 'MASTER DATA';
      const range = `${worksheetName}!A2:AZ10000`;

      let url: string;
      let headers: Record<string, string> = {};
      if (this.config.apiKey) {
        url = `${SHEETS_API_BASE}/${this.config.sheetId}/values/${encodeURIComponent(range)}?key=${this.config.apiKey}`;
      } else {
        const token = await this.getAccessToken();
        url = `${SHEETS_API_BASE}/${this.config.sheetId}/values/${encodeURIComponent(range)}`;
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`Failed to fetch leads: ${response.statusText}`);

      const data = await response.json();
      const rows = data.values || [];
      const cm = this.config.columnMappings;

      // Fetch notes
      let notesMap: Record<number, string> = {};
      try {
        const notesUrl = this.config.apiKey
          ? `${SHEETS_API_BASE}/${this.config.sheetId}?ranges=${encodeURIComponent(worksheetName)}!K2:K10000&fields=sheets.data.rowData.values.note&key=${this.config.apiKey}`
          : `${SHEETS_API_BASE}/${this.config.sheetId}?ranges=${encodeURIComponent(worksheetName)}!K2:K10000&fields=sheets.data.rowData.values.note`;

        const notesHeaders = this.config.apiKey ? {} : { 'Authorization': `Bearer ${await this.getAccessToken()}` };
        const notesResponse = await fetch(notesUrl, { headers: notesHeaders });
        if (notesResponse.ok) {
          const notesData = await notesResponse.json();
          const rowData = notesData.sheets?.[0]?.data?.[0]?.rowData || [];
          rowData.forEach((row: any, index: number) => {
            if (row.values?.[0]?.note) notesMap[index] = row.values[0].note;
          });
        }
      } catch (err) { console.warn('Failed to fetch notes:', err); }

      return rows.map((row: any[], i: number) => ({
        tripId: row[this.columnToIndex(cm.trip_id || 'A')] || '',
        date: row[this.columnToIndex(cm.date || 'B')] || '',
        consultant: row[this.columnToIndex(cm.consultant || 'C')] || '',
        status: row[this.columnToIndex(cm.status || 'D')] || '',
        travellerName: row[this.columnToIndex(cm.traveller_name || 'E')] || '',
        travelDate: row[this.columnToIndex(cm.travel_date || 'G')] || '',
        travelState: row[this.columnToIndex(cm.travel_state || 'H')] || '',
        remarks: row[this.columnToIndex(cm.remarks || 'K')] || '',
        nights: row[this.columnToIndex(cm.nights || 'L')] || '',
        pax: row[this.columnToIndex(cm.pax || 'M')] || '',
        hotelCategory: row[this.columnToIndex(cm.hotel_category || 'N')] || '',
        mealPlan: row[this.columnToIndex(cm.meal_plan || 'O')] || '',
        phone: row[this.columnToIndex(cm.phone || 'P')] || '',
        email: row[this.columnToIndex(cm.email || 'Q')] || '',
        priority: row[this.columnToIndex(cm.priority || '')] || '',
        remarkHistory: row[this.columnToIndex(cm.remarkHistory || '')]?.split(';') || [],
        notes: notesMap[i] || '',
      })).filter(l => l.tripId);
    } catch (err) {
      console.error('Error fetching leads:', err);
      throw err;
    }
  }

  /** Append a new lead */
  async appendLead(lead: Partial<SheetLead>): Promise<void> {
    try {
      const worksheetName = this.config.worksheetNames[0] || 'MASTER DATA';
      const range = `${worksheetName}!A:Z`;
      const token = await this.getAccessToken();
      const cm = this.config.columnMappings;

      const tripId = lead.tripId || `T${Date.now()}`;
      const date = lead.date || new Date().toISOString().split('T')[0];

      const maxCol = Math.max(...Object.values(cm).map(c => this.columnToIndex(c)));
      const row = new Array(maxCol + 1).fill('');

      // Populate mapped columns
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
      console.log('✅ Lead appended:', tripId);
    } catch (err) {
      console.error('❌ appendLead failed:', err);
      throw err;
    }
  }

  /** Update an existing lead */
  async updateLead(tripId: string, updates: Partial<SheetLead>): Promise<void> {
    console.log('🔄 Updating lead:', tripId, updates);

    if (!this.config.serviceAccountJson) throw new Error('Service Account JSON required');

    try {
      const token = await this.getAccessToken();
      const worksheetName = this.config.worksheetNames[0] || 'MASTER DATA';
      const leads = await this.fetchLeads();
      const leadIndex = leads.findIndex(l => l.tripId === tripId);
      if (leadIndex === -1) throw new Error(`Lead ${tripId} not found`);

      const rowNumber = leadIndex + 2; // header = row 1
      const cm = this.config.columnMappings;
      const updateData: { range: string; values: any[][] }[] = [];

      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || ['tripId', 'date', 'notes'].includes(key)) continue;
        const col = cm[key as keyof typeof cm];
        if (!col) {
          console.warn(`⚠️ Column mapping missing for "${key}", skipping`);
          continue;
        }
        updateData.push({ range: `${worksheetName}!${col}${rowNumber}`, values: [[value]] });
      }

      if (updateData.length === 0) return;

      const batchUrl = `${SHEETS_API_BASE}/${this.config.sheetId}/values:batchUpdate`;
      const res = await fetch(batchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updateData }),
      });

      if (!res.ok) throw new Error(await res.text());
      console.log('✅ Lead updated successfully:', tripId);
    } catch (err) {
      console.error('❌ updateLead failed:', err);
      throw err;
    }
  }
}

// Settings management
export const saveSettings = (config: GoogleSheetsConfig) => localStorage.setItem('googleSheetsConfig', JSON.stringify(config));
export const loadSettings = (): GoogleSheetsConfig | null => {
  const stored = localStorage.getItem('googleSheetsConfig');
  return stored ? JSON.parse(stored) : null;
};
export const extractSheetId = (url: string): string => {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : '';
};
