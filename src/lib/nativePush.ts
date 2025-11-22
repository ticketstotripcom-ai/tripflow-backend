import { Capacitor } from '@capacitor/core';

export async function initPush() {
  if (!Capacitor.isNativePlatform()) {
    console.log('Not a native platform, skipping push initialization.');
    return;
  }

  try {
    const mod: any = await import('@capacitor/push-notifications');
    const PushNotifications = mod.PushNotifications || mod;

    // Check/request permissions
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') {
      try { perm = await PushNotifications.requestPermissions(); } catch {}
    }
    if (perm.receive !== 'granted') {
      console.warn('[nativePush] Push permission not granted');
      return;
    }

    // Register for push
    await PushNotifications.register();

    // Basic listeners (safe; no-ops if already set)
    try {
      PushNotifications.addListener?.('registration', (token: any) => {
        console.log('[nativePush] Registration token:', token?.value || token);
      });
      PushNotifications.addListener?.('registrationError', (err: any) => {
        console.warn('[nativePush] Registration error:', err);
      });
      PushNotifications.addListener?.('pushNotificationReceived', (n: any) => {
        console.log('[nativePush] Push received:', n?.title, n?.body);
      });
    } catch {}
  } catch (e) {
    console.warn('[nativePush] initPush failed:', (e as any)?.message || e);
  }
}

