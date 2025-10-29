import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import BottomNavigation from "@/components/BottomNavigation";
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

const queryClient = new QueryClient();

const App = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      // Initialize all services
      await Promise.all([
        authService.initialize(),
        notificationService.initialize(),
        themeService.initialize(),
      ]);
      setupOfflineSync();
      setIsReady(true);
    })();
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
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
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
