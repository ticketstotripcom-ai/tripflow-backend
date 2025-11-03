import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Howl } from "howler";
import { openDB } from "idb";

export function useWebSocketNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:7071");
    const sound = new Howl({ src: ["/notification.mp3"], volume: 0.6 });

    // IndexedDB for offline cache
    const initDB = async () =>
      openDB("notifications-db", 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains("notifications")) {
            db.createObjectStore("notifications", { keyPath: "timestamp" });
          }
        },
      });

    const saveOffline = async (data) => {
      const db = await initDB();
      await db.put("notifications", data);
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      sound.play();
      setUnreadCount((prev) => prev + 1);
      toast({ title: data.title, description: data.message });
      if ("setAppBadge" in navigator) navigator.setAppBadge?.(unreadCount + 1);
      await saveOffline({ ...data, timestamp: Date.now(), read: false });
    };

    ws.onopen = () => console.log("🔔 Connected to WebSocket");
    ws.onclose = () => console.warn("⚠️ WebSocket closed");

    // Background sync for missed notifications
    const checkMissed = async () => {
      const db = await initDB();
      const tx = db.transaction("notifications", "readonly");
      const store = tx.objectStore("notifications");
      const all = await store.getAll();
      all.forEach((notif) => {
        if (!notif.read)
          toast({ title: notif.title, description: notif.message });
      });
      setUnreadCount(all.filter((n) => !n.read).length);
    };
    checkMissed();

    // Listen for service worker sync messages
    navigator.serviceWorker?.addEventListener("message", (event) => {
      if (event.data?.type === "SYNC_NOTIFICATIONS") {
        checkMissed();
      }
    });

    return () => ws.close();
  }, [unreadCount]);

  const markAllAsRead = async () => {
    setUnreadCount(0);
    navigator.clearAppBadge?.();
    const db = await openDB("notifications-db", 1);
    const tx = db.transaction("notifications", "readwrite");
    const store = tx.objectStore("notifications");
    const all = await store.getAll();
    for (const n of all) {
      n.read = true;
      await store.put(n);
    }
  };

  return { unreadCount, markAllAsRead };
}