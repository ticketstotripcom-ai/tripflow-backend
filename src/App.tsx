import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import BottomNavigation from "@/components/BottomNavigation";
import ScrollToTopButton from "@/components/ScrollToTopButton";
import AnimatedBackground from "@/components/AnimatedBackground";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { authService } from "@/lib/authService";
import { themeService } from "@/lib/themeService";
import { setupOfflineSync } from "@/lib/offlineQueue";
import { lazy, Suspense } from 'react';
const Index = lazy(() => import('./pages/Index'));
const Auth = lazy(() => import('./pages/Auth'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));
const NotificationsPage = lazy(() => import('./pages/Notifications'));
const NotFound = lazy(() => import('./pages/NotFound'));
const ActionCenterPage = lazy(() => import('./pages/ActionCenter'));
import { stateManager } from "@/lib/stateManager";
import { setLastRoute, getLastRoute } from "@/lib/routePersistence";
import { useSheetService } from "@/hooks/useSheetService";
import { notifyAdmin, notifyAll, notifyUser } from "@/utils/notifyTriggers";
import { parseFlexibleDate } from "@/lib/dateUtils";
import { SettingsProvider } from "@/lib/SettingsContext";
import { ensureAppStorageStructure } from "@/lib/deviceStorage";
import ErrorBoundary from "@/components/ErrorBoundary";
import { persistState, restoreState } from "@/lib/storage";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import LeadDetailsDialog from "@/components/dashboard/LeadDetailsDialog";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationProvider } from "@/context/NotificationContext";

// ✅ NEW imports for offline-first sync
import { useCRMData } from "@/hooks/useCRMData";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { OfflineIndicator } from "@/components/OfflineIndicator";

import { registerNotificationActions } from "@/lib/nativeNotifications";

// ✅ NEW import for WebSocket notifications
import { useWebSocketNotifications } from "@/hooks/useWebSocketNotifications";


const queryClient = new QueryClient();

declare global {
  interface Window {
    sendTestNotification: (message?: string) => void;
  }
}

