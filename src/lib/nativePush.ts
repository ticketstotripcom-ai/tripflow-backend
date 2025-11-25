import { Capacitor } from '@capacitor/core';
import { PushNotifications, PushNotificationSchema, PushNotificationActionPerformed } from '@capacitor/push-notifications';
import axios from 'axios'; // ✅ NEW import for making HTTP requests
import { secureStorage } from './secureStorage'; // ✅ NEW import for secrets
import { triggerNativeNotification, clearAllNotifications } from './nativeNotifications'; // ✅ NEW import for centralized notification handling

let currentFcmToken: string | null = null;
const BACKEND_URL = 'https://tripflow-backend-6xzr.onrender.com'; // Adjust to your backend URL

async function sendTokenToBackend(token: string, action: 'register' | 'unregister') {
  try {
    const credentials = await secureStorage.getCredentials();
    const secret = credentials?.notifySecret || process.env.NOTIFY_SECRET; // Use saved secret or env var

    if (!secret) {
      console.warn('[nativePush] NOTIFY_SECRET not found. Cannot register FCM token with backend.');
      return;
    }

    await axios.post(`${BACKEND_URL}/api/fcm-token`, { token, action }, {
      headers: {
        'Content-Type': 'application/json',
        'x-tripflow-secret': secret,
      },
    });
    console.log(`[nativePush] FCM Token ${action}ed with backend successfully.`);
  } catch (error) {
    console.error(`[nativePush] Failed to ${action} FCM token with backend:`, error);
  }
}

export async function initPush() {
  if (!Capacitor.isNativePlatform()) {
    console.log('Not a native platform, skipping push initialization.');
    return;
  }

  try {
    if (!Capacitor.isPluginAvailable('PushNotifications')) {
      console.warn('[nativePush] PushNotifications plugin not available');
      return;
    }
    const creds = await secureStorage.getCredentials();
    if (!creds || !creds.notifySecret) {
      console.warn('[nativePush] Missing notifySecret; skipping push registration');
      return;
    }
    // 1. Request permissions
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      console.warn('[nativePush] Push permission not granted');
      return;
    }

    // 2. Register for push notifications
    await PushNotifications.register();

    // 3. Add listeners
    PushNotifications.removeAllListeners(); // Clear old listeners to prevent duplicates

    PushNotifications.addListener('registration', async (token) => {
      console.log('[nativePush] Registration token:', token.value);
      currentFcmToken = token.value; // Store token globally
      await sendTokenToBackend(token.value, 'register');
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[nativePush] Registration error:', err);
    });

    PushNotifications.addListener('pushNotificationReceived', async (notification: PushNotificationSchema) => {
      console.log('[nativePush] Push received:', notification.title, notification.body);
      // ✅ Use our centralized native notification trigger for consistency
      await triggerNativeNotification({
        id: notification.id || String(Date.now()),
        title: notification.title || 'Push Notification',
        message: notification.body || '',
        type: (notification.data?.type as any) || 'general',
        createdAt: new Date().toISOString(),
        targetTripId: notification.data?.targetTripId, // Pass through relevant data
        // ... any other relevant data from notification.data
      });
    });

    PushNotifications.addListener('pushNotificationActionPerformed', async (action: PushNotificationActionPerformed) => {
      console.log('[nativePush] Push action performed:', action.actionId, 'Notification:', action.notification);
      // Handle tap on notification - open relevant page if 'route' is present
      // The `triggerNativeNotification` already handles badges, so clear all on tap
      await clearAllNotifications(); 
      if (action.notification.data?.route) {
        // You might want to use react-router-dom's navigate here,
        // but it's hard to get outside a component.
        // For simplicity, directly change window.location.hash for now.
        // In a real app, this would be handled by your routing context.
        window.location.hash = action.notification.data.route;
      }
    });

    console.log('[nativePush] Push notification listeners added.');

  } catch (e) {
    console.warn('[nativePush] initPush failed:', (e as any)?.message || e);
  }
}

export async function unregisterPush() {
  if (!Capacitor.isNativePlatform()) {
    console.log('Not a native platform, skipping push unregistration.');
    return;
  }
  try {
    if (currentFcmToken) {
      await sendTokenToBackend(currentFcmToken, 'unregister');
      currentFcmToken = null;
    }
    await PushNotifications.unregister();
    PushNotifications.removeAllListeners(); // Clean up listeners
    console.log('[nativePush] Push notifications unregistered.');
  } catch (error) {
    console.error('[nativePush] Failed to unregister push notifications:', error);
  }
}


