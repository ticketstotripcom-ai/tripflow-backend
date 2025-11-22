import type { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'com.tripflow.app',
  appName: 'TTT CRM',
  webDir: 'dist',
  bundledWebRuntime: false,
  backgroundColor: '#ffffff',
  server: {
    cleartext: true,
    androidScheme: 'https',
    allowNavigation: ['*'],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#ffffff',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: false,
      splashImmersive: false,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_notification',
      iconColor: '#000000',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#ffffff',
    },
  },
  android: {
    buildOptions: {
      keystorePath: 'keystore.jks',
      keystorePassword: 'password',
      keystoreAlias: 'key0',
      keystoreAliasPassword: 'password',
    },
  },
};

export default config;