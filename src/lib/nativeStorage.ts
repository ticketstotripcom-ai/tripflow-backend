import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

// Small/light values via Preferences
export async function setPrefString(key: string, value: string): Promise<void> {
  await Preferences.set({ key, value });
}

export async function getPrefString(key: string): Promise<string | null> {
  const { value } = await Preferences.get({ key });
  return value ?? null;
}

export async function setPrefJson<T = any>(key: string, data: T): Promise<void> {
  await setPrefString(key, JSON.stringify(data));
}

export async function getPrefJson<T = any>(key: string): Promise<T | null> {
  try {
    const raw = await getPrefString(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Large datasets via Filesystem
async function writeJson(path: string, value: any): Promise<void> {
  const data = typeof value === 'string' ? value : JSON.stringify(value);
  await Filesystem.writeFile({ path, data, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
}

async function readJson<T = any>(path: string): Promise<T | null> {
  try {
    const res = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 });
    if (typeof res.data === 'string') {
      return JSON.parse(res.data) as T;
    }
    return null;
  } catch {
    return null;
  }
}

const LEADS_CACHE_PATH = 'leads_cache.json';
const ANN_CACHE_PATH = 'announcements_cache.json';

export async function saveLeadsCache(leads: any[]): Promise<void> {
  await writeJson(LEADS_CACHE_PATH, leads);
  await setPrefString('leads_cache_timestamp', String(Date.now()));
}

export async function loadLeadsCache<T = any[]>(): Promise<T | null> {
  return await readJson<T>(LEADS_CACHE_PATH);
}

export async function saveAnnouncementsCache(items: any[]): Promise<void> {
  await writeJson(ANN_CACHE_PATH, items);
}

export async function loadAnnouncementsCache<T = any[]>(): Promise<T | null> {
  return await readJson<T>(ANN_CACHE_PATH);
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

