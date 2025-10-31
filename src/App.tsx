import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import BottomNavigation from "@/components/BottomNavigation";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { authService } from "@/lib/authService";
import { notificationService } from "@/lib/notificationService";
import { themeService } from "@/lib/themeService";
import { setupOfflineSync } from "@/lib/offlineQueue";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
//import GlobalNavigation from "./components/GlobalNavigation";
import { useLocation } from "react-router-dom";
import { stateManager } from "@/lib/stateManager";
import { useSheetService } from "@/hooks/useSheetService";
import { notifyAdmin, notifyAll, notifyUser } from "@/utils/notifyTriggers";
import { parseFlexibleDate } from "@/lib/dateUtils";
import { SettingsProvider } from "@/lib/SettingsContext";

const queryClient = new QueryClient();

const App = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // One-time log for service account availability from localStorage
    try {
      const saved = localStorage.getItem('serviceAccountJson');
      if (saved) console.log('✅ Loaded service account JSON from localStorage');
    } catch {}

    const bootstrap = async () => {
      const canControlSplash = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('SplashScreen');

      if (canControlSplash) {
        try {
          await SplashScreen.show({ autoHide: false });
        } catch (error) {
          console.warn('Unable to show splash screen:', error);
        }
      }

      try {
        await Promise.all([
          authService.initialize(),
          themeService.initialize(),
        ]);
        await notificationService.initialize();
        setupOfflineSync();
      } catch (error) {
        console.error('Initialization error:', error);
      } finally {
        setIsReady(true);
        if (canControlSplash) {
          try {
            await SplashScreen.hide();
          } catch (error) {
            console.warn('Unable to hide splash screen:', error);
          }
        }
      }
    };

    void bootstrap();
  }, []);

  useEffect(() => {
    if (!isReady) return;

    const initPlugins = async () => {
      if (!authService.isLoggedIn()) return;

      try {
        await notificationService.enableNotifications();
        await notificationService.enableCallLog();
      } catch (error) {
        console.error('Plugin initialization failed:', error);
      }
    };

    void initPlugins();
  }, [isReady]);

  // Clear filters when switching between Home ↔ Dashboard and default Working tab
  const RouteEffects = () => {
    const location = useLocation();
    useEffect(() => {
      if (location.pathname === '/dashboard') {
        const params = new URLSearchParams(location.search);
        const view = params.get('view');
        console.log('Route effect - Dashboard with view:', view);
        
        // Clear filters for dashboard
        stateManager.setFilters({ statusFilter: 'All Statuses', priorityFilter: 'All Priorities', dateFilter: '', dateFromFilter: '', dateToFilter: '', consultantFilter: 'All Consultants' });
        
        // Set appropriate tab based on view
        if (view === 'analytics') {
          stateManager.setActiveTab('dashboard');
        } else {
          stateManager.setActiveTab('working');
        }
      }
      if (location.pathname === '/') {
        stateManager.setFilters({ statusFilter: 'All Statuses', priorityFilter: 'All Priorities', dateFilter: '', dateFromFilter: '', dateToFilter: '', consultantFilter: 'All Consultants' });
        // Default Home to Working tab
        stateManager.setActiveTab('working');
      }
    }, [location.pathname, location.search]);
    return null;
  };

  // Background notification trigger runner
  useEffect(() => {
    let cancelled = false;
    const STORAGE = 'crm_notifications_processed_v1';

    type Snapshot = Record<string, { status: string; consultant: string; travelDate: string }>;

    const keyOf = (l: any) => `${l.dateAndTime}|${(l.travellerName || '').toLowerCase()}`;

    const run = async () => {
      try {
        const svc = await useSheetService();
        const cached = stateManager.getCachedLeads();
        const leads = cached.leads || [];
        const raw = localStorage.getItem(STORAGE);
        const snap: Snapshot = raw ? JSON.parse(raw) : {};

        // Build name→email map (Sheet name is case-sensitive)
        const users = await svc.getRows('Users');
        const nameToEmail: Record<string, string> = {};
        users.forEach((r: any[]) => {
          const name = (r?.[2] || r?.name || '').toString().trim();
          const email = (r?.[1] || r?.email || '').toString().trim();
          if (name && email) nameToEmail[name.toLowerCase()] = email;
        });

        const today = new Date();
        today.setHours(0,0,0,0);

        for (const l of leads) {
          const k = keyOf(l);
          const prev = snap[k];
          const curr = { status: (l.status || '').toLowerCase(), consultant: (l.consultant || '').toLowerCase(), travelDate: l.travelDate || '' };

          // New unassigned lead
          if (!prev) {
            if (!curr.consultant || curr.consultant.includes('unassigned')) {
              await notifyAdmin('New unassigned lead', `${l.travellerName} requires assignment`);
            }
          }

          // Lead assigned
          if (prev && (!prev.consultant || prev.consultant.includes('unassigned')) && curr.consultant && !curr.consultant.includes('unassigned')) {
            await notifyAll('Lead assigned', `${l.travellerName} has been assigned to ${curr.consultant}.`, 'leadAssigned');
          }

          // Trip reminders (2 days, 1 day, today) to consultant and admins
          const td = parseFlexibleDate(l.travelDate);
          if (td && (l.status || '').toLowerCase().includes('booked')) {
            const diffDays = Math.round((td.setHours(0,0,0,0) - today.getTime()) / (1000*60*60*24));
            if ([0,1,2].includes(diffDays)) {
              const consultantEmail = nameToEmail[curr.consultant];
              if (consultantEmail) await notifyUser(consultantEmail, 'Trip reminder', `${l.travellerName} traveling ${l.travelDate}`, 'tripReminder');
              await notifyAdmin('Trip reminder', `${l.travellerName} traveling ${l.travelDate}`);
            }
          }

          // Lead booked/closed → notify all
          const previouslyBooked = prev ? prev.status.includes('booked') || prev.status.includes('nooked') : false;
          const currentlyBooked = curr.status.includes('booked') || curr.status.includes('nooked');
          if (prev && !previouslyBooked && currentlyBooked) {
            await notifyAll('Lead booked', `${l.travellerName} booked with us`, 'leadClosed');
          }

          snap[k] = curr;
        }

        localStorage.setItem(STORAGE, JSON.stringify(snap));
      } catch (e) {
        console.warn('Notifications runner error:', e);
      }
    };

    const interval = setInterval(run, 60000);
    run();
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!isReady) {
    // Prevent flicker before theme loads
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          backgroundColor: "var(--background-color, #fff)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-color, #000)",
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <SettingsProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <HashRouter>
            <RouteEffects />
            <div className="pb-24 sm:pb-20">
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/404" element={<NotFound />} />
                <Route path="*" element={<Navigate to="/404" replace />} />
              </Routes>
              <BottomNavigation />
            </div>
          </HashRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </SettingsProvider>
  );
};

export default App;
