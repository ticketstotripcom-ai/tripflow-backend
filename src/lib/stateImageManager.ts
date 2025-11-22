import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { getLocalImageUrl } from './imageCache';

// Central registry of fixed state images
export const STATE_IMAGE_URLS: Record<string, string> = {
  // Canonical keys
  MAHARASHTRA: 'https://ticketstotrip.com/cdn-assets/original/best-tourist-destinations-to-visit-in-maharashtra-india-1.jpg',
  GOA: 'https://ticketstotrip.com/cdn-assets/original/palolem-beach-south-goa-1920x1080.jpg',
  KERALA: 'https://ticketstotrip.com/cdn-assets/original/i-am-in-kerala-and-waiting-for-my-houseboat-and-my-girlfrind-waiting-for-me.jpg',
  GUJARAT: 'https://ticketstotrip.com/cdn-assets/original/complete-guide-to-the-gir-national-park-gujarat2.jpg',
  KARNATAKA: 'https://ticketstotrip.com/cdn-assets/original/gokarnatourism-header-gokarna-tourism-jpg.jpg',
  RAJASTHAN: 'https://ticketstotrip.com/cdn-assets/original/1-pushkar-ajmer-4-.jpg',
  MADHYA_PRADESH: 'https://ticketstotrip.com/cdn-assets/original/madhyapradesh.webp',
  UTTARAKHAND: 'https://ticketstotrip.com/cdn-assets/original/uttarakhand-1-.jpg',
  HIMACHAL_PRADESH: 'https://ticketstotrip.com/cdn-assets/original/chamba-himachal.jpg',
  JAMMU_KASHMIR: 'https://ticketstotrip.com/cdn-assets/original/winter-kashmir.jpg',
  TAMIL_NADU: 'https://ticketstotrip.com/cdn-assets/original/tamil-nadu-profile.jpg',
  WEST_BENGAL: 'https://ticketstotrip.com/cdn-assets/original/westbengal.webp',
  PUNJAB: 'https://ticketstotrip.com/cdn-assets/original/punjab.webp',
  ODISHA: 'https://ticketstotrip.com/cdn-assets/original/0373f2b3ab7293686bf72d1eed6f60d5.webp',
  // Additional destinations present in leads
  LADAKH: 'https://ticketstotrip.com/cdn-assets/original/28.jpg',
  ANDAMAN: 'https://ticketstotrip.com/cdn-assets/original/a-couple-of-men-and-woman-at-a-swing-on-the-beach-2025-01-08-22-39-59-utc-1-.jpg',
  SIKKIM: 'https://ticketstotrip.com/cdn-assets/original/sikkim.png',
  NORTH_EAST: 'https://ticketstotrip.com/cdn-assets/original/10-pelling-and-yuksom-sikkim-4-.jpg',
};

// Accept common variants from Sheets (spaces vs underscores, synonyms)
const STATE_SYNONYMS: Record<string, string> = {
  'HIMACHAL PRADESH': 'HIMACHAL_PRADESH',
  'MADHYA PRADESH': 'MADHYA_PRADESH',
  'TAMIL NADU': 'TAMIL_NADU',
  'WEST BENGAL': 'WEST_BENGAL',
  'JAMMU & KASHMIR': 'JAMMU_KASHMIR',
  'JAMMU KASHMIR': 'JAMMU_KASHMIR',
  'KASHMIR': 'JAMMU_KASHMIR',
  'NORTH EAST': 'NORTH_EAST',
};

const ROOT_DIR = 'TTTCRM/media/states';
const META_KEY = 'state_image_meta_v1';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FORCE_REFRESH_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

type MetaEntry = {
  url: string;
  etag?: string;
  lastModified?: string;
  savedAt: number;
  lastChecked?: number;
};

type MetaStore = Record<string, MetaEntry>;

const nativeRefreshInFlight = new Set<string>();
const webRefreshInFlight = new Set<string>();

function slugify(stateKey: string): string {
  return stateKey.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function getExtFromUrl(url: string): string {
  const m = url.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/);
  return (m?.[1] || 'img').toLowerCase();
}

function readMeta(): MetaStore {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as MetaStore) : {};
  } catch {
    return {};
  }
}

function writeMeta(meta: MetaStore): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {}
}

function getMetaEntry(key: string): MetaEntry | undefined {
  const meta = readMeta();
  return meta[key];
}

