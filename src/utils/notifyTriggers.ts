import { createNotification } from '@/services/notificationService';
import { AppNotification } from './notifications';
// Do NOT import React hooks here; this module runs outside React components
import { GoogleSheetsService } from '@/lib/googleSheets';
import { secureStorage } from '@/lib/secureStorage';

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type NotificationMeta = Partial<Pick<AppNotification, 'route' | 'targetTravellerName' | 'targetDateTime' | 'targetTripId'>>;

export const notifyUser = async (email: string, title: string, message: string, type: AppNotification['type'] = 'general', meta?: NotificationMeta) => {
  try {
    const sheetService = await getSheetsServiceDirect();
    try {
      await createNotification(sheetService, {
        id: uuid(), title, message, type, createdAt: new Date().toISOString(),
        read: false, userEmail: email,
        route: meta?.route, targetTravellerName: meta?.targetTravellerName, targetDateTime: meta?.targetDateTime, targetTripId: meta?.targetTripId,
      });
    } catch (err) {
      try {
        const { API_BASE_URL } = await import('@/config/api');
        await fetch(`${API_BASE_URL}/notify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, message, type }) });
      } catch {}
    }
  } catch (e) {
    console.warn('notifyUser failed (non-blocking):', e);
  }
};

export const notifyAll = async (title: string, message: string, type: AppNotification['type'] = 'general', meta?: NotificationMeta) => {
  try {
    const sheetService = await getSheetsServiceDirect();

    // Prefer backend users (BACKEND SHEET via GoogleSheetsService)
    const credentials = await secureStorage.getCredentials();
    let localServiceAccountJson: string | undefined;
    try { localServiceAccountJson = localStorage.getItem('serviceAccountJson') || undefined; } catch {}

    let emails: string[] = [];
    if (credentials) {
      try {
        const gs = new GoogleSheetsService({
          apiKey: credentials.googleApiKey || '',
          serviceAccountJson: credentials.googleServiceAccountJson || localServiceAccountJson,
          sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
          worksheetNames: credentials.worksheetNames,
          columnMappings: credentials.columnMappings,
        });
        const users = await gs.fetchUsers();
        emails = users.map(u => String(u.email || '').trim()).filter(Boolean);
      } catch (err) {
        console.warn('Falling back to Users sheet for emails:', err);
      }
    }

    // Fallback to Users worksheet (if present)
    if (emails.length === 0) {
      try {
        const rows = await sheetService.getRows('Users');
        emails = rows.map((u: any[]) => (u?.[1] || u?.email || u?.Email || u?.E || u?.D)).map((e: any) => String(e || '').trim()).filter(Boolean);
      } catch (err) {
        console.warn('Users worksheet not available, notifyAll will be skipped:', err);
      }
    }

    const uniqueEmails = Array.from(
      emails.reduce((acc, raw) => {
        const trimmed = String(raw || '').trim();
        if (!trimmed) return acc;
        const key = trimmed.toLowerCase();
        if (!acc.has(key)) acc.set(key, trimmed);
        return acc;
      }, new Map<string, string>()).values()
    );

    if (uniqueEmails.length === 0) {
      try {
        const { getLocalUsers } = await import('@/config/login');
        const locals = await getLocalUsers();
        const emailsLocal = locals.map(l => String(l.email || '').trim()).filter(Boolean);
        for (const email of emailsLocal) {
          await createNotification(sheetService, {
            id: uuid(), title, message, type, createdAt: new Date().toISOString(),
            read: false, userEmail: email,
            route: meta?.route, targetTravellerName: meta?.targetTravellerName, targetDateTime: meta?.targetDateTime, targetTripId: meta?.targetTripId,
          });
        }
      } catch {}
      return;
    }

    for (const email of uniqueEmails) {
      try {
        await createNotification(sheetService, {
          id: uuid(), title, message, type, createdAt: new Date().toISOString(),
          read: false, userEmail: email,
          route: meta?.route, targetTravellerName: meta?.targetTravellerName, targetDateTime: meta?.targetDateTime, targetTripId: meta?.targetTripId,
        });
      } catch (err) {
        try {
          const { API_BASE_URL } = await import('@/config/api');
          await fetch(`${API_BASE_URL}/notify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, message, type }) });
        } catch {}
      }
    }
  } catch (e) {
    console.warn('notifyAll failed (non-blocking):', e);
  }
};

