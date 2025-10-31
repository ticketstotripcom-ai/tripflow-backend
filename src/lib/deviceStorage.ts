import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

const ROOT_DIR = 'TTTCRM';
const SUB_DIRECTORIES = ['cache', 'config', 'media', 'payments', 'qr'];
const SERVICE_ACCOUNT_PATH = `${ROOT_DIR}/config/service-account.json`;
const METADATA_PATH = `${ROOT_DIR}/config/app-metadata.json`;

const isFilesystemAvailable = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Filesystem');

async function ensureDirectory(path: string) {
  try {
    await Filesystem.mkdir({
      path,
      directory: Directory.Data,
      recursive: true,
    });
  } catch (error: any) {
    if (!String(error?.message || error).includes('already exists')) {
      console.warn(`[deviceStorage] Failed to ensure directory: ${path}`, error);
    }
  }
}

export async function ensureAppStorageStructure(): Promise<boolean> {
  if (!isFilesystemAvailable()) {
    return false;
  }

  await ensureDirectory(ROOT_DIR);
  await Promise.all(SUB_DIRECTORIES.map((dir) => ensureDirectory(`${ROOT_DIR}/${dir}`)));
  return true;
}

export async function persistServiceAccountJson(json: string): Promise<void> {
  if (!json) return;

  if (await ensureAppStorageStructure()) {
    try {
      await Filesystem.writeFile({
        path: SERVICE_ACCOUNT_PATH,
        data: json,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      console.info('[deviceStorage] Service account JSON persisted to device storage');
    } catch (error) {
      console.warn('[deviceStorage] Failed to write service account JSON to filesystem, falling back to localStorage', error);
      try { localStorage.setItem('serviceAccountJson', json); } catch {}
    }
  } else {
    try { localStorage.setItem('serviceAccountJson', json); } catch {}
  }
}

export async function readPersistedServiceAccountJson(): Promise<string | null> {
  try {
    const cached = localStorage.getItem('serviceAccountJson');
    if (cached) return cached;
  } catch {}

  if (!isFilesystemAvailable()) {
    return null;
  }

  try {
    const result = await Filesystem.readFile({
      path: SERVICE_ACCOUNT_PATH,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    if (typeof result.data === 'string' && result.data.trim()) {
      return result.data;
    }
  } catch (error) {
    console.warn('[deviceStorage] No persisted service account JSON found', error);
  }
  return null;
}

export async function clearPersistedServiceAccountJson(): Promise<void> {
  try { localStorage.removeItem('serviceAccountJson'); } catch {}

  if (!isFilesystemAvailable()) return;

  try {
    await Filesystem.deleteFile({ path: SERVICE_ACCOUNT_PATH, directory: Directory.Data });
  } catch (error) {
    if (!String(error?.message || error).includes('does not exist')) {
      console.warn('[deviceStorage] Failed to delete service account JSON file', error);
    }
  }
}

export interface AppMetadataPayload {
  paymentLinks?: { name: string; url: string; qrImage?: string }[];
  logos?: string[];
  updatedAt: string;
}

export async function persistAppMetadata(payload: AppMetadataPayload): Promise<void> {
  if (!payload) return;

  const data = JSON.stringify(payload, null, 2);

  if (await ensureAppStorageStructure()) {
    try {
      await Filesystem.writeFile({
        path: METADATA_PATH,
        data,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      return;
    } catch (error) {
      console.warn('[deviceStorage] Failed to persist app metadata to filesystem', error);
    }
  }

  try {
    localStorage.setItem('crm_app_metadata', data);
  } catch (error) {
    console.warn('[deviceStorage] Failed to persist app metadata to localStorage', error);
  }
}

export async function readAppMetadata(): Promise<AppMetadataPayload | null> {
  try {
    const raw = localStorage.getItem('crm_app_metadata');
    if (raw) return JSON.parse(raw);
  } catch {}

  if (!isFilesystemAvailable()) return null;

  try {
    const result = await Filesystem.readFile({
      path: METADATA_PATH,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    if (typeof result.data === 'string') {
      return JSON.parse(result.data);
    }
  } catch (error) {
    console.warn('[deviceStorage] No metadata stored', error);
  }
  return null;
}

export async function persistCacheSnapshot(key: string, value: any): Promise<void> {
  if (!key) return;
  const payload = JSON.stringify({ value, updatedAt: new Date().toISOString() });

  try {
    localStorage.setItem(`crm_cache_${key}`, payload);
  } catch (error) {
    console.warn(`[deviceStorage] Failed to cache ${key} in localStorage`, error);
  }

  if (!isFilesystemAvailable()) return;

  try {
    await ensureAppStorageStructure();
    await Filesystem.writeFile({
      path: `${ROOT_DIR}/cache/${key}.json`,
      data: payload,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true,
    });
  } catch (error) {
    console.warn(`[deviceStorage] Failed to cache ${key} in filesystem`, error);
  }
}

export async function readCacheSnapshot<T = any>(key: string): Promise<T | null> {
  if (!key) return null;

  try {
    const raw = localStorage.getItem(`crm_cache_${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.value as T;
    }
  } catch {}

  if (!isFilesystemAvailable()) return null;

  try {
    const result = await Filesystem.readFile({
      path: `${ROOT_DIR}/cache/${key}.json`,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    if (typeof result.data === 'string') {
      const parsed = JSON.parse(result.data);
      return parsed.value as T;
    }
  } catch (error) {
    console.warn(`[deviceStorage] Failed to read cache snapshot ${key}`, error);
  }
  return null;
}

