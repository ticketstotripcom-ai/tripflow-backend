import React, { useState, useEffect, Component, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, Settings } from "lucide-react";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import ConsultantDashboard from "@/components/dashboard/ConsultantDashboard";
import Blackboard from "@/components/Blackboard";
import { authService } from "@/lib/authService";
import { themeService } from "@/lib/themeService";
import { Moon, Sun } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { stateManager } from "@/lib/stateManager";
import { useNotificationsContext } from "@/context/NotificationContext";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  componentDidCatch(error: any) {
    console.error("Dashboard error:", error);
    this.setState({ hasError: true, message: error?.message || "Unknown error" });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-subtle pb-24 sm:pb-20 flex items-center justify-center">
          <p className="text-red-500">Failed to load dashboard data.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

const Dashboard = () => {
  const [session, setSession] = useState(authService.getSession());
  const [theme, setTheme] = useState(themeService.getTheme());
  const [swipeEnabled, setSwipeEnabled] = useState(stateManager.getSwipeEnabled());
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadCount, markAllAsRead } = useNotificationsContext();
  // WS notifications managed globally; NotificationBell handles its own count
  const viewParam = new URLSearchParams(location.search).get('view');
  const isAnalyticsOnly = viewParam === 'analytics';

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      navigate('/auth');
    }
  }, [navigate]);

  // Ensure Dashboard renders analytics-only views of dashboards
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const view = params.get('view');
    console.log('Dashboard mounted with view:', view);
    if (view !== 'analytics') {
      console.log('Redirecting to /dashboard?view=analytics');
      navigate('/dashboard?view=analytics', { replace: true });
    }
  }, [location.search, navigate]);

  // Debug: log mounted view state for diagnostics
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const currentView = params.get('view') || 'analytics';
    console.log('Dashboard mounted with view:', currentView);
  }, [location.search]);

  const handleLogout = async () => {
    await authService.logout();
    navigate('/auth');
  };

  const handleToggleTheme = async () => {
    const newTheme = await themeService.toggleTheme();
    setTheme(newTheme);
  };

  const handleToggleSwipe = () => {
    setSwipeEnabled((prev) => {
      const next = !prev;
      stateManager.setSwipeEnabled(next);
      return next;
    });
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-subtle pb-24 sm:pb-20 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading dashboard…</div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <div className="min-h-screen bg-gradient-subtle pb-24 sm:pb-20">
      <AppHeader 
        session={session as any}
        theme={theme}
        swipeEnabled={swipeEnabled}
        unreadCount={unreadCount}
        onToggleTheme={handleToggleTheme}
        onToggleSwipe={handleToggleSwipe}
        onSettings={session.user.role === 'admin' ? () => {
          try { navigate('/settings'); } catch {}
          try {
            const expected = '#/settings';
            if (typeof window !== 'undefined') {
              if (!String(window.location.hash || '').startsWith(expected)) {
                window.location.hash = expected;
              }
            }
          } catch {}
        } : undefined}
        onLogout={handleLogout}
        onMarkAllAsRead={markAllAsRead}
      />

      <main className="w-full px-2 sm:px-4 py-3 sm:py-6 space-y-4 sm:space-y-6">
        {isAnalyticsOnly ? (
          session.user.role === 'admin' ? <AdminDashboard swipeEnabled={swipeEnabled} /> : <ConsultantDashboard swipeEnabled={swipeEnabled} />
        ) : (
          <div className="text-sm text-muted-foreground">Preparing analytics…</div>
        )}
        <Blackboard />
      </main>

      {/* BottomNavigation is rendered globally in App.tsx */}
    </div>
    </ErrorBoundary>
  );
};

export default Dashboard;
