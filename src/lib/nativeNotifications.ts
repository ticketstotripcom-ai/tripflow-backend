import { Capacitor } from '@capacitor/core';
import { LocalNotifications, Channel, ActionType, Action } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import { notificationSettingsService } from './notificationSettings';
import type { AppNotification } from '@/utils/notifications';
import { playSound, vibrate } from '@/utils/notifyHelpers';

let permissionsGranted = false;
let actionsRegistered = false;

// ✅ Define Action Types
const REMINDER_ACTION_TYPE_ID = 'REMINDER_ACTIONS';

// ✅ Register all action types
export async function registerNotificationActions() {
  if (Capacitor.getPlatform() === 'web' || actionsRegistered) {
    return;
  }
  try {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: REMINDER_ACTION_TYPE_ID,
          actions: [
            { id: 'snooze', title: 'Snooze 1hr' },
            { id: 'done', title: 'Mark as Done', destructive: true },
          ],
        },
      ],
    });
    actionsRegistered = true;
  } catch (error) {
    console.error('[NativeNotifications] Action Type registration failed:', error);
  }
}

// ✅ Add listener for when an action is performed (guarded to avoid crashes)
if (Capacitor.getPlatform() !== 'web') {
  try {
    LocalNotifications.addListener('localNotificationActionPerformed', async (payload) => {
      const { actionId, notification } = payload;
      const originalNotification = notification?.extra as AppNotification;

      if (actionId === 'snooze' && originalNotification) {
        const snoozedNotification: AppNotification = {
          ...originalNotification,
          id: `${originalNotification.id}-snoozed-${Date.now()}`,
          scheduleAt: new Date(Date.now() + 60 * 60 * 1000),
        };
        await triggerNativeNotification(snoozedNotification);
      } else if (actionId === 'done') {
        console.log(`[NativeNotifications] 'Mark as Done' clicked for notification:`, originalNotification);
      }

      if (notification?.id) {
        try { await LocalNotifications.cancel({ notifications: [{ id: notification.id }] }); } catch {}
      }
    });
  } catch {}
}


// Create a notification channel for Android
async function ensureNotificationChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') {
    return;
  }
  try {
    const channel: Channel = {
      id: 'tripflow_high_importance',
      name: 'Tripflow High Priority',
      description: 'Primary notifications for Tripflow CRM',
      importance: 5, // Max importance for heads-up display
      visibility: 1, // Public visibility
      sound: 'notify.wav',
      lights: true,
      vibration: true,
    };
    await LocalNotifications.createChannel(channel);
  } catch (error) {
    console.warn('[NativeNotifications] Channel creation failed:', error);
  }
}

// Request all necessary permissions
async function requestAllPermissions(): Promise<void> {
  if (permissionsGranted) return;

  const platform = Capacitor.getPlatform();
  if (platform === 'web') {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    permissionsGranted = Notification.permission === 'granted';
    return;
  }

  try {
    const localStatus = await LocalNotifications.requestPermissions();
    if (localStatus.display === 'granted') {
      permissionsGranted = true;
      await ensureNotificationChannel();
    }
  } catch (error)
 {
    console.warn('[NativeNotifications] Permission request failed:', error);
  }
}

/**
 * Gets the current badge count.
 * @returns The current badge count, or 0 on failure.
 */
async function getBadgeCount(): Promise<number> {
  if (Capacitor.getPlatform() === 'web') return 0;
  try {
    return (await App.getBadge()).count;
  } catch {
    return 0;
  }
}

/**
 * Sets the app icon badge count.
 * @param count The number to set the badge to.
 */
async function setBadgeCount(count: number): Promise<void> {
  if (Capacitor.getPlatform() === 'web') return;
  try {
    await App.setBadge({ count });
  } catch (error) {
    console.warn('[NativeNotifications] Set badge failed:', error);
  }
}

/**
 * The primary, centralized function to trigger a native local notification.
 * It checks user settings, plays sound, and manages the app icon badge.
 *
 * @param notification The notification payload.
 */
export async function triggerNativeNotification(notification: AppNotification): Promise<void> {
  // 1. Check if this notification type is enabled by the user
  const isEnabled = await notificationSettingsService.isEnabled(notification.type as any);
  if (!isEnabled) {
    console.log(`[NativeNotifications] Notification type "${notification.type}" is disabled by user. Skipping.`);
    return;
  }

  // ✅ 2. Check if the associated lead is snoozed
  if (notification.targetTripId) {
    const snoozed = await notificationSettingsService.isLeadSnoozed(notification.targetTripId);
    if (snoozed) {
      console.log(`[NativeNotifications] Lead "${notification.targetTripId}" is snoozed. Skipping notification.`);
      return;
    }
  }

  // 3. Ensure we have permissions
  await requestAllPermissions();
  if (!permissionsGranted) {
    console.warn('[NativeNotifications] No permission to display notifications.');
    return;
  }

  // 3. Increment and update the badge count
  const currentBadge = await getBadgeCount();
  const newBadgeCount = currentBadge + 1;
  await setBadgeCount(newBadgeCount);

  // 4. Show/schedule the notification
  try {
    if (!Capacitor.isPluginAvailable('LocalNotifications')) {
      return;
    }
    const parsed = Number.parseInt(String(notification.id || '').slice(-8), 16);
    const notifId = Number.isFinite(parsed) ? parsed : Math.floor(Date.now() % 2147483647);
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notifId,
          title: notification.title,
          body: notification.message,
          channelId: 'tripflow_high_importance',
          // Do not set large/small icons here; Android expects native resources
          actionTypeId: notification.type === 'follow_up' ? REMINDER_ACTION_TYPE_ID : '',
          group: notification.type,
          groupSummary: true,
          badge: newBadgeCount,
          extra: { ...notification },
          schedule: { at: notification.scheduleAt && notification.scheduleAt > new Date() ? notification.scheduleAt : new Date(Date.now() + 100) },
        },
      ],
    });
    console.log('[NativeNotifications] Notification scheduled:', notification.title);
  } catch (error) {
    console.error('[NativeNotifications] Scheduling failed:', error);
  }
}

/**
 * Clears the app badge and all displayed notifications.
 * Should be called when the app is opened or notifications are viewed.
 */
export async function clearAllNotifications(): Promise<void> {
  await setBadgeCount(0);
  if (Capacitor.getPlatform() !== 'web') {
    try {
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel(pending);
      }
    } catch (error) {
      console.error('[NativeNotifications] Clearing notifications failed:', error);
    }
  }
}
