import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { Howl } from "howler";
import { showLocalNotification } from "@/lib/nativeNotifications";
import { openDB } from "idb";

export function useWebSocketNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const keepAliveRef = useRef<NodeJS.Timeout | null>(null);
  const soundRef = useRef<Howl | null>(null);
  const isConnectingRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const getWsUrl = () => {
      // Use environment variable if present
      const envUrl = import.meta.env.VITE_WS_URL;
      if (envUrl) return envUrl;

      // Localhost fallback for dev, Render backend for prod
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

      // Initialize notification sound
      try {
        const base = (import.meta as any).env?.BASE_URL || "/";
        const sources = [
          `${base}sounds/notify.wav`,
          `${base}sounds/notify.mp3`,
          `${base}sounds/notification.mp3`,
        ];
        soundRef.current = new Howl({
          src: sources,
          format: ["mp3", "wav"],
          html5: true,
          preload: true,
          volume: 0.6,
          onloaderror: (id, err) =>
            console.warn("Sound load error:", err),
        });
      } catch (err) {
        console.warn("Failed to init sound:", err);
        soundRef.current = null;
      }

      ws.onopen = () => {
        console.log("✅ WebSocket connected");
        setConnectionStatus("connected");
        isConnectingRef.current = false;
        window.__wsReconnectAttempts = 0;

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }

        // Ping every 30s to keep alive
        if (keepAliveRef.current) clearInterval(keepAliveRef.current);
        keepAliveRef.current = setInterval(() => {
          try {
            if (wsRef.current?.readyState === WebSocket.OPEN)
              wsRef.current.send("ping");
          } catch {}
        }, 30000);
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          playNotificationSound();

          setUnreadCount((prev) => {
            const next = prev + 1;
            try {
              if ("setAppBadge" in navigator)
                navigator.setAppBadge?.(next);
            } catch {}
            return next;
          });

          const title = data?.title || "Notification";
          const description = data?.message || "";
          toast(title, { description });

          try {
            await showLocalNotification({
              id: String(Date.now()),
              timestamp: new Date().toISOString(),
              sourceSheet: "WS",
              title,
              message: description,
              roleTarget: "all",
              read: false,
              userEmail: "",
            } as any);
          } catch {}

          await saveOffline({ ...data, timestamp: Date.now(), read: false });
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

        // Limit reconnection attempts to prevent infinite loops
        const attempt = (window.__wsReconnectAttempts || 0) + 1;
        const maxAttempts = 5;
        
        if (attempt > maxAttempts) {
          console.warn("[WebSocket] Max reconnection attempts reached, stopping reconnect");
          return;
        }
        
        // Exponential backoff reconnect
        const delay = Math.min(1000 * 2 ** attempt, 30000);
        window.__wsReconnectAttempts = attempt;

        if (mounted && !reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            if (mounted) connectWebSocket();
          }, delay);
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        isConnectingRef.current = false;
        setConnectionStatus("disconnected");
      };
    };

    const playNotificationSound = () => {
      try {
        if (soundRef.current) {
          soundRef.current.play();
          return;
        }
        // Fallback beep
        const Ctx =
          (window as any).AudioContext ||
          (window as any).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.start();
          g.gain.setValueAtTime(0.2, ctx.currentTime);
          o.stop(ctx.currentTime + 0.2);
        }
      } catch {}
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
      setUnreadCount(0);
      if ("clearAppBadge" in navigator) navigator.clearAppBadge?.();

      const db = await openDB("notifications-db", 1);
      const tx = db.transaction("notifications", "readwrite");
      const store = tx.objectStore("notifications");
      const all = await store.getAll();
      for (const n of all) {
        n.read = true;
        await store.put(n);
      }
    } catch (err) {
      console.warn("Failed to mark notifications read:", err);
    }
  };

  return { unreadCount, markAllAsRead, connectionStatus };
}

// --- IndexedDB persistence ---
async function saveOffline(notif: any) {
  try {
    const db = await openDB("notifications-db", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("notifications"))
          db.createObjectStore("notifications", { keyPath: "id" });
      },
    });
    const tx = db.transaction("notifications", "readwrite");
    await tx.store.put(notif);
    await tx.done;
  } catch (err) {
    console.warn("Failed to save notification:", err);
  }
}
