import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, Settings } from "lucide-react";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import ConsultantDashboard from "@/components/dashboard/ConsultantDashboard";
import { authService } from "@/lib/authService";
import { themeService } from "@/lib/themeService";
import { Moon, Sun } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";

const Dashboard = () => {
  const [session, setSession] = useState(authService.getSession());
  const [theme, setTheme] = useState(themeService.getTheme());
  const navigate = useNavigate();

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      navigate('/auth');
    }
  }, [navigate]);

  const handleLogout = async () => {
    await authService.logout();
    navigate('/auth');
  };

  const handleToggleTheme = async () => {
    const newTheme = await themeService.toggleTheme();
    setTheme(newTheme);
  };

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-subtle pb-24 sm:pb-20">
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10 shadow-soft">
        <div className="w-full px-2 sm:px-4 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="w-full sm:w-auto">
              <h1 className="text-lg sm:text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent truncate">
                TTT CRM
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                Welcome back, {session.user.name} ({session.user.role})
              </p>
            </div>
            <div className="flex gap-1 sm:gap-2 w-full sm:w-auto justify-end items-center">
              <NotificationBell user={session.user} />
              <Button
                variant="outline"
                size="icon"
                onClick={handleToggleTheme}
                className="h-8 w-8 sm:h-10 sm:w-10 shrink-0"
              >
                {theme === 'dark' ? <Sun className="h-3 w-3 sm:h-4 sm:w-4" /> : <Moon className="h-3 w-3 sm:h-4 sm:w-4" />}
              </Button>
              {session.user.role === 'admin' && (
                <Button
                  variant="outline"
                  onClick={() => navigate('/settings')}
                  className="gap-1 h-8 sm:h-10 text-xs sm:text-sm px-2 sm:px-4"
                >
                  <Settings className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline">Settings</span>
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleLogout}
                className="gap-1 h-8 sm:h-10 text-xs sm:text-sm px-2 sm:px-4"
              >
                <LogOut className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="w-full px-2 sm:px-4 py-3 sm:py-6">
        {session.user.role === 'admin' ? <AdminDashboard /> : <ConsultantDashboard />}
      </main>

      {/* BottomNavigation is rendered globally in App.tsx */}
    </div>
  );
};

export default Dashboard;
