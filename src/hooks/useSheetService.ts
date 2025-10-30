import { secureStorage } from '@/lib/secureStorage';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

type Headers = Record<string, string>;

async function getAccessToken(serviceAccountJson?: string): Promise<string> {
  if (!serviceAccountJson) throw new Error('Service Account JSON required');
  const serviceAccount = JSON.parse(serviceAccountJson);
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

  const binaryKey = Uint8Array.from(atob(privateKey), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('pkcs8', binaryKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsignedToken));
  const signatureBase64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
  const jwt = `${unsignedToken}.${signatureBase64}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.access_token as string;
}

export interface SheetService {
  appendRow: (sheetName: string, row: any[]) => Promise<void>;
  getRows: (sheetName: string, range?: string) => Promise<any[][]>;
}

export async function useSheetService(): Promise<SheetService> {
  const credentials = await secureStorage.getCredentials();
  if (!credentials) throw new Error('Google Sheets not configured');

  const sheetId = credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '';
  const apiKey = credentials.googleApiKey;
  let serviceAccountJson = credentials.googleServiceAccountJson;
  // Fallback to localStorage for service account JSON (preview resilience)
  if (!serviceAccountJson) {
    try { serviceAccountJson = localStorage.getItem('serviceAccountJson') || undefined; } catch {}
  }

  const authHeaders = async (): Promise<Headers> => {
    const headers: Headers = { 'Content-Type': 'application/json' };
    if (serviceAccountJson) {
      const token = await getAccessToken(serviceAccountJson);
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const appendRow = async (sheetName: string, row: any[]) => {
    if (!serviceAccountJson) {
      throw new Error('Service Account JSON missing. Please re-enter in Admin Settings.');
    }
    const range = `${sheetName}!A:Z`;
    const token = await getAccessToken(serviceAccountJson);
    const url = `${SHEETS_API_BASE}/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
    const headers: Headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ values: [row] }) });
    if (!res.ok) throw new Error(await res.text());
  };

  const getRows = async (sheetName: string, range = 'A:Z') => {
    const r = `${sheetName}!${range}`;
    const url = `${SHEETS_API_BASE}/${sheetId}/values/${encodeURIComponent(r)}${!serviceAccountJson && apiKey ? `?key=${apiKey}` : ''}`;
    const headers = await authHeaders();
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return (data.values || []) as any[][];
  };

  return { appendRow, getRows };
}