function updateMetaEntry(key: string, updates: Partial<MetaEntry> & { url?: string }): MetaEntry {
  const meta = readMeta();
  const prev = meta[key];
  const next: MetaEntry = {
    url: updates.url ?? prev?.url ?? '',
    etag: updates.etag ?? prev?.etag,
    lastModified: updates.lastModified ?? prev?.lastModified,
    savedAt: updates.savedAt ?? prev?.savedAt ?? Date.now(),
    lastChecked: updates.lastChecked ?? prev?.lastChecked,
  };
  meta[key] = next;
  writeMeta(meta);
  return next;
}

function removeMetaEntry(key: string): void {
  const meta = readMeta();
  if (meta[key]) {
    delete meta[key];
    writeMeta(meta);
  }
}

function shouldCheckNow(entry?: MetaEntry): boolean {
  if (!entry?.lastChecked) return true;
  return Date.now() - entry.lastChecked > CHECK_INTERVAL_MS;
}

function shouldForceRefresh(entry?: MetaEntry): boolean {
  if (!entry?.savedAt) return true;
  return Date.now() - entry.savedAt > FORCE_REFRESH_MS;
}

async function fetchHeadMetadata(url: string): Promise<{ etag?: string; lastModified?: string } | null> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return null;
    return {
      etag: res.headers.get('etag') || undefined,
      lastModified: res.headers.get('last-modified') || undefined,
    };
  } catch {
    return null;
  }
}

async function fetchWithHeaders(url: string): Promise<{ blob: Blob; etag?: string; lastModified?: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const etag = res.headers.get('etag') || undefined;
    const lastModified = res.headers.get('last-modified') || undefined;
    return { blob, etag, lastModified };
  } catch {
    return null;
  }
}

async function writeNativeFile(path: string, blob: Blob): Promise<string | null> {
  try {
    const buffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    await Filesystem.writeFile({ path, data: base64, directory: Directory.Data, recursive: true });
    const { uri } = await Filesystem.getUri({ directory: Directory.Data, path });
    return Capacitor.convertFileSrc ? Capacitor.convertFileSrc(uri) : uri;
  } catch {
    return null;
  }
}

async function downloadNativeImage(key: string, url: string, filePath: string): Promise<string | null> {
  const res = await fetchWithHeaders(url);
  if (!res) return null;
  const nativeUrl = await writeNativeFile(filePath, res.blob);
  if (nativeUrl) {
    updateMetaEntry(key, {
      url,
      etag: res.etag,
      lastModified: res.lastModified,
      savedAt: Date.now(),
      lastChecked: Date.now(),
    });
  }
  return nativeUrl;
}

async function readNativeExists(path: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path, directory: Directory.Data });
    return true;
  } catch {
    return false;
  }
}

async function getNativeDisplayUrl(path: string): Promise<string | null> {
  try {
    const { uri } = await Filesystem.getUri({ directory: Directory.Data, path });
    return Capacitor.convertFileSrc ? Capacitor.convertFileSrc(uri) : uri;
  } catch {
    return null;
  }
}

async function ensureNativeStateImage(key: string, url: string): Promise<{ localUri: string | null; filePath: string }> {
  const ext = getExtFromUrl(url);
  const filePath = `${ROOT_DIR}/state_${slugify(key)}.${ext}`;
  const exists = await readNativeExists(filePath);
  let localUri: string | null = null;
  if (exists) {
    localUri = await getNativeDisplayUrl(filePath);
    if (localUri && !getMetaEntry(key)) {
      updateMetaEntry(key, { url, savedAt: Date.now(), lastChecked: Date.now() });
    }
  } else {
    localUri = await downloadNativeImage(key, url, filePath);
  }
  return { localUri, filePath };
}

async function refreshNativeImageInBackground(key: string, url: string, filePath: string): Promise<void> {
  if (nativeRefreshInFlight.has(key)) return;
  const entry = getMetaEntry(key);
  if (!shouldCheckNow(entry)) return;
  nativeRefreshInFlight.add(key);
  updateMetaEntry(key, { url, lastChecked: Date.now() });
  try {
    const head = await fetchHeadMetadata(url);
    let needsDownload = !entry;
    if (head) {
      if (head.etag && entry?.etag && head.etag !== entry.etag) {
        needsDownload = true;
      } else if (!entry?.etag && head.etag) {
        needsDownload = true;
      } else if (head.lastModified && entry?.lastModified && head.lastModified !== entry.lastModified) {
        needsDownload = true;
      } else if (!entry?.lastModified && head.lastModified) {
        needsDownload = true;
      } else if (!head.etag && !head.lastModified && shouldForceRefresh(entry)) {
        needsDownload = true;
      }
    } else if (shouldForceRefresh(entry)) {
      needsDownload = true;
    }

    if (needsDownload) {
      const nativeUrl = await downloadNativeImage(key, url, filePath);
      if (!nativeUrl) {
        // if download failed, retry sooner
        updateMetaEntry(key, { url, lastChecked: Date.now() - CHECK_INTERVAL_MS / 2 });
      }
    }
  } finally {
    nativeRefreshInFlight.delete(key);
  }
}

