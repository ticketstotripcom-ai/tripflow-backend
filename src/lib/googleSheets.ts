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
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.config.serviceAccountJson) {
      throw new Error('Service Account JSON required for write operations. Please configure in Settings.');
    }

    try {
      const serviceAccount = JSON.parse(this.config.serviceAccountJson);
      const now = Math.floor(Date.now() / 1000);
      const expiry = now + 3600;

      // Create JWT header and payload
      const header = {
        alg: 'RS256',
        typ: 'JWT',
        kid: serviceAccount.private_key_id
      };

      const payload = {
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: expiry,
        iat: now
      };

      // Base64URL encode
      const base64url = (str: string) => btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      const headerEncoded = base64url(JSON.stringify(header));
      const payloadEncoded = base64url(JSON.stringify(payload));
      const unsignedToken = `${headerEncoded}.${payloadEncoded}`;

      // Import private key and sign
      const privateKey = serviceAccount.private_key;
      const pemContents = privateKey
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s/g, '');
      
      const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
      
      const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        binaryKey,
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256'
        },
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

      // Exchange JWT for access token
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get access token: ${error}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1 min early

      return this.accessToken;
    } catch (error) {
      console.error('Error getting access token:', error);
      throw new Error('Failed to authenticate with Service Account. Please check your Service Account JSON in Settings.');
    }
  }

  private columnToIndex(col: string): number {
    let index = 0;
    for (let i = 0; i < col.length; i++) {
      index = index * 26 + (col.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return index - 1;
  }

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
      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.statusText}`);
      }
      
      const data = await response.json();
      const rows = data.values || [];
      
      return rows.map((row: any[]) => ({
        name: row[2] || '', // Column C
        email: row[3] || '', // Column D
        phone: row[4] || '', // Column E
        role: (row[12] || 'consultant').toLowerCase() as 'admin' | 'consultant', // Column M
        password: row[13] || '', // Column N
      })).filter((user: SheetUser) => user.email && user.password);
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  }

  async fetchLeads(): Promise<SheetLead[]> {
    try {
      const worksheetName = this.config.worksheetNames[0] || 'MASTER DATA';
      const range = `${worksheetName}!A2:Z10000`;
      
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
      if (!response.ok) {
        throw new Error(`Failed to fetch leads: ${response.statusText}`);
      }
      
      const data = await response.json();
      const rows = data.values || [];
      
      const cm = this.config.columnMappings;
      
      // Fetch cell notes from Column K
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
            if (row.values?.[0]?.note) {
              notesMap[index] = row.values[0].note;
            }
          });
        }
      } catch (notesError) {
        console.warn('Failed to fetch cell notes:', notesError);
      }
      
      const leads = rows.map((row: any[], rowIndex: number) => ({
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
        notes: notesMap[rowIndex] || '', // Cell notes from Column K
      })).filter((lead: SheetLead) => lead.tripId);

      // Sort by date descending (latest first)
      leads.sort((a, b) => {
        const dateA = new Date(a.date || 0).getTime();
        const dateB = new Date(b.date || 0).getTime();
        return dateB - dateA;
      });

      return leads;
    } catch (error) {
      console.error('Error fetching leads:', error);
      throw error;
    }
  }

  async appendLead(lead: Partial<SheetLead>): Promise<void> {
    try {
      const worksheetName = this.config.worksheetNames[0] || 'MASTER DATA';
      const range = `${worksheetName}!A:Z`;
      
      // Write operations require Service Account authentication
      const token = await this.getAccessToken();
      const url = `${SHEETS_API_BASE}/${this.config.sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
      
      const cm = this.config.columnMappings;
      
      // Generate trip ID if not provided
      const tripId = lead.tripId || `T${Date.now()}`;
      const date = lead.date || new Date().toISOString().split('T')[0];
      
      // Create array with exact column mappings
      const maxCol = Math.max(
        ...Object.values(cm).map(col => this.columnToIndex(col as string))
      );
      const row = new Array(maxCol + 1).fill('');
      
      // Fill in the data at the correct column indices
      if (cm.trip_id) row[this.columnToIndex(cm.trip_id)] = tripId;
      if (cm.date) row[this.columnToIndex(cm.date)] = date;
      if (cm.consultant) row[this.columnToIndex(cm.consultant)] = lead.consultant || '';
      if (cm.status) row[this.columnToIndex(cm.status)] = lead.status || 'Unfollowed';
      if (cm.traveller_name) row[this.columnToIndex(cm.traveller_name)] = lead.travellerName || '';
      if (cm.travel_date) row[this.columnToIndex(cm.travel_date)] = lead.travelDate || '';
      if (cm.travel_state) row[this.columnToIndex(cm.travel_state)] = lead.travelState || '';
      if (cm.remarks) row[this.columnToIndex(cm.remarks)] = lead.remarks || '';
      if (cm.nights) row[this.columnToIndex(cm.nights)] = lead.nights || '';
      if (cm.pax) row[this.columnToIndex(cm.pax)] = lead.pax || '';
      if (cm.hotel_category) row[this.columnToIndex(cm.hotel_category)] = lead.hotelCategory || '';
      if (cm.meal_plan) row[this.columnToIndex(cm.meal_plan)] = lead.mealPlan || '';
      if (cm.phone) row[this.columnToIndex(cm.phone)] = lead.phone || '';
      if (cm.email) row[this.columnToIndex(cm.email)] = lead.email || '';
      
      console.log('Appending lead to Google Sheets:', { tripId, date, url });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          values: [row],
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Google Sheets API error:', errorText);
        throw new Error(`Failed to append lead: ${response.statusText} - ${errorText}`);
      }
      
      console.log('Lead appended successfully');
    } catch (error) {
      console.error('Error appending lead:', error);
      throw error;
    }
  }

  async updateLead(tripId: string, updates: Partial<SheetLead>): Promise<void> {
    console.log('🔄 Starting updateLead for:', tripId);
    console.log('📦 Updates to apply:', updates);
    
    // Verify we have service account credentials
    if (!this.config.serviceAccountJson) {
      const errorMsg = 'Service Account JSON is required for updating leads. Please configure it in Settings or localSecrets.ts';
      console.error('❌', errorMsg);
      throw new Error(errorMsg);
    }
    
    try {
      // Get access token first
      console.log('🔐 Getting access token...');
      const token = await this.getAccessToken();
      console.log('✅ Access token obtained');
      
      // Find the row number
      console.log('🔍 Fetching leads to find row number...');
      const leads = await this.fetchLeads();
      const leadIndex = leads.findIndex(l => l.tripId === tripId);
      
      if (leadIndex === -1) {
        throw new Error(`Lead with Trip ID ${tripId} not found in sheet`);
      }
      
      const rowNumber = leadIndex + 2; // +2 because sheets are 1-indexed and row 1 is header
      const worksheetName = this.config.worksheetNames[0] || 'MASTER DATA';
      console.log(`✅ Found lead at row ${rowNumber} in worksheet "${worksheetName}"`);
      
      const cm = this.config.columnMappings;
      const updatePromises: Promise<void>[] = [];
      
      // Build batch update data
      const updateData: Array<{ range: string; values: any[][] }> = [];
      
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined && key !== 'notes' && key !== 'tripId' && key !== 'date') {
          let column = '';
          switch (key) {
            case 'consultant': column = cm.consultant || 'C'; break;
            case 'status': column = cm.status || 'D'; break;
            case 'travellerName': column = cm.traveller_name || 'E'; break;
            case 'remarks': column = cm.remarks || 'K'; break;
            case 'travelDate': column = cm.travel_date || 'G'; break;
            case 'travelState': column = cm.travel_state || 'H'; break;
            case 'nights': column = cm.nights || 'L'; break;
            case 'pax': column = cm.pax || 'M'; break;
            case 'hotelCategory': column = cm.hotel_category || 'N'; break;
            case 'mealPlan': column = cm.meal_plan || 'O'; break;
            case 'phone': column = cm.phone || 'P'; break;
            case 'email': column = cm.email || 'Q'; break;
            default: continue;
          }
          
          const range = `${worksheetName}!${column}${rowNumber}`;
          updateData.push({
            range,
            values: [[value]]
          });
          
          console.log(`📝 Will update ${key} at ${range} with:`, value);
        }
      }
      
      if (updateData.length === 0) {
        console.warn('⚠️ No valid fields to update');
        return;
      }
      
      // Use batchUpdate for better performance
      const batchUrl = `${SHEETS_API_BASE}/${this.config.sheetId}/values:batchUpdate`;
      
      console.log('🚀 Sending batch update to Google Sheets API...');
      console.log('📍 URL:', batchUrl);
      console.log('📦 Updating', updateData.length, 'fields');
      
      const response = await fetch(batchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: updateData
        }),
      });
      
      console.log('📥 Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Google Sheets API Error Response:', errorText);
        throw new Error(`Failed to update lead in Google Sheet: ${response.status} ${response.statusText}\n${errorText}`);
      }
      
      const result = await response.json();
      console.log('✅ Google Sheets API Response:', result);
      console.log('✅✅✅ Lead successfully updated in Google Sheet!');
      
    } catch (error: any) {
      console.error('❌❌❌ CRITICAL ERROR updating lead:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        tripId,
        updates
      });
      throw new Error(`Failed to update lead in Google Sheet: ${error.message}`);
    }
  }
}

// Settings management using localStorage
export const saveSettings = (config: GoogleSheetsConfig) => {
  localStorage.setItem('googleSheetsConfig', JSON.stringify(config));
};

export const loadSettings = (): GoogleSheetsConfig | null => {
  const stored = localStorage.getItem('googleSheetsConfig');
  if (stored) {
    return JSON.parse(stored);
  }
  return null;
};

export const extractSheetId = (url: string): string => {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : '';
};
