// Push notifications and reminders
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export interface Reminder {
  id: string;
  leadId: string;
  title: string;
  message: string;
  dateTime: Date;
}

class NotificationService {
  private pushRegistered = false;
  private listenersAttached = false;
  private localPermissionsRequested = false;

  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
      await this.ensureLocalNotificationPermissions();
    } catch (error) {
      console.error('Failed to initialise local notifications:', error);
    }
  }

  private attachPushListeners() {
    if (this.listenersAttached) return;

    PushNotifications.addListener('registration', (token) => {
      console.log('Push registration success, token:', token.value);
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('Error on registration:', JSON.stringify(error));
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push notification received:', notification);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('Push notification action performed:', notification);
    });

    this.listenersAttached = true;
  }

  private async ensureLocalNotificationPermissions(): Promise<void> {
    if (this.localPermissionsRequested) return;
    if (!Capacitor.isPluginAvailable('LocalNotifications')) return;

    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }
      this.localPermissionsRequested = true;
    } catch (error) {
      console.warn('Local notifications permission request failed:', error);
    }
  }

  async enableNotifications(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    if (!Capacitor.isPluginAvailable('PushNotifications')) {
      console.info('PushNotifications plugin is not available on this platform');
      return;
    }

    try {
      let permStatus = await PushNotifications.checkPermissions();

      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        console.warn('Push notification permission not granted');
        return;
      }

      this.attachPushListeners();

      if (!this.pushRegistered) {
        await PushNotifications.register();
        this.pushRegistered = true;
      }

      await this.ensureLocalNotificationPermissions();
    } catch (error) {
      console.error('Failed to enable push notifications:', error);
    }
  }

  async enableCallLog(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    const callLogPlugin = (Capacitor as unknown as { Plugins?: Record<string, any> }).Plugins?.CallLog;
    if (!callLogPlugin) {
      console.info('CallLog plugin not available; skipping call log permission request');
      return;
    }

    try {
      const status = (await callLogPlugin.checkPermissions?.()) ?? {};
      if (status?.granted) return;

      await callLogPlugin.requestPermissions?.();
    } catch (error) {
      console.warn('Failed to request call log permissions:', error);
    }
  }

  async scheduleReminder(reminder: Reminder): Promise<void> {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: parseInt(reminder.id.replace(/\D/g, '').substring(0, 9)) || Math.floor(Math.random() * 1000000),
            title: reminder.title,
            body: reminder.message,
            schedule: { at: reminder.dateTime },
            sound: undefined,
            attachments: undefined,
            actionTypeId: '',
            extra: { leadId: reminder.leadId }
          }
        ]
      });
    } catch (error) {
      console.error('Failed to schedule reminder:', error);
    }
  }

  async sendLocalNotification(title: string, body: string, extra?: any): Promise<void> {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 1000000),
            title,
            body,
            schedule: { at: new Date(Date.now() + 1000) },
            sound: undefined,
            attachments: undefined,
            actionTypeId: '',
            extra
          }
        ]
      });
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }

  async cancelReminder(id: string): Promise<void> {
    try {
      const notificationId = parseInt(id.replace(/\D/g, '').substring(0, 9)) || 0;
      await LocalNotifications.cancel({ notifications: [{ id: notificationId }] });
    } catch (error) {
      console.error('Failed to cancel reminder:', error);
    }
  }
}

export const notificationService = new NotificationService();
