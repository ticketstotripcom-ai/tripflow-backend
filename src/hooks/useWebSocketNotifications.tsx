import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { triggerNativeNotification, clearAllNotifications } from "@/lib/nativeNotifications";
import { openDB } from "idb";
import type { AppNotification } from "@/utils/notifications";
import { createNotification as createSheetNotification } from "@/services/notificationService";

declare global {
  interface Window {
    __wsReconnectAttempts?: number;
    __ws?: WebSocket;
  }
}

export function useWebSocketNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const keepAliveRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const getWsUrl = () => {
      const envUrl = import.meta.env.VITE_WS_URL;
      if (envUrl) return envUrl;
      return window.location.hostname === "localhost"
        ? "ws://localhost:8080"
        : "wss://tripflow-backend-6xzr.onrender.com";
    };

    const connectWebSocket = () => {
      if (!mounted || isConnectingRef.current) return;
      isConnectingRef.current = true;
      setConnectionStatus("connecting");

      const wsUrl = getWsUrl();
      console.log("🔗 Connecting to WebSocket:", wsUrl);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      (window as any).__ws = ws;

      ws.onopen = () => {
        console.log("✅ WebSocket connected");
        setConnectionStatus("connected");
        isConnectingRef.current = false;
        window.__wsReconnectAttempts = 0;
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }

        if (keepAliveRef.current) clearInterval(keepAliveRef.current);
        keepAliveRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            try {
              wsRef.current.send("ping");
            } catch (e) {
              console.warn("WS ping failed:", e);
            }
          }
        }, 30000);
      };

      ws.onmessage = async (event) => {
        try {
          if (event.data === 'pong') return; // Ignore keep-alive messages
          
          const notification: AppNotification = JSON.parse(event.data);
          
          // 1. Show in-app toast
          toast(notification.title, { description: notification.message });

          // 2. Trigger native notification (handles sound, badge, permissions, and settings)
          await triggerNativeNotification(notification);

          // 3. Persist for offline view
          await saveOffline(notification);
          setUnreadCount(prev => prev + 1);
          
          // 4. Persist to Google Sheet for unified history (as an in-app notification)
          // We need user email for this; will use a placeholder for now as it's not directly in notification payload
          const authService = (await import('@/lib/authService')).authService;
          const currentUser = authService.getSession()?.user;

          if (currentUser) {
            await createSheetNotification({
              sourceSheet: "WebSocket",
              title: notification.title,
              message: notification.message,
              roleTarget: currentUser.role, // Assuming WS notifications are for the current user
              userEmail: currentUser.email,
              type: "in-app", // Mark as in-app for sheet perspective
              priority: notification.priority || "normal",
              timestamp: notification.createdAt,
              route: notification.route,
              targetTravellerName: notification.targetTravellerName,
              targetDateTime: notification.targetDateTime,
              targetTripId: notification.targetTripId,
              internalId: notification.id, // Use notification ID as internalId for uniqueness
            });
          }

        } catch (err) {
          console.warn("Failed to process WS message:", err);
        }
      };

      ws.onclose = (e) => {
        console.warn("WebSocket closed:", e.code, e.reason);
        setConnectionStatus("disconnected");
        wsRef.current = null;
        isConnectingRef.current = false;
        if (keepAliveRef.current) clearInterval(keepAliveRef.current);

        const attempt = (window.__wsReconnectAttempts || 0) + 1;
        const maxAttempts = 10;
        if (!mounted || attempt > maxAttempts) {
          console.warn("[WebSocket] Max reconnection attempts reached or component unmounted.");
          return;
        }
        
        const delay = Math.min(1000 * 2 ** attempt, 30000);
        window.__wsReconnectAttempts = attempt;

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connectWebSocket();
        }, delay);
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        isConnectingRef.current = false;
        setConnectionStatus("disconnected");
      };
    };

    connectWebSocket();

    return () => {
      mounted = false;
      wsRef.current?.close();
      wsRef.current = null;
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      delete window.__wsReconnectAttempts;
    };
  }, []);

  const markAllAsRead = async () => {
    try {
      await clearAllNotifications(); // Clears badge and native notifications
      setUnreadCount(0);

      const db = await openDB("notifications-db", 1);
      const tx = db.transaction("notifications", "readwrite");
      const allNotifs = await tx.store.getAll();
      for (const notif of allNotifs) {
        if (!notif.read) {
          await tx.store.put({ ...notif, read: true });
        }
      }
      await tx.done;
    } catch (err) {
      console.warn("Failed to mark notifications as read:", err);
    }
  };

  return { unreadCount, markAllAsRead, connectionStatus };
}

// --- IndexedDB persistence ---
async function saveOffline(notif: AppNotification) {
  try {
    const db = await openDB("notifications-db", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("notifications"))
          db.createObjectStore("notifications", { keyPath: "id" });
      },
    });
    await db.put("notifications", notif);
  } catch (err) {
    console.warn("Failed to save notification to IndexedDB:", err);
  }
}