function App() {
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [lastNotifiedIds, setLastNotifiedIds] = useState<Set<string>>(new Set());

  // Expose a test function for notifications
  window.sendTestNotification = (message?: string) => {
    const ws = (window as any).__ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        title: "Test Notification",
        message: message || "This is a test notification from the client.",
      }));
      console.log("Sent test notification.");
    } else {
      console.warn("WebSocket not connected.");
    }
  };


  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('[App] Starting initialization...');
        
        // Hide splash screen immediately and show our custom loading
        try { 
          await SplashScreen.hide(); 
          console.log('[App] Splash screen hidden');
        } catch (error) {
          console.warn('[App] Failed to hide splash screen:', error);
        }
        
        // Initialize services with error handling
        await Promise.all([
          ensureAppStorageStructure(),
          themeService.initialize(),
          setupOfflineSync(),
          registerNotificationActions(), // ✅ Register notification actions
        ]);
        console.log('[App] Core services initialized');
        
        // Test localStorage availability
        try {
          const testKey = '__storage_test__';
          localStorage.setItem(testKey, 'ok');
          localStorage.removeItem(testKey);
          console.log('[App] localStorage is available');
        } catch (e) {
          console.warn('[App] localStorage not available:', e);
        }
        
        // Initialize LOCAL notifications only (no push) on native at boot
        // Do NOT initialize push or request any notification permissions on boot.
        // Push registration is user-initiated from Settings only.
        
        // Safely initialize notification service
        try {
          const { notificationService } = await import('@/lib/notificationService');
          await notificationService.safeInitialize();
          console.log('[App] Notification service initialized safely');
        } catch (notificationError) {
          console.warn('[App] Notification service initialization failed, continuing without notifications:', notificationError);
        }
        
        setIsReady(true);
        console.log('[App] Initialization complete');
      } catch (error) {
        console.error("App initialization error:", error);
        setInitError(error instanceof Error ? error.message : "Failed to initialize app");
        setIsReady(true); // Continue even if initialization fails
      }
    };

    initializeApp();
  }, []);

  useEffect(() => {
    try {
      const platform = Capacitor.getPlatform();
      if (platform === 'web') return;
      const CallTracker = registerPlugin<any>('CallTracker');
      (async () => {
        try {
          await CallTracker.requestPermissions();
          await CallTracker.startService();
          await CallTracker.addListener('callEvent', async (ev: any) => {
            try {
              if (!ev || !ev.number) return;
              const credentials = await secureStorage.getCredentials();
              if (!credentials) return;
              const sheetsService = new GoogleSheetsService({
                apiKey: credentials.googleApiKey,
                serviceAccountJson: credentials.googleServiceAccountJson,
                sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
                worksheetNames: credentials.worksheetNames,
                columnMappings: credentials.columnMappings
              });
              const leads = await sheetsService.fetchLeads();
              const matched = leads.find(l => String(l.phone || '').replace(/\D+/g,'') === String(ev.number || '').replace(/\D+/g,''));
              const startIso = ev.startTimestamp ? new Date(ev.startTimestamp).toISOString() : '';
              const endIso = ev.endTimestamp ? new Date(ev.endTimestamp).toISOString() : '';
              const line = [`[${new Date().toISOString().replace('T',' ').slice(0,16)}] Call ${ev.event}`,
                `Incoming: ${!!ev.incoming}`,
                `Duration(s): ${ev.durationSeconds || 0}`,
                startIso ? `Start: ${startIso}` : null,
                endIso ? `End: ${endIso}` : null,
                `Number: ${ev.number}`].filter(Boolean).join(' | ');
              if (matched) {
                const updatedRemarks = (matched.remarks || '').toString().trim();
                const newRemarks = updatedRemarks ? `${updatedRemarks}\n${line}` : line;
                const existingNotes = (matched.notes || '').toString().trim();
                const newNotes = existingNotes ? `${existingNotes} | ${line}` : line;
                if (navigator.onLine) {
                  await sheetsService.updateLead({ dateAndTime: matched.dateAndTime, travellerName: matched.travellerName }, { remarks: newRemarks, notes: newNotes });
                } else {
                  const { enqueue } = await import('@/lib/offlineQueue');
                  await enqueue({ type: 'updateLead', config: {
                    apiKey: credentials.googleApiKey,
                    serviceAccountJson: credentials.googleServiceAccountJson,
                    sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
                    worksheetNames: credentials.worksheetNames,
                    columnMappings: credentials.columnMappings
                  }, identity: { dateAndTime: matched.dateAndTime, travellerName: matched.travellerName }, updates: { remarks: newRemarks, notes: newNotes } });
                }
              } else {
                try {
                  const { db } = await import('@/services/db');
                  await (db as any).table('calls')?.add({
                    number: String(ev.number),
                    event: String(ev.event || ''),
                    incoming: !!ev.incoming,
                    startTimestamp: ev.startTimestamp || null,
                    endTimestamp: ev.endTimestamp || null,
                    durationSeconds: Number(ev.durationSeconds || 0),
                    timestamp: Date.now(),
                  });
                } catch {}
              }
            } catch (err) {
              console.warn('[App] Failed to persist call event', err);
            }
          });
        } catch (err) {
          console.warn('[App] CallTracker init failed', err);
        }
      })();
      return () => {
        try { CallTracker?.stopService?.(); } catch {}
      };
    } catch {}
  }, []);

  // Trigger native local notification when new items arrive (APK only)
  const hybrid = useNotifications();
  
  useEffect(() => {
    try {
      const platform = Capacitor.getPlatform();
      if (platform === 'web') return;
      const items: any[] = (hybrid as any).notifications || [];
      if (!items.length) return;
      const currentIds = new Set(items.map((n: any) => String(n.id)));
      let hasNew = false;
      for (const id of currentIds) {
        if (!lastNotifiedIds.has(id)) { hasNew = true; break; }
      }
      if (hasNew) {
        const unread = items.filter((n: any) => !n.read);
        const count = unread.length || items.length;
        (async () => {
          try {
            const { notificationService } = await import('@/lib/notificationService');
            // Ensure service is initialized before showing notifications
            if (!notificationService.initialized) {
              await notificationService.safeInitialize();
            }
            await notificationService.showLocalNotification('New Notification', `${count} new notification${count > 1 ? 's' : ''}`);
          } catch (e) {
            console.warn('[App] showLocalNotification failed:', (e as any)?.message || e);
          }
        })();
        setLastNotifiedIds(currentIds);
      }
    } catch {}
  }, [hybrid.notifications, lastNotifiedIds]);

  if (!isReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <img 
            src="/icons/app-icon-192.png" 
            alt="TTT CRM" 
            className="w-24 h-24 mx-auto mb-4 animate-pulse"
          />
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading TTT CRM...</p>
        </div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center max-w-md p-6">
          <div className="text-destructive mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Initialization Error</h2>
          <p className="text-muted-foreground mb-4">{initError}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <NotificationProvider>
            <TooltipProvider>
              <div className="min-h-screen bg-background relative">
                <AnimatedBackground />
                <HashRouter>
                  <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading...</div>}>
                    <AppContent />
                  </Suspense>
                </HashRouter>
                <Toaster />
                <Sonner />
              </div>
            </TooltipProvider>
          </NotificationProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;

