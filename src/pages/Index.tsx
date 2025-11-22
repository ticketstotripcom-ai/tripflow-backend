import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { authService } from "@/lib/authService";
import { themeService } from "@/lib/themeService";
import { stateManager } from "@/lib/stateManager";

import AppHeader from "@/components/AppHeader";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import ConsultantDashboard from "@/components/dashboard/ConsultantDashboard";

const Index = () => {
  const navigate = useNavigate();

  // ---------- Initial State ----------
  const [session, setSession] = useState(() => authService.getSession());
  const [theme, setTheme] = useState(() => themeService.getTheme());
  const [swipeEnabled, setSwipeEnabled] = useState(() =>
    stateManager.getSwipeEnabled()
  );

  // ---------- Auth Redirect ----------
  useEffect(() => {
    if (!authService.isAuthenticated()) {
      navigate("/auth");
    } else {
      // Always ensure session state is fresh
      setSession(authService.getSession());
    }
  }, [navigate]);

  // ---------- Header Callbacks ----------
  const handleToggleTheme = useCallback(async () => {
    const updatedTheme = await themeService.toggleTheme();
    setTheme(updatedTheme);
  }, []);

  const handleToggleSwipe = useCallback(() => {
    const next = !swipeEnabled;
    setSwipeEnabled(next);
    stateManager.setSwipeEnabled(next);
  }, [swipeEnabled]);

  const handleSettings = useCallback(() => {
    try {
      navigate("/settings");
    } catch {}

    try {
      const expectedHash = "#/settings";
      if (
        typeof window !== "undefined" &&
        !String(window.location.hash || "").startsWith(expectedHash)
      ) {
        window.location.hash = expectedHash;
      }
    } catch {}
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    await authService.logout();
    navigate("/auth");
  }, [navigate]);

  // ---------- Loading State ----------
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-subtle pb-[calc(var(--bottom-nav-height)+3rem)] flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  // ---------- Dashboard UI ----------
  const isAdmin = session.user.role === "admin";

  return (
    <div className="min-h-screen bg-gradient-subtle pb-[calc(var(--bottom-nav-height)+3rem)]">
      <AppHeader
        session={session}
        theme={theme}
        swipeEnabled={swipeEnabled}
        onToggleTheme={handleToggleTheme}
        onToggleSwipe={handleToggleSwipe}
        onSettings={isAdmin ? handleSettings : undefined}
        onLogout={handleLogout}
      />

      <main className="w-full px-2 sm:px-4 py-3 sm:py-6 space-y-4 sm:space-y-6 max-w-6xl mx-auto pb-[calc(var(--bottom-nav-height)+3rem)]">
        {isAdmin ? (
          <AdminDashboard swipeEnabled={swipeEnabled} />
        ) : (
          <ConsultantDashboard swipeEnabled={swipeEnabled} />
        )}

        {/* Spacer for bottom nav clearance */}
        <div aria-hidden className="h-[calc(var(--bottom-nav-height)+3rem)]" />
      </main>
    </div>
  );
};

export default Index;
