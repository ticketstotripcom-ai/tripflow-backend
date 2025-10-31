import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "@/lib/authService";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import ConsultantDashboard from "@/components/dashboard/ConsultantDashboard";
import AppHeader from "@/components/AppHeader";
import { themeService } from "@/lib/themeService";
import { stateManager } from "@/lib/stateManager";

const Index = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState(authService.getSession());
  const [theme, setTheme] = useState(themeService.getTheme());
  const [swipeEnabled, setSwipeEnabled] = useState(stateManager.getSwipeEnabled());

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      navigate("/auth");
    }
  }, [navigate]);

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-subtle pb-24 sm:pb-20 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle pb-24 sm:pb-20">
      <AppHeader
        session={session as any}
        theme={theme}
        swipeEnabled={swipeEnabled}
        onToggleTheme={async () => setTheme(await themeService.toggleTheme())}
        onToggleSwipe={() => {
          const next = !swipeEnabled;
          setSwipeEnabled(next);
          stateManager.setSwipeEnabled(next);
        }}
        onSettings={session.user.role === 'admin' ? () => navigate('/settings') : undefined}
        onLogout={async () => { await authService.logout(); navigate('/auth'); }}
      />
      <main className="w-full px-2 sm:px-4 py-3 sm:py-6 space-y-4 sm:space-y-6 max-w-6xl mx-auto">
        {session.user.role === 'admin' ? <AdminDashboard swipeEnabled={swipeEnabled} /> : <ConsultantDashboard swipeEnabled={swipeEnabled} />}
      </main>
    </div>
  );
};

export default Index;