function AppContent() {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);

  // ✅ Initialize auto-refresh
  useAutoRefresh(180000);

  // ✅ Hooks for offline-first sync (moved from App component)
  const { isOnline } = useOfflineSync();
  const { leads, loading: crmLoading, error: crmError } = useCRMData();

  // ✅ Hook for WebSocket notifications (moved from App component)
  const { connectionStatus: webSocketStatus } = useWebSocketNotifications();
  const { connectionStatus } = useWebSocketNotifications();
  const hybrid = useNotifications();
  const [lastNotifiedIds, setLastNotifiedIds] = useState<Set<string>>(new Set());

  const { users, loading: sheetLoading } = useSheetService();

  // Handle authentication state changes (persisted session)
  useEffect(() => {
    let isMounted = true;
    const checkAuth = async () => {
      try {
        const auth = await authService.checkAuth();
        if (!isMounted) return;
        setIsAuthenticated(auth);
        if (auth) await authService.touchSession();
      } catch (error) {
        console.error("Error checking authentication:", error);
        if (isMounted) setIsAuthenticated(false);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    checkAuth();

    const unsubscribe = authService.onAuthStateChange((session) => {
      if (!isMounted) return;
      setIsAuthenticated(!!session);
      if (session) setIsLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Keep session fresh when app becomes visible/active
  useEffect(() => {
    let visibilityCleanup: (() => void) | undefined;
    let appStateListener: { remove?: () => void } | undefined;
    let resumeListener: { remove?: () => void } | undefined;

    const refreshIfNeeded = async () => {
      try {
        if (authService.isAuthenticated()) {
          await authService.validateAndExtendSession();
        }
      } catch (error) {
        console.warn('[AppContent] Session refresh on foreground failed:', error);
      }
    };

    import('@capacitor/app')
      .then(({ App }) => {
        appStateListener = App.addListener('appStateChange', async ({ isActive }) => {
          if (isActive) await refreshIfNeeded();
        });
        resumeListener = App.addListener('resume', refreshIfNeeded);
      })
      .catch(() => {
        const onVisibilityChange = () => {
          if (!document.hidden) refreshIfNeeded();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('focus', refreshIfNeeded);
        visibilityCleanup = () => {
          document.removeEventListener('visibilitychange', onVisibilityChange);
          window.removeEventListener('focus', refreshIfNeeded);
        };
      });

    return () => {
      appStateListener?.remove?.();
      resumeListener?.remove?.();
      visibilityCleanup?.();
    };
  }, []);

  // Persist last route and handle route-specific effects
  useEffect(() => {
    try {
      // Save current route for next launch
      const route = location.pathname + (location.search || "");
      setLastRoute(route);
      // Persist route, cached leads snapshot, and filters (up to 1000)
      try {
        const { leads: cachedLeads } = stateManager.getCachedLeads();
        const filters = stateManager.getFilters();
        void persistState('lastState', {
          route,
          leads: (cachedLeads || []).slice(0, 1000),
          filters,
        });
      } catch (e) {
        console.warn('[App] Failed to persist lastState:', e);
      }

      // Handle route-specific logic
      if (location.pathname === "/dashboard" && isAuthenticated) {
        // Reset dashboard filters when navigating to dashboard
        stateManager.setFilters({});
      }
    } catch (error) {
      console.error("Error handling route effects:", error);
    }
  }, [location.pathname, isAuthenticated]);

  // Restore last route and state after bootstrap and auth
  const navigate = useNavigate();
  useEffect(() => {
    if (!bootstrapped || isLoading) return;
    if (!isAuthenticated) return;
    const isAtRoot = location.pathname === "/" || location.pathname === "/auth";
    if (isAtRoot) {
      (async () => {
        const saved = await restoreState('lastState');
        const last = saved?.route || getLastRoute();
        try {
          if (saved?.filters) stateManager.setFilters(saved.filters);
          if (Array.isArray(saved?.leads) && saved.leads.length) {
            stateManager.setCachedLeads(saved.leads);
          }
        } catch {}
        if (last && last !== "/auth") {
          try { navigate(last, { replace: true }); } catch {}
        }
      })();
    }
  }, [bootstrapped, isLoading, isAuthenticated]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        // Initialize app storage structure
        await ensureAppStorageStructure();
        
        // Initialize theme
        await themeService.initialize();
        
        // Setup offline sync
        await setupOfflineSync();
        
        // Request notification permissions (deferred in App to avoid blocking render)
        
        // Hide splash screen after initialization
        if (Capacitor.isNativePlatform()) {
          await SplashScreen.hide();
        }
        
        setBootstrapped(true);
      } catch (error) {
        console.error("Bootstrap error:", error);
        setInitError(error instanceof Error ? error.message : "Failed to initialize app");
        setBootstrapped(true); // Continue even if some services fail
      }
    };

    bootstrap();
    try { SplashScreen.hide(); } catch {}
    // Safety timeout: ensure we never block UI indefinitely
    const timeout = window.setTimeout(() => {
      if (!bootstrapped) {
        console.warn('[AppContent] Bootstrap timeout; continue with cached mode');
        setBootstrapped(true);
      }
    }, 57000);
    const onOnline = () => {
      try { syncData(false); } catch {}
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  // Handle CRM notifications
  useEffect(() => {
    if (!bootstrapped || !leads.length) return;

    const processCRMNotifications = async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const lead of leads) {
          const status = String(lead.status || "").toLowerCase();
          // Travel reminders only for booked customers
          if (!status.includes("booked with us")) continue;

          const travelDate = lead.travelDate ? parseFlexibleDate(lead.travelDate) : null;
          
          if (travelDate) {
            const daysDiff = Math.ceil((travelDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            
            // Notify admin 3 days before travel
            if (daysDiff === 3) {
              await notifyAdmin(`Travel reminder: ${lead.travellerName} travels in 3 days`);
            }
            
            // Notify all users 1 day before travel
            if (daysDiff === 1) {
              await notifyAll(`Travel reminder: ${lead.travellerName} travels tomorrow`);
            }
            
            // Notify specific user 7 days before travel
            if (daysDiff === 7 && lead.consultant) {
              await notifyUser(lead.consultant, `Travel reminder: ${lead.travellerName} travels in 1 week`);
            }
          }
        }
      } catch (error) {
        console.error("Error processing CRM notifications:", error);
      }
    };

    processCRMNotifications();
  }, [leads, bootstrapped]);

  const sessionLoader = (
    <div className="flex items-center justify-center min-h-screen text-muted-foreground">
      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary mr-2" />
      <span>Restoring your session...</span>
    </div>
  );

  const renderProtectedRoute = (element: JSX.Element) => {
    if (isLoading) return sessionLoader;
    return isAuthenticated ? element : <Navigate to="/auth" replace />;
  };

  if (!bootstrapped) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading TTT CRM...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 sm:pb-20 relative">
      {/* ✅ Offline indicator for connection status */}
      <OfflineIndicator webSocketStatus={webSocketStatus} />
      
      {/* ✅ Error indicator for CRM errors */}
      {crmError && (
        <div className="fixed top-4 right-4 z-50 bg-destructive text-destructive-foreground px-4 py-2 rounded-md flex items-center gap-3">
          <span>{navigator.onLine ? 'Problem loading data' : "You're offline. Showing last saved data."}</span>
          <button className="text-xs underline" onClick={() => syncData(false)}>Retry</button>
        </div>
      )}

      <Routes>
        <Route path="/" element={renderProtectedRoute(<Index />)} />
        <Route 
          path="/auth" 
          element={
            isLoading ? sessionLoader : (isAuthenticated ? <Navigate to="/" replace /> : <Auth />)
          } 
        />
        <Route 
          path="/dashboard" 
          element={renderProtectedRoute(<Dashboard />)} 
        />
        <Route 
          path="/settings" 
          element={renderProtectedRoute(<Settings />)} 
        />
                <Route
                  path="/notifications"
                  element={renderProtectedRoute(<NotificationsPage />)}
                />
                <Route
                  path="/action-center"
                  element={renderProtectedRoute(<ActionCenterPage />)}
                />
                <Route path="/404" element={<NotFound />} />        <Route path="/lead/:leadId" element={<LeadDetailsDialog />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
      
      {/* Sticky helpers */}
      <ScrollToTopButton />
      {/* Always render BottomNavigation to ensure visibility in Android WebView */}
      {isAuthenticated && <BottomNavigation />}
    </div>
  );
}

