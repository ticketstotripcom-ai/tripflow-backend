import type { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'app.lovable.cc4f285206234291a318a8776b11a069',
  appName: 'TTT CRM',
  webDir: 'dist',
  server: {
    url: 'https://cc4f2852-0623-4291-a318-a8776b11a069.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    CallLog: {
      permissions: ['READ_CALL_LOG']
    }
  }
};

export default config;
