import { Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Index from './pages/Index';
import Auth from './pages/Auth';
import Settings from './pages/Settings';
import Notifications from './pages/Notifications';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';
import { authService } from './lib/authService';
import { useOfflineSync } from './hooks/useOfflineSync';
import { useNotifications } from './hooks/useNotifications';
import { Toaster } from './components/ui/toaster';
import { Toaster as SonnerToaster } from './components/ui/sonner';
import BottomNavigation from './components/BottomNavigation';
import OfflineIndicator from './components/OfflineIndicator';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { App } from '@capacitor/app';

function AppContent() {
  const [session, setSession] = useState(authService.getSession());
  const { isOnline } = useNetworkStatus();
  
  // Initialize offline sync and notifications - use the returned values
  const offlineSync = useOfflineSync();
  const notifications = useNotifications();

  useEffect(() => {
    const bootstrap = async () => {
      try {
        // Initialize auth on app start - remove forced validation that causes logout
        await authService.initialize();
        const currentSession = authService.getSession();
        setSession(currentSession);
        
        // Only validate session if we have one, but don't force logout on startup
        // This prevents auto-logout when app is closed and reopened
        if (currentSession) {
          console.log('Session found on app start - user stays logged in');
          // Touch session to extend its lifetime but don't validate aggressively
          await authService.touchSession();
        }
      } catch (error) {
        console.error('Bootstrap error:', error);
      }
    };

    bootstrap();

    // Subscribe to auth changes
    const unsubscribe = authService.onAuthStateChange((newSession) => {
      setSession(newSession);
    });

    // Handle app lifecycle events to maintain session
    const setupAppLifecycle = async () => {
      try {
        const { App } = await import('@capacitor/app');
        
        // When app comes to foreground, extend session but don't force logout
        App.addListener('appStateChange', async ({ isActive }) => {
          if (isActive && authService.getSession()) {
            console.log('App became active - extending session');
            // Only touch session to extend lifetime, don't validate aggressively
            await authService.touchSession();
          }
        });

        // Handle app resume event (for older devices) - extend session only
        App.addListener('resume', async () => {
          console.log('App resumed - extending session');
          if (authService.getSession()) {
            await authService.touchSession();
          }
        });
      } catch (error) {
        console.log('Capacitor App plugin not available, using fallback');
        // Fallback for web: use visibility change - extend session only
        const handleVisibilityChange = async () => {
          if (!document.hidden && authService.getSession()) {
            console.log('Page became visible - extending session');
            await authService.touchSession();
          }
        };
        
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Cleanup function
        return () => {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
      }
    };

    const cleanup = setupAppLifecycle();

    return () => {
      unsubscribe();
      if (cleanup && typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, []);

  return (
    <div className="pb-[calc(var(--bottom-nav-height)+3rem)]">
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/" element={<Index />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      
      {/* Global components */}
      <Toaster />
      <SonnerToaster />
      {session && <BottomNavigation />}
      {!isOnline && <OfflineIndicator />}
    </div>
  );
}

export default AppContent;


