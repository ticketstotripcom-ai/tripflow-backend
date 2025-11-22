import { Capacitor } from "@capacitor/core";
import { Notification as NotifyType } from "@/services/notificationService";

let permissionRequested = false;

async function ensurePermission() {
  if (permissionRequested) return;
  permissionRequested = true;
  if (Capacitor.getPlatform() === "web") {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {}
    }
    return;
  }
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.requestPermissions();
    await ensureNotificationChannel();
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.requestPermissions();
  } catch (err) {
    console.warn("[nativeNotifications] Permission request failed", err);
  }
}

async function ensureNotificationChannel() {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.createChannel({
      id: "tripflow_high",
      name: "Tripflow High Priority",
      description: "Heads-up and status bar notifications",
      importance: 5,
      visibility: 1,
      sound: "notify.wav",
      lights: true,
      vibration: true,
    } as any);
  } catch (err) {
    console.warn("[nativeNotifications] Channel creation failed", err);
  }
}

export async function playNotificationSound(notification?: NotifyType) {
  try {
    const audio = new Audio("/sounds/notify.wav");
    audio.volume = 0.9;
    audio.preload = "auto";
    audio.currentTime = 0;
    await audio.play();
  } catch (err) {
    try {
      const fallback = new Audio("/sounds/notify.mp3");
      fallback.volume = 0.9;
      fallback.preload = "auto";
      await fallback.play();
    } catch (e) {
      console.warn("[nativeNotifications] Failed to play sound", e);
    }
  }
}

export async function showLocalNotification(notification: NotifyType) {
  await ensurePermission();
  const platform = Capacitor.getPlatform();
  if (platform === "web") {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification(notification.title, {
          body: notification.message,
          icon: "/icons/app-icon-96.png",
          badge: "/icons/notification-badge.jpg",
        });
      } catch {}
    }
    return;
  }

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Number(new Date().getTime() % 2147483647),
          title: notification.title,
          body: notification.message,
          sound: "notify.wav",
          channelId: "tripflow_high",
          smallIcon: "ic_stat_icon",
          actionTypeId: "default",
          visibility: 1,
          schedule: { at: new Date(Date.now() + 100) },
        },
      ],
    });
  } catch (err) {
    console.warn("[nativeNotifications] Local notification failed", err);
  }
}

/**
 * Schedule a local notification at a specific Date.
 * Used by ReminderDialog; safe no-op fallback on web without Notification permission.
 */
export async function scheduleLocalAt(
  when: Date,
  opts: { title: string; message: string }
): Promise<void> {
  await ensurePermission();
  const platform = Capacitor.getPlatform();
  if (platform === "web") {
    const delay = Math.max(0, when.getTime() - Date.now());
    setTimeout(() => {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try { new Notification(opts.title, { body: opts.message }); } catch {}
      }
    }, delay);
    return;
  }

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Number(new Date().getTime() % 2147483647),
          title: opts.title,
          body: opts.message,
          sound: "notification.mp3",
          schedule: { at: when },
          smallIcon: "ic_stat_icon",
          actionTypeId: "default",
        },
      ],
    });
  } catch (err) {
    console.warn("[nativeNotifications] scheduleLocalAt failed", err);
  }
}