async function refreshWebImageInBackground(key: string, url: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (webRefreshInFlight.has(key)) return;
  const entry = getMetaEntry(key);
  if (!shouldCheckNow(entry)) return;
  webRefreshInFlight.add(key);
  updateMetaEntry(key, { url, lastChecked: Date.now() });
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return;
    if ('caches' in window) {
      try {
        const cache = await caches.open('img-cache-v1');
        await cache.put(url, res.clone());
      } catch {}
    }
    updateMetaEntry(key, {
      url,
      etag: res.headers.get('etag') || undefined,
      lastModified: res.headers.get('last-modified') || undefined,
      savedAt: Date.now(),
    });
  } catch {
    // ignore
  } finally {
    webRefreshInFlight.delete(key);
  }
}

export async function prefetchAllStateImages(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    for (const [key, url] of Object.entries(STATE_IMAGE_URLS)) {
      const { filePath } = await ensureNativeStateImage(key, url);
      refreshNativeImageInBackground(key, url, filePath).catch(() => {});
    }
  } else {
    // Web: warm Cache API via imageCache helper
    for (const [key, url] of Object.entries(STATE_IMAGE_URLS)) {
      try { await getLocalImageUrl(url); } catch {}
      refreshWebImageInBackground(key, url).catch(() => {});
    }
  }
}

export async function getStateImageUrl(stateKey: string): Promise<string | null> {
  const key = String(stateKey || '').trim().toUpperCase();
  console.log(`🔍 getStateImageUrl called with: "${stateKey}" -> "${key}"`);
  
  // Try direct, underscore form, and synonym mapping
  const underscoreKey = key.replace(/\s+/g, '_');
  const synonymKey = STATE_SYNONYMS[key] || STATE_SYNONYMS[key.replace(/\s+/g, ' ')];
  
  console.log(`🔍 underscoreKey: "${underscoreKey}"`);
  console.log(`🔍 synonymKey: "${synonymKey}"`);
  
  const matchedKey =
    (STATE_IMAGE_URLS[key] ? key :
      STATE_IMAGE_URLS[underscoreKey] ? underscoreKey :
      (synonymKey && STATE_IMAGE_URLS[synonymKey] ? synonymKey : undefined));
      
  console.log(`🔍 matchedKey: "${matchedKey}"`);
  console.log(`🔍 Available STATE_IMAGE_URLS keys:`, Object.keys(STATE_IMAGE_URLS));
  
  const url = matchedKey ? STATE_IMAGE_URLS[matchedKey] : undefined;
  console.log(`🔍 resolved URL: "${url}"`);
  
  if (!url) {
    console.warn(`⚠️ No image URL found for state: "${stateKey}" (key: "${key}")`);
    return null;
  }

  // Test if the URL is accessible (skip for cached images to improve performance)
  const metaEntry = getMetaEntry(matchedKey || key);
  if (!metaEntry || shouldCheckNow(metaEntry)) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (!response.ok) {
        console.warn(`⚠️ Image URL not accessible: ${url} (status: ${response.status})`);
        return null;
      }
      console.log(`✅ Image URL is accessible: ${url}`);
    } catch (error) {
      console.warn(`⚠️ Failed to test image URL accessibility: ${url}`, error);
      // Continue anyway, as this might be a CORS issue
    }
  } else {
    console.log(`✅ Using cached image (skipping URL test): ${url}`);
  }

  if (Capacitor.isNativePlatform()) {
    const canonicalKey = matchedKey || key;
    const { localUri, filePath } = await ensureNativeStateImage(canonicalKey, url);
    refreshNativeImageInBackground(canonicalKey, url, filePath).catch(() => {});
    return localUri || url;
  }

  // Web: use existing cache helper
  const cached = await getLocalImageUrl(url);
  if (matchedKey) {
    refreshWebImageInBackground(matchedKey, url).catch(() => {});
  }
  return cached || url;
}

export async function refreshStateImages(): Promise<void> {
  // Re-download and overwrite
  await clearStateImageCache();
  await prefetchAllStateImages();
}

export async function clearStateImageCache(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.rmdir({ path: ROOT_DIR, directory: Directory.Data, recursive: true });
    } catch {}
  } else {
    // Web: clear object URLs not tracked; clear Cache API entries if needed
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const k of keys) {
          if (k.includes('img-cache')) await caches.delete(k);
        }
      }
    } catch {}
  }
  try { localStorage.removeItem(META_KEY); } catch {}
}
