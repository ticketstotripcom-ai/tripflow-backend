import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { AppNotification } from '@/utils/notifications';
import { useSheetService } from '@/hooks/useSheetService';
import { notificationService } from '@/lib/notificationService';

const CACHE_KEY = 'crm_notifications_hybrid_v1';
const POLL_MS = 10_000; // 10 seconds

function dedupeMerge(existing: AppNotification[], incoming: AppNotification[]): AppNotification[] {
  const map = new Map<string, AppNotification>();
  for (const n of existing) map.set(String(n.id), n);
  for (const n of incoming) map.set(String(n.id), { ...(map.get(String(n.id)) || {} as AppNotification), ...n });
  // Newest first, unread first
  return Array.from(map.values()).sort((a, b) => {
    if (a.read && !b.read) return 1;
    if (!a.read && b.read) return -1;
    return new Date(b.createdAt || b.date || '').getTime() - new Date(a.createdAt || a.date || '').getTime();
  });
}

export function useNotifications() {
  const { service: sheetService } = useSheetService();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const rawApi = (import.meta as any).env.VITE_SHEET_API_URL as string | undefined;
  const normalizeAppsScriptUrl = (u?: string) => {
    if (!u) return undefined;
    const trimmed = u.trim();
    // Fix accidental double prefix
    const dup = 'https://script.google.com/macros/s/https://script.google.com/macros/s/';
    if (trimmed.startsWith(dup)) return trimmed.replace(dup, 'https://script.google.com/macros/s/');
    return trimmed;
  };
  const apiUrl = normalizeAppsScriptUrl(rawApi);

  // hydrate from local cache immediately
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, []);

  const fetchFromAppsScript = useCallback(async (): Promise<AppNotification[] | null> => {
    // Skip Apps Script polling on native (Android/iOS) to avoid CORS in WebView
    if (Capacitor.getPlatform() !== 'web') return null;
    if (!apiUrl) return null;
    try {
      const res = await fetch(apiUrl, { method: 'GET', cache: 'no-store' });
      if (!res.ok) throw new Error('Apps Script fetch failed');
      const json = await res.json();
      // Normalize basic fields
      const mapped: AppNotification[] = (json || []).map((r: any) => ({
        id: String(r.id || r.ID || r.Id || `${r.title || 'notification'}-${r.message || ''}-${r.time || Date.now()}`),
        title: String(r.title || r.Title || 'Notification'),
        message: String(r.message || r.Message || ''),
        type: String(r.type || r.Type || ''),
        read: Boolean(r.read ?? false),
        createdAt: String(r.createdAt || r.time || r.date || new Date().toISOString()),
        route: r.route,
      }));
      return mapped;
    } catch (e) {
      console.warn('[useNotifications] Apps Script fetch failed:', e);
      return null;
    }
  }, [apiUrl]);

  const fetchHybrid = useCallback(async () => {
    setError(null);
    try {
      // Try Apps Script endpoint first
      const a = await fetchFromAppsScript();
      if (a && a.length) {
        setItems(prev => {
          const merged = dedupeMerge(prev, a);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch {}
          return merged;
        });
      } else if (sheetService) {
        // Fallback to Sheets via service
        const b = []; // Replace with actual notification fetching logic if needed
        setItems(prev => {
          const merged = dedupeMerge(prev, b);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch {}
          return merged;
        });
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  }, [sheetService, fetchFromAppsScript]);

  // initial load + polling
  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await fetchHybrid(); })();
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      // skip when offline; next tick will resync
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      fetchHybrid();
    }, POLL_MS) as unknown as number;
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [fetchHybrid]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchHybrid();
  }, [fetchHybrid]);

  return { notifications: items, loading, error, refresh };
}
