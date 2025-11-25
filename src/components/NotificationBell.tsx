import { useEffect, useMemo, useState } from 'react';
import { Bell } from 'lucide-react';
import { AppNotification, fetchNotifications, markNotificationsAsRead } from '@/utils/notifications';
import { openDB } from 'idb';
import { playSound, vibrate } from '@/utils/notifyHelpers';
import { useSheetService } from '@/hooks/useSheetService';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNavigate } from 'react-router-dom';
import { stateManager } from '@/lib/stateManager';

const STORAGE_KEY = 'crm_notifications_cache_v1';

type SheetServiceInstance = Awaited<ReturnType<typeof useSheetService>>;

export default function NotificationBell({ user }: { user: { email?: string } }) {
  const [sheetService, setSheetService] = useState<SheetServiceInstance | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const navigate = useNavigate();

  // hydrate from cache immediately
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setNotifications(JSON.parse(raw));
    } catch (error) {
      console.warn('Failed to hydrate notifications cache:', error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const svc = await useSheetService();
        if (!cancelled) setSheetService(svc);
      } catch (e) {
        console.warn('Notification sheet service unavailable:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sheetService) return;
    let cancelled = false;

    const load = async () => {
      try {
        const data = await fetchNotifications(sheetService, user?.email || '');
        let offline: any[] = [];
        try {
          const db = await openDB('notifications-db', 1);
          const tx = db.transaction('notifications', 'readonly');
          const store = tx.objectStore('notifications');
          offline = await store.getAll();
        } catch {}
        const combined = [...data, ...offline.map((o: any) => ({
          id: String(o.id || o.internalId || Date.now()),
          title: String(o.title || 'Notification'),
          message: String(o.message || ''),
          type: String(o.type || 'message') as any,
          createdAt: String(o.createdAt || new Date().toISOString()),
          read: !!o.read,
          userEmail: String(user?.email || ''),
          route: o.route,
          targetTravellerName: o.targetTravellerName,
          targetDateTime: o.targetDateTime,
          targetTripId: o.targetTripId,
        })) as AppNotification[];
        if (cancelled) return;
        setNotifications((prev) => {
          const previousIds = new Set(prev.map((n) => n.id));
          const hasNew = combined.some((n) => !previousIds.has(n.id));
          if (hasNew && combined.length > 0) {
            playSound();
            vibrate();
          }
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(combined));
          } catch (error) {
            console.warn('Failed to cache notifications:', error);
          }
          return combined;
        });
      } catch (e) {
        console.warn('Failed to load notifications:', e);
        try {
          const db = await openDB('notifications-db', 1);
          const tx = db.transaction('notifications', 'readonly');
          const store = tx.objectStore('notifications');
          const offline = await store.getAll();
          const mapped = offline.map((o: any) => ({
            id: String(o.id || o.internalId || Date.now()),
            title: String(o.title || 'Notification'),
            message: String(o.message || ''),
            type: String(o.type || 'message') as any,
            createdAt: String(o.createdAt || new Date().toISOString()),
            read: !!o.read,
            userEmail: String(user?.email || ''),
            route: o.route,
            targetTravellerName: o.targetTravellerName,
            targetDateTime: o.targetDateTime,
            targetTripId: o.targetTripId,
          })) as AppNotification[];
          setNotifications(mapped);
        } catch {}
      }
    };

    load();
    const interval = setInterval(load, 60000);
    const refreshListener = () => load();
    window.addEventListener('sheet-notifications-refresh', refreshListener as any);
    const onOnline = () => load();
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('sheet-notifications-refresh', refreshListener as any);
      window.removeEventListener('online', onOnline);
    };
  }, [sheetService, user?.email]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const handleToggle = async () => {
    const nextOpen = !open;
    if (!nextOpen) {
      setOpen(false);
      setNotifications((prev) => prev.filter((n) => !n.read));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      } catch (error) {
        console.warn('Failed to clear notifications cache:', error);
      }
      return;
    }

    setOpen(true);
    if (!sheetService || unreadCount === 0 || markingRead) return;

    try {
      setMarkingRead(true);
      await markNotificationsAsRead(sheetService, notifications);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (error) {
      console.warn('Failed to mark notifications as read:', error);
    } finally {
      setMarkingRead(false);
    }
  };

  const handleClickNotification = async (n: AppNotification) => {
    // Mark as read locally and in sheet
    try {
      if (sheetService) await markNotificationsAsRead(sheetService as any, [n]);
    } catch {}
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    } catch {}

    // Deep-link navigation
    if (n.route) {
      navigate(n.route);
    } else if (n.targetTravellerName || n.targetDateTime || n.targetTripId) {
      stateManager.setPendingTarget({ travellerName: n.targetTravellerName, dateAndTime: n.targetDateTime, tripId: n.targetTripId });
      navigate('/dashboard?view=analytics');
    } else if (n.message) {
      // Prefer extracting traveller/customer name from message (handles quotes and common phrasing)
      const msg = (n.message || '').trim();
      let key = '';
      // 1) Name inside quotes, e.g., Trip for "Ankush Kalekar" assigned to ...
      const mQuoted = msg.match(/"([^\"]{2,80})"/);
      if (mQuoted && mQuoted[1]) {
        key = mQuoted[1].trim();
      }
      // 2) for <name> assigned ... with optional quotes
      if (!key) {
        const mFor = msg.match(/\bfor\s+["']?([A-Za-z][A-Za-z\s.'-]{1,80})["']?\s+assigned\b/i);
        if (mFor && mFor[1]) key = mFor[1].trim();
      }
      // 3) <name> booked with us
      if (!key) {
        const mBooked = msg.match(/^([A-Za-z][A-Za-z\s.'-]{1,80})\s+booked\b/i);
        if (mBooked && mBooked[1]) key = mBooked[1].trim();
      }
      // 4) Fallback: first capitalized phrase (likely a name)
      if (!key) {
        const words = msg.split(/\s+/);
        const start = words.findIndex(w => /^[A-Z]/.test(w));
        if (start >= 0) key = words.slice(start, start + 3).join(' ').trim();
      }
      // Final fallback: avoid generic title like "Trip Assigned"
      if (!key) key = msg.replace(/[-–:]/g, ' ').trim();
      stateManager.setSearchQuery(key);
      navigate('/dashboard?view=analytics');
    } else {
      // Heuristic: fallback to search — prefer customer name from message
      const msg = n.message || '';
      let key = '';
      const m1 = msg.match(/for\s+([A-Za-z\s.'-]+)/i);
      if (m1) {
        key = m1[1].split(/assigned|has|to|booked|,|\./i)[0].trim();
      } else {
        const m2 = msg.match(/^([A-Za-z\s.'-]+)\s+booked/i);
        if (m2) key = m2[1].trim();
      }
      if (!key) {
        const words = msg.split(/\s+/);
        const start = words.findIndex(w => /^[A-Z]/.test(w));
        if (start >= 0) key = words.slice(start, start + 3).join(' ').trim();
      }
      if (!key) key = (n.title || msg).split(/[-–:"]/)[0].trim();
      stateManager.setSearchQuery(key);
      navigate('/dashboard?view=analytics');
    }
    setOpen(false);
  };

  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleToggle}
            className="relative flex items-center justify-center text-muted-foreground hover:text-foreground transition"
            aria-label={unreadCount > 0 ? `View ${unreadCount} notifications` : 'View notifications'}
          >
            <Bell className="cursor-pointer" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full px-1">
                {unreadCount}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {unreadCount > 0 ? `${unreadCount} new notification${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
        </TooltipContent>
      </Tooltip>
      {open && (
        <div
          className="fixed right-2 top-[72px] w-[min(20rem,calc(100vw-1rem))] max-h-[min(75vh,calc(100vh-6rem))] overflow-auto bg-white dark:bg-slate-900 shadow-xl rounded-xl p-3 z-[120] border border-slate-200 dark:border-slate-700"
        >
          {notifications.length === 0 ? (
            <div className="text-xs text-muted-foreground">No new notifications</div>
          ) : (
            notifications.map((n) => (
              <button key={n.id} className="border-b py-1 last:border-0 text-left w-full" onClick={() => handleClickNotification(n)}>
                <p className="font-semibold flex items-center gap-2">
                  {n.title}
                  {n.read && <span className="text-[10px] text-muted-foreground uppercase">Viewed</span>}
                </p>
                <p className="text-sm text-muted-foreground">{n.message}</p>
                <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</div>
              </button>
            ))
          )}
          <div className="pt-2 text-right">
            <button className="text-xs text-primary hover:underline" onClick={() => { setOpen(false); navigate('/notifications'); }}>
              View all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
