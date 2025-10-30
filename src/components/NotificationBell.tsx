import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { fetchNotifications, AppNotification } from '@/utils/notifications';
import { playSound, vibrate } from '@/utils/notifyHelpers';
import { useSheetService } from '@/hooks/useSheetService';

const STORAGE_KEY = 'crm_notifications_cache_v1';

export default function NotificationBell({ user }: { user: { email?: string } }) {
  const [sheetService, setSheetService] = useState<any>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  // hydrate from cache immediately
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setNotifications(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const svc = await useSheetService();
        setSheetService(svc);
      } catch (e) {
        console.warn('Notification sheet service unavailable:', e);
      }
    })();
  }, []);

  useEffect(() => {
    if (!sheetService) return;
    let cancelled = false;

    const load = async () => {
      try {
        const data = await fetchNotifications(sheetService, user?.email || '');
        if (cancelled) return;
        if (data.length > notifications.length) {
          playSound();
          vibrate();
        }
        setNotifications(data);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
      } catch (e) {
        console.warn('Failed to load notifications:', e);
      }
    };

    load();
    const interval = setInterval(load, 60000);
    const onOnline = () => load();
    window.addEventListener('online', onOnline);
    return () => { cancelled = true; clearInterval(interval); window.removeEventListener('online', onOnline); };
  }, [sheetService]);

  return (
    <div className="relative">
      <Bell className="cursor-pointer" onClick={() => setOpen(!open)} />
      {notifications.length > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full px-1">
          {notifications.length}
        </span>
      )}
      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white shadow-xl rounded-xl p-3 z-50 border">
          {notifications.length === 0 ? (
            <div className="text-xs text-muted-foreground">No new notifications</div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className="border-b py-1 last:border-0">
                <p className="font-semibold">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.message}</p>
                <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
