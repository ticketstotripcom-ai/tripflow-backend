import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
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
import { stateManager } from "@/lib/stateManager";
import { useSheetService } from "@/hooks/useSheetService";
import { notifyAdmin, notifyAll, notifyUser } from "@/utils/notifyTriggers";
import { parseFlexibleDate } from "@/lib/dateUtils";
import { SettingsProvider } from "@/lib/SettingsContext";
import { ensureAppStorageStructure } from "@/lib/deviceStorage";

// ✅ NEW imports for offline-first sync
import { useCRMData } from "@/hooks/useCRMData";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";

// ✅ NEW import for WebSocket notifications
import { useWebSocketNotifications } from "@/hooks/useWebSocketNotifications";

const queryClient = new QueryClient();

const App = () => {
  const [isReady, setIsReady] = useState(false);

  // ✅ Initialize CRM data hook once (global background sync)
  const { data: crmData, syncing } = useCRMData();
  useOfflineSync(); // Auto-push pending offline edits when online
  
  // ✅ Initialize WebSocket notifications
  const { unreadCount, markAllAsRead } = useWebSocketNotifications();

  useEffect(() => {
    try {
      const saved = localStorage.getItem("serviceAccountJson");
      if (saved) console.log("✅ Loaded service account JSON from localStorage");
    } catch {}

    const bootstrap = async () => {
      const canControlSplash = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("SplashScreen");

      if (canControlSplash) {
        try {
          await SplashScreen.show({ autoHide: false });
        } catch (error) {
          console.warn("Unable to show splash screen:", error);
        }
      }

      try {
        await ensureAppStorageStructure();
        await Promise.all([authService.initialize(), themeService.initialize()]);
        await notificationService.initialize();
        setupOfflineSync();
      } catch (error) {
        console.error("Initialization error:", error);
      } finally {
        setIsReady(true);
        if (canControlSplash) {
          try {
            await SplashScreen.hide();
          } catch (error) {
            console.warn("Unable to hide splash screen:", error);
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
        console.error("Plugin initialization failed:", error);
      }
    };
    void initPlugins();
  }, [isReady]);

  const RouteEffects = () => {
    const location = useLocation();
    useEffect(() => {
      if (location.pathname === "/dashboard") {
        const params = new URLSearchParams(location.search);
        const view = params.get("view");
        console.log("Route effect - Dashboard with view:", view);
        stateManager.setFilters({
          statusFilter: "All Statuses",
          priorityFilter: "All Priorities",
          dateFilter: "",
          dateFromFilter: "",
          dateToFilter: "",
          consultantFilter: "All Consultants",
        });
        if (view === "analytics") {
          stateManager.setActiveTab("dashboard");
        } else {
          stateManager.setActiveTab("working");
        }
      }
      if (location.pathname === "/") {
        stateManager.setFilters({
          statusFilter: "All Statuses",
          priorityFilter: "All Priorities",
          dateFilter: "",
          dateFromFilter: "",
          dateToFilter: "",
          consultantFilter: "All Consultants",
        });
        stateManager.setActiveTab("working");
      }
    }, [location.pathname, location.search]);
    return null;
  };

  useEffect(() => {
    let cancelled = false;
    const STORAGE = "crm_notifications_processed_v1";
    type Snapshot = Record<string, { status: string; consultant: string; travelDate: string }>;
    const keyOf = (l: any) => `${l.dateAndTime}|${(l.travellerName || "").toLowerCase()}`;

    const run = async () => {
      try {
        const svc = await useSheetService();
        const cached = stateManager.getCachedLeads();
        const leads = cached.leads || [];
        const raw = localStorage.getItem(STORAGE);
        const snap: Snapshot = raw ? JSON.parse(raw) : {};

        const users = await svc.getRows("Users");
        const nameToEmail: Record<string, string> = {};
        users.forEach((r: any[]) => {
          const name = (r?.[2] || r?.name || "").toString().trim();
          const email = (r?.[1] || r?.email || "").toString().trim();
          if (name && email) nameToEmail[name.toLowerCase()] = email;
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const l of leads) {
          const k = keyOf(l);
          const prev = snap[k];
          const curr = {
            status: (l.status || "").toLowerCase(),
            consultant: (l.consultant || "").toLowerCase(),
            travelDate: l.travelDate || "",
          };

          if (!prev) {
            if (!curr.consultant || curr.consultant.includes("unassigned")) {
              await notifyAdmin("New unassigned lead", `${l.travellerName} requires assignment`);
            }
          }

          if (prev && (!prev.consultant || prev.consultant.includes("unassigned")) && curr.consultant && !curr.consultant.includes("unassigned")) {
            await notifyAll("Lead assigned", `${l.travellerName} has been assigned to ${curr.consultant}.`, "leadAssigned");
          }

          const td = parseFlexibleDate(l.travelDate);
          if (td && (l.status || "").toLowerCase().includes("booked")) {
            const diffDays = Math.round((td.setHours(0, 0, 0, 0) - today.getTime()) / (1000 * 60 * 60 * 24));
            if ([0, 1, 2].includes(diffDays)) {
              const consultantEmail = nameToEmail[curr.consultant];
              if (consultantEmail)
                await notifyUser(consultantEmail, "Trip reminder", `${l.travellerName} traveling ${l.travelDate}`, "tripReminder");
              await notifyAdmin("Trip reminder", `${l.travellerName} traveling ${l.travelDate}`);
            }
          }

          const previouslyBooked = prev ? prev.status.includes("booked") || prev.status.includes("nooked") : false;
          const currentlyBooked = curr.status.includes("booked") || curr.status.includes("nooked");
          if (prev && !previouslyBooked && currentlyBooked) {
            await notifyAll("Lead booked", `${l.travellerName} booked with us`, "leadClosed");
          }

          snap[k] = curr;
        }

        localStorage.setItem(STORAGE, JSON.stringify(snap));
      } catch (e) {
        console.warn("Notifications runner error:", e);
      }
    };

    const interval = setInterval(run, 60000);
    run();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!isReady) {
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
            <div className="pb-24 sm:pb-20 relative">
              {/* Notification Button */}
              <div className="fixed top-3 right-3 flex items-center gap-3 z-50">
                <button
                  onClick={markAllAsRead}
                  className="bg-blue-500 text-white rounded-full px-4 py-2"
                >
                  🔔 {unreadCount > 0 ? unreadCount : ""}
                </button>
              </div>
              {/* ✅ Sync status indicator always visible */}
              <SyncStatusIndicator syncing={syncing} />
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
