import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Notification,
  getUserNotifications,
  markNotificationRead,
} from "@/services/notificationService";
import { authService } from "@/lib/authService";
import { showLocalNotification, playNotificationSound } from "@/lib/nativeNotifications";

interface NotificationContextValue {
  notifications: Notification[];
  isLoading: boolean;
  unreadCount: number;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  settings: NotificationSettings;
  updateSettings: (next: Partial<NotificationSettings>) => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

const POLL_INTERVAL_MS = 45000;

interface NotificationSettings {
  muteLowPriority: boolean;
  dndEnabled: boolean;
  dndStartHour: number;
  dndEndHour: number;
  digestLowPriority: boolean;
  snoozed: Record<string, number>; // id -> epoch when snooze ends
}

const SETTINGS_KEY = "tripflow_notification_settings";

function loadSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw) as NotificationSettings;
  } catch {}
  return {
    muteLowPriority: false,
    dndEnabled: false,
    dndStartHour: 22,
    dndEndHour: 7,
    digestLowPriority: false,
    snoozed: {},
  };
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string>(() => authService.getSession()?.user?.email || "");
  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastIdsRef = useRef<Set<string>>(new Set());
  const [settings, setSettings] = useState<NotificationSettings>(loadSettings);
  const digestQueueRef = useRef<Notification[]>([]);

  useEffect(() => {
    const unsub = authService.onAuthStateChange((session) => {
      setSessionEmail(session?.user?.email || "");
      if (!session) {
        setNotifications([]);
        lastIdsRef.current = new Set();
      }
    });
    return () => unsub();
  }, []);

  const saveSettings = (next: NotificationSettings) => {
    setSettings(next);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
  };

  const refreshNotifications = React.useCallback(async () => {
    if (!sessionEmail) return;
    setIsLoading(true);
    try {
      const items = await getUserNotifications(sessionEmail);
      const now = new Date();
      const inDnd =
        settings.dndEnabled &&
        (() => {
          const h = now.getHours();
          const { dndStartHour, dndEndHour } = settings;
          if (dndStartHour < dndEndHour) {
            return h >= dndStartHour && h < dndEndHour;
          }
          return h >= dndStartHour || h < dndEndHour;
        })();

      // expire snoozes
      const updatedSnoozed = { ...settings.snoozed };
      Object.entries(updatedSnoozed).forEach(([id, until]) => {
        if (Date.now() > until) delete updatedSnoozed[id];
      });
      if (Object.keys(updatedSnoozed).length !== Object.keys(settings.snoozed).length) {
        saveSettings({ ...settings, snoozed: updatedSnoozed });
      }

      const visible = items.filter((n) => {
        const snoozeUntil = settings.snoozed[n.id];
        return !snoozeUntil || Date.now() > snoozeUntil;
      });

      // Detect newly arrived notifications to trigger local/push cues
      const incoming = visible.filter((n) => !lastIdsRef.current.has(n.id));
      if (incoming.length) {
        incoming.forEach((n) => {
          const isLow = n.priority === "low";
          const suppress = settings.muteLowPriority && isLow;
          if (suppress) return;
          if (inDnd) {
            if (settings.digestLowPriority && isLow) {
              digestQueueRef.current.push(n);
              return;
            }
          }
          showLocalNotification(n).catch(() => {});
          if (!settings.muteLowPriority || n.priority === "high") {
            playNotificationSound(n).catch(() => {});
          }
        });
      }
      setNotifications(visible);
      lastIdsRef.current = new Set(items.map((n) => n.id));
    } catch (err) {
      console.warn("[NotificationContext] Failed to refresh notifications", err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionEmail, settings]);

  const markAsRead = React.useCallback(
    async (id: string) => {
      try {
        await markNotificationRead(id);
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        lastIdsRef.current.delete(id);
      } catch (err) {
        console.warn("[NotificationContext] Failed to mark as read", err);
      }
    },
    []
  );

  const markAllAsRead = React.useCallback(async () => {
    const ids = notifications.map((n) => n.id);
    await Promise.all(ids.map((id) => markAsRead(id)));
  }, [notifications, markAsRead]);

  const updateSettings = (next: Partial<NotificationSettings>) => {
    saveSettings({ ...settings, ...next });
  };

  useEffect(() => {
    if (!sessionEmail) return;
    refreshNotifications();
    if (pollerRef.current) clearInterval(pollerRef.current);
    pollerRef.current = setInterval(() => {
      refreshNotifications();
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollerRef.current) clearInterval(pollerRef.current);
    };
  }, [sessionEmail, refreshNotifications]);

  const value = useMemo(
    () => ({
      notifications,
      isLoading,
      unreadCount: notifications.filter((n) => !n.read).length,
      refreshNotifications,
      markAsRead,
      markAllAsRead,
      settings,
      updateSettings,
    }),
    [notifications, isLoading, refreshNotifications, markAsRead, markAllAsRead, settings]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export function useNotificationsContext(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotificationsContext must be used within NotificationProvider");
  }
  return ctx;
}
