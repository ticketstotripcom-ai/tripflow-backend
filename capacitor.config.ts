import type { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'com.ticketstotrip.crm',
  appName: 'TTT CRM',
  webDir: 'dist',
  plugins: {
    CallLog: {
      permissions: ['READ_CALL_LOG']
    }
  }
};

export default config;
