export interface NotificationSettings {
  new_trip: boolean;
  trip_assigned: boolean;
  trip_booked: boolean;
  blackboard_post: boolean;
  follow_up: boolean;
  snoozedLeads: Record<string, number>; // leadId -> expiration timestamp (ms)
  [key: string]: boolean | Record<string, number>; // For other dynamic boolean settings
}

const NOTIFICATION_SETTINGS_KEY = 'tripflow_notification_settings';

const defaultSettings: NotificationSettings = {
  new_trip: true,
  trip_assigned: true,
  trip_booked: true,
  blackboard_post: true,
  follow_up: true,
  snoozedLeads: {},
};

export const notificationSettingsService = {
  async getSettings(): Promise<NotificationSettings> {
    try {
      const storedSettings = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      if (storedSettings) {
        const parsed = JSON.parse(storedSettings);
        // Ensure all default keys are present and clean up expired snoozes
        const currentSettings: NotificationSettings = { ...defaultSettings, ...parsed };
        const now = Date.now();
        for (const leadId in currentSettings.snoozedLeads) {
          if (currentSettings.snoozedLeads[leadId] <= now) {
            delete currentSettings.snoozedLeads[leadId];
          }
        }
        return currentSettings;
      }
    } catch (error) {
      console.error('Error getting notification settings:', error);
    }
    return defaultSettings;
  },

  async saveSettings(settings: NotificationSettings): Promise<void> {
    try {
      localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving notification settings:', error);
    }
  },

  async isEnabled(type: keyof NotificationSettings): Promise<boolean> {
    const settings = await this.getSettings();
    // Special handling for snoozedLeads, not a simple boolean toggle
    if (type === 'snoozedLeads') return true; 
    return (settings[type] as boolean) !== false; // Default to true if not set
  },

  async snoozeLead(leadId: string, durationMs: number): Promise<void> {
    const settings = await this.getSettings();
    const expirationTime = Date.now() + durationMs;
    settings.snoozedLeads[leadId] = expirationTime;
    await this.saveSettings(settings);
  },

  async unsnoozeLead(leadId: string): Promise<void> {
    const settings = await this.getSettings();
    delete settings.snoozedLeads[leadId];
    await this.saveSettings(settings);
  },

  async isLeadSnoozed(leadId: string): Promise<boolean> {
    const settings = await this.getSettings();
    const expirationTime = settings.snoozedLeads[leadId];
    return !!expirationTime && expirationTime > Date.now();
  }
};