export const notifyAdmin = async (title: string, message: string, meta?: NotificationMeta) => {
  try {
    const sheetService = await getSheetsServiceDirect();
    const credentials = await secureStorage.getCredentials();
    let localServiceAccountJson: string | undefined;
    try { localServiceAccountJson = localStorage.getItem('serviceAccountJson') || undefined; } catch {}

    type UserLike = { email: string; role: string };
    let users: UserLike[] = [];

    if (credentials) {
      try {
        const gs = new GoogleSheetsService({
          apiKey: credentials.googleApiKey || '',
          serviceAccountJson: credentials.googleServiceAccountJson || localServiceAccountJson,
          sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
          worksheetNames: credentials.worksheetNames,
          columnMappings: credentials.columnMappings,
        });
        const fetched = await gs.fetchUsers();
        users = fetched.map(u => ({ email: String(u.email || '').trim(), role: String(u.role || '').toLowerCase() }));
      } catch (err) {
        console.warn('Falling back to Users sheet for admin emails:', err);
      }
    }

    if (users.length === 0) {
      try {
        const rows = await sheetService.getRows('Users');
        users = rows.map((u: any[]) => ({
          email: String(u?.[1] || u?.email || u?.Email || u?.E || u?.D || '').trim(),
          role: String(u?.role || u?.M || u?.[12] || '').toLowerCase(),
        }));
      } catch (err) {
        console.warn('Users worksheet not available, notifyAdmin will be skipped:', err);
      }
    }

    let uniqueAdmins = Array.from(
      users.reduce((acc, u) => {
        if (!u.email) return acc;
        if (!u.role.includes('admin')) return acc;
        const key = u.email.toLowerCase();
        if (!acc.has(key)) acc.set(key, u.email);
        return acc;
      }, new Map<string, string>()).values()
    );
    if (uniqueAdmins.length === 0) {
      try {
        const { getLocalUsers } = await import('@/config/login');
        const locals = await getLocalUsers();
        uniqueAdmins = locals.filter(l => l.role === 'admin').map(l => l.email).filter(Boolean);
      } catch {}
    }

    for (const email of uniqueAdmins) {
      try {
        await createNotification(sheetService, {
          id: uuid(), title, message, type: 'admin', createdAt: new Date().toISOString(),
          read: false, userEmail: email,
          route: meta?.route, targetTravellerName: meta?.targetTravellerName, targetDateTime: meta?.targetDateTime, targetTripId: meta?.targetTripId,
        });
      } catch (err) {
        try {
          const { API_BASE_URL } = await import('@/config/api');
          await fetch(`${API_BASE_URL}/notify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, message, type: 'admin' }) });
        } catch {}
      }
    }
  } catch (e) {
    console.warn('notifyAdmin failed (non-blocking):', e);
  }
};
async function getSheetsServiceDirect(): Promise<GoogleSheetsService> {
  const credentials = await secureStorage.getCredentials();
  if (!credentials) throw new Error('Sheets credentials not configured');
  let localServiceAccountJson: string | undefined;
  try { localServiceAccountJson = localStorage.getItem('serviceAccountJson') || undefined; } catch {}
  return new GoogleSheetsService({
    apiKey: credentials.googleApiKey || '',
    serviceAccountJson: credentials.googleServiceAccountJson || localServiceAccountJson,
    sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
    worksheetNames: credentials.worksheetNames,
    columnMappings: credentials.columnMappings,
  });
}
