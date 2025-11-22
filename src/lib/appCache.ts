// Simple app-wide cache helper with TTL and optional device storage snapshot
import { persistCacheSnapshot, readCacheSnapshot } from '@/lib/deviceStorage';

type CacheRecord<T> = { value: T; ts: number };

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

export async function cacheSet<T>(key: string, value: T): Promise<void> {
  const record: CacheRecord<T> = { value, ts: Date.now() };
  try { localStorage.setItem(key, JSON.stringify(record)); } catch {}
  try { await persistCacheSnapshot(key, record); } catch {}
}

export async function cacheGet<T>(key: string, ttlMs: number = DEFAULT_TTL): Promise<T | null> {
  const now = Date.now();
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const rec = JSON.parse(raw) as CacheRecord<T>;
      if (rec && rec.ts && (now - rec.ts) < ttlMs) return rec.value;
    }
  } catch {}
  try {
    const rec = await readCacheSnapshot<CacheRecord<T>>(key);
    if (rec && rec.ts && (now - rec.ts) < ttlMs) return rec.value;
  } catch {}
  return null;
}

