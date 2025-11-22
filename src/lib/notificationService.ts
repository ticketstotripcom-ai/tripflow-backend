import { Capacitor } from '@capacitor/core';
import { LocalNotifications, LocalNotificationSchema } from '@capacitor/local-notifications';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { log, error } from '@/utils/logger'; // Assuming a logger utility

class NotificationService {
  private static instance: NotificationService;
  private initialized = false;
  private pushToken: string | null = null;

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized || !Capacitor.isNativePlatform()) {
      return;
    }

    log('[NotificationService] Initializing notification service...');
    try {
      // Set up listeners first
      await this.attachListeners();
      
      // Check permissions and register for push notifications
      try {
        const permissionStatus = await PushNotifications.checkPermissions();
        log('[NotificationService] Push permission status:', permissionStatus.receive);
        
        if (permissionStatus.receive === 'granted') {
          await this.registerForPush();
        }
      } catch (pushError: any) {
        // Handle missing Firebase configuration gracefully
        if (pushError.message?.includes('firebase') || pushError.message?.includes('google-services') || 
            pushError.message?.includes('Firebase') || pushError.message?.includes('Google')) {
          log('[NotificationService] Firebase configuration missing, continuing without push notifications');
        } else {
          log('[NotificationService] Push notification setup failed:', pushError);
        }
      }
      
      // Create notification channel for Android
      if (Capacitor.getPlatform() === 'android') {
        await this.createNotificationChannel();
      }
      
      this.initialized = true;
      log('[NotificationService] Notification service initialized successfully.');
    } catch (error) {
      log('[NotificationService] Failed to initialize notification service:', error);
      // Don't throw the error - continue without notifications
      this.initialized = true;
      log('[NotificationService] Continuing without notification service due to initialization error');
    }
  }

  // Safe initialization that can be called from App.tsx
  public async safeInitialize(): Promise<void> {
    try {
      log('[NotificationService] Starting safe initialization...');
      await this.initialize();
      log('[NotificationService] Safe initialization completed successfully');
    } catch (error) {
      log('[NotificationService] Safe initialization failed, continuing without notifications:', error);
      this.initialized = true; // Mark as initialized to prevent retry loops
      log('[NotificationService] Service marked as initialized despite errors');
    }
  }

  private async requestPermissions(): Promise<void> {
    log('[NotificationService] Requesting permissions...');
    
    // Request Push Notification permissions
    let pushStatus = await PushNotifications.checkPermissions();
    if (pushStatus.receive === 'prompt') {
      pushStatus = await PushNotifications.requestPermissions();
    }
    if (pushStatus.receive !== 'granted') {
      throw new Error('Push notification permission was denied.');
    }
    log('[NotificationService] Push permissions granted.');

    // Request Local Notification permissions
    let localStatus = await LocalNotifications.checkPermissions();
    if (localStatus.display === 'prompt') {
      localStatus = await LocalNotifications.requestPermissions();
    }
    if (localStatus.display !== 'granted') {
      throw new Error('Local notification permission was denied.');
    }
    log('[NotificationService] Local permissions granted.');
  }

  private async attachListeners(): Promise<void> {
    log('[NotificationService] Attaching listeners...');
    await PushNotifications.removeAllListeners();
    await LocalNotifications.removeAllListeners();

    PushNotifications.addListener('registration', (token: Token) => {
      log('[NotificationService] Push registration success:', token.value);
      this.pushToken = token.value;
    });

    PushNotifications.addListener('registrationError', (err: any) => {
      error('[NotificationService] Push registration error:', err);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      log('[NotificationService] Push notification received:', notification);
      this.showLocalNotification(
        notification.title || 'New Message',
        notification.body || '',
        notification.data?.route
      );
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      log('[NotificationService] Push action performed:', action);
      const route = action.notification.data?.route;
      if (route) {
        // Here you would navigate to the specific route, e.g., using a router instance
        log(`[NotificationService] Navigating to route: ${route}`);
      }
    });

    log('[NotificationService] Listeners attached successfully');
  }

  private async registerForPush(): Promise<void> {
    if (this.pushToken) {
      log('[NotificationService] Already registered for push notifications.');
      return;
    }
    
    // Check if Firebase is configured before attempting to register
    try {
      log('[NotificationService] Checking Firebase configuration...');
      await PushNotifications.checkPermissions();
      log('[NotificationService] Registering for push notifications...');
      await PushNotifications.register();
    } catch (firebaseError: any) {
      if (firebaseError.message?.includes('firebase') || firebaseError.message?.includes('google-services') ||
          firebaseError.message?.includes('Firebase') || firebaseError.message?.includes('Google')) {
        log('[NotificationService] Firebase not configured, skipping push registration');
        return;
      }
      throw firebaseError;
    }
  }

  public async showLocalNotification(title: string, body: string, route?: string): Promise<void> {
    try {
      // Ensure service is initialized before showing notifications
      if (!this.initialized) {
        log('[NotificationService] Service not initialized, attempting to initialize...');
        await this.initialize();
      }
      
      log('[NotificationService] Scheduling local notification:', { title, body, route });
      
      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: Date.now(),
            extra: { route },
            channelId: 'default', // Ensure you have a channel set up on Android
          },
        ],
      });
      
      log('[NotificationService] Local notification scheduled successfully');
    } catch (e) {
      error('[NotificationService] Failed to show local notification', e);
      // Don't throw - just log the error
      log('[NotificationService] Continuing without showing notification due to error');
    }
  }
  
  public async createNotificationChannel(): Promise<void> {
    if (Capacitor.getPlatform() === 'android') {
      try {
        log('[NotificationService] Creating notification channel for Android...');
        await LocalNotifications.createChannel({
          id: 'default',
          name: 'Default',
          description: 'Default channel for notifications',
          importance: 4, // High importance
          visibility: 1, // Public
        });
        log('[NotificationService] Notification channel created.');
      } catch(e) {
        error('[NotificationService] Could not create notification channel', e);
      }
    }
  }
}

export const notificationService = NotificationService.getInstance();
