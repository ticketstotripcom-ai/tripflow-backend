import { GoogleSheetsService } from '@/lib/googleSheets';
import { secureStorage } from '@/lib/secureStorage';
import LZString from 'lz-string';

export async function fetchLatestLeads(force = false): Promise<void> {
  const credentials = await secureStorage.getCredentials();
  if (!credentials) return;
  let localServiceAccountJson: string | undefined;
  try { localServiceAccountJson = localStorage.getItem('serviceAccountJson') || undefined; } catch {}
  const svc = new GoogleSheetsService({
    apiKey: credentials.googleApiKey || '',
    serviceAccountJson: credentials.googleServiceAccountJson || localServiceAccountJson,
    sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
    worksheetNames: credentials.worksheetNames,
    columnMappings: credentials.columnMappings,
  });
  const leads = await svc.fetchLeads(!!force);
  try { localStorage.setItem('crm_cache_leads', LZString.compressToUTF16(JSON.stringify(leads.slice(0, 1000)))); } catch {}
}

export async function fetchAnnouncements(force = false): Promise<void> {
  const credentials = await secureStorage.getCredentials();
  if (!credentials) return;
  let localServiceAccountJson: string | undefined;
  try { localServiceAccountJson = localStorage.getItem('serviceAccountJson') || undefined; } catch {}
  const svc = new GoogleSheetsService({
    apiKey: credentials.googleApiKey || '',
    serviceAccountJson: credentials.googleServiceAccountJson || localServiceAccountJson,
    sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
    worksheetNames: credentials.worksheetNames,
    columnMappings: credentials.columnMappings,
  });
  try {
    const rows = await svc.getRows('Blackboard');
    const parsed = (rows || [])
      .filter((r: any[]) => r && r.length > 1 && r[1])
      .map((r: any[]) => ({ id: String(r[0] || ''), message: String(r[1] || ''), author: String(r[2] || ''), createdAt: String(r[3] || '') }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
    localStorage.setItem('crm_blackboard_cache_v1', JSON.stringify(parsed));
  } catch {}
}

