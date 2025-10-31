import { useEffect, useMemo, useState } from 'react';
import { Bell } from 'lucide-react';
import { AppNotification, fetchNotifications, markNotificationsAsRead } from '@/utils/notifications';
import { playSound, vibrate } from '@/utils/notifyHelpers';
import { useSheetService } from '@/hooks/useSheetService';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const STORAGE_KEY = 'crm_notifications_cache_v1';

type SheetServiceInstance = Awaited<ReturnType<typeof useSheetService>>;

export default function NotificationBell({ user }: { user: { email?: string } }) {
  const [sheetService, setSheetService] = useState<SheetServiceInstance | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

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
        if (cancelled) return;
        setNotifications((prev) => {
          const previousIds = new Set(prev.map((n) => n.id));
          const hasNew = data.some((n) => !previousIds.has(n.id));
          if (hasNew && data.length > 0) {
            playSound();
            vibrate();
          }
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
          } catch (error) {
            console.warn('Failed to cache notifications:', error);
          }
          return data;
        });
      } catch (e) {
        console.warn('Failed to load notifications:', e);
      }
    };

    load();
    const interval = setInterval(load, 60000);
    const onOnline = () => load();
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      clearInterval(interval);
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
        <div className="absolute right-0 mt-2 w-72 bg-white shadow-xl rounded-xl p-3 z-50 border">
          {notifications.length === 0 ? (
            <div className="text-xs text-muted-foreground">No new notifications</div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className="border-b py-1 last:border-0">
                <p className="font-semibold flex items-center gap-2">
                  {n.title}
                  {n.read && <span className="text-[10px] text-muted-foreground uppercase">Viewed</span>}
                </p>
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
