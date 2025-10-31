import type { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'com.tripflow.app',
  appName: 'TripFlow CRM',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    cleartext: true,
  },
  // Uncomment if you want to use CallLog plugin later
  // plugins: {
  //   CallLog: {
  //     permissions: ['READ_CALL_LOG'],
  //   },
  // },
};

export default config;
