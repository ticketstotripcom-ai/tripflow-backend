// googleSheet.ts
import { localSecrets } from './localSecret';

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
  leadSource?: string;
  travelDate?: string;
  travelState?: string;
  destination?: string;
  ticketsRequired?: string;
  remarks?: string;
  nights?: string;
  pax?: string;
  hotelCategory?: string;
  mealPlan?: string;
  phone?: string;
  email?: string;
  whatsappLink?: string;
  departureLocation?: string;
  mentorName?: string;
  remarkByMentor?: string;
  eventType?: string;
  eventDate?: string;
  contactStatus?: string;
  followupStatus?: string;
  uniqueKey?: string;
  timeStamp?: string;
  whatsappNotification?: string;
  customerReplies?: string;
  aiResponse?: string;
  fullConversation?: string;
  bookingStatus?: string;
  firstMessageTime?: string;
  customerLastMessageTime?: string;
  reminderCount?: string;
  whatsappItinerary?: string;
  whatsappItineraryTiming?: string;
  priority?: string;
  notes?: string; // From cell notes
}

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export class GoogleSheetsService {
  private sheetId: string;
  private worksheetNames: string[];
  private columnMappings: Record<string, string>;
  private apiKey?: string;
  private serviceAccountJson?: string;

  constructor() {
    this.sheetId = localSecrets.spreadsheetUrl.split('/d/')[1].split('/')[0];
    this.worksheetNames = localSecrets.worksheetNames;
    this.columnMappings = localSecrets.columnMappings;
    this.apiKey = localSecrets.googleApiKey;
    this.serviceAccountJson = localSecrets.serviceAccountJson;
  }

  /** Convert column letter to index */
  private columnToIndex(col: string): number {
    let index = 0;
    for (let i = 0; i < col.length; i++) {
      index = index * 26 + (col.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return index - 1;
  }

  /** Preview-safe: Only use Service Account if JSON exists */
  private async getAccessToken(): Promise<string> {
    if (!this.serviceAccountJson) return ''; // preview mode
    // Production: JWT token generation (omitted here to prevent crypto issues in preview)
    throw new Error('Service Account JWT signing not supported in preview.');
  }

  /** Fetch leads from MASTER DATA */
  async fetchLeads(): Promise<SheetLead[]> {
    try {
      const worksheet = this.worksheetNames[0] || 'MASTER DATA';
      const range = `${worksheet}!A2:AZ10000`;
      const url = this.apiKey
        ? `${SHEETS_API_BASE}/${this.sheetId}/values/${encodeURIComponent(range)}?key=${this.apiKey}`
        : `${SHEETS_API_BASE}/${this.sheetId}/values/${encodeURIComponent(range)}`;

      const headers: any = {};
      if (!this.apiKey) headers['Authorization'] = `Bearer ${await this.getAccessToken()}`;

      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error('Failed to fetch leads from Google Sheets');

      const data = await res.json();
      const rows: any[] = data.values || [];
      const cm = this.columnMappings;

      const leads: SheetLead[] = rows.map((row: any[]) => ({
        tripId: row[this.columnToIndex(cm.tripId)] || '',
        date: row[this.columnToIndex(cm.date)] || '',
        consultant: row[this.columnToIndex(cm.consultant)] || '',
        status: row[this.columnToIndex(cm.status)] || '',
        travellerName: row[this.columnToIndex(cm.travellerName)] || '',
        leadSource: row[this.columnToIndex(cm.leadSource)] || '',
        travelDate: row[this.columnToIndex(cm.travelDate)] || '',
        travelState: row[this.columnToIndex(cm.travelState)] || '',
        remarks: row[this.columnToIndex(cm.remarks)] || '',
        nights: row[this.columnToIndex(cm.nights)] || '',
        pax: row[this.columnToIndex(cm.pax)] || '',
        hotelCategory: row[this.columnToIndex(cm.hotelCategory)] || '',
        mealPlan: row[this.columnToIndex(cm.mealPlan)] || '',
        phone: row[this.columnToIndex(cm.phone)] || '',
        email: row[this.columnToIndex(cm.email)] || '',
        priority: row[this.columnToIndex(cm.priority)] || '',
      })).filter(l => l.tripId);

      return leads;
    } catch (err) {
      console.error('Error fetching leads:', err);
      return [];
    }
  }

  /** Append a new lead */
  async appendLead(lead: Partial<SheetLead>): Promise<void> {
    if (!this.serviceAccountJson) {
      console.warn('Append not available in preview. Only read works.');
      return;
    }

    const worksheet = this.worksheetNames[0] || 'MASTER DATA';
    const range = `${worksheet}!A:Z`;

    const cm = this.columnMappings;
    const maxCol = Math.max(...Object.values(cm).map(c => this.columnToIndex(c)));
    const row = new Array(maxCol + 1).fill('');

    Object.entries(cm).forEach(([key, col]) => {
      if ((lead as any)[key] !== undefined) row[this.columnToIndex(col)] = (lead as any)[key];
    });

    const token = await this.getAccessToken();
    const url = `${SHEETS_API_BASE}/${this.sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;

    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ values: [row] }),
    });
  }

  /** Update an existing lead */
  async updateLead(tripId: string, updates: Partial<SheetLead>): Promise<void> {
    if (!this.serviceAccountJson) {
      console.warn('Update not available in preview. Only read works.');
      return;
    }

    const leads = await this.fetchLeads();
    const leadIndex = leads.findIndex(l => l.tripId === tripId);
    if (leadIndex === -1) throw new Error(`Lead with Trip ID ${tripId} not found`);

    const rowNumber = leadIndex + 2; // header row offset
    const worksheet = this.worksheetNames[0] || 'MASTER DATA';
    const cm = this.columnMappings;

    const data: Array<{ range: string; values: any[][] }> = [];
    Object.entries(updates).forEach(([key, value]) => {
      if (!value || !(cm as any)[key]) return;
      const col = (cm as any)[key];
      data.push({ range: `${worksheet}!${col}${rowNumber}`, values: [[value]] });
    });

    if (data.length === 0) return;

    const token = await this.getAccessToken();
    const url = `${SHEETS_API_BASE}/${this.sheetId}/values:batchUpdate`;

    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
    });
  }
}
