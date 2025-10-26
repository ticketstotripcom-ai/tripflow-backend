import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, Settings } from "lucide-react";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import ConsultantDashboard from "@/components/dashboard/ConsultantDashboard";
import BottomNavigation from "@/components/BottomNavigation";
import { authService } from "@/lib/authService";
import { themeService } from "@/lib/themeService";
import { Moon, Sun } from "lucide-react";

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
    <div className="min-h-screen bg-gradient-subtle pb-20">
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-14 z-10 shadow-soft">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                Tickets To Trip CRM
              </h1>
              <p className="text-sm text-muted-foreground">
                Welcome back, {session.user.name} ({session.user.role})
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handleToggleTheme}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              {session.user.role === 'admin' && (
                <Button
                  variant="outline"
                  onClick={() => navigate('/settings')}
                  className="gap-2"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleLogout}
                className="gap-2"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-6">
        {session.user.role === 'admin' ? <AdminDashboard /> : <ConsultantDashboard />}
      </main>

      <BottomNavigation />
    </div>
  );
};

export default Dashboard;
