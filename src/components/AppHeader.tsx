import { Button } from "@/components/ui/button";
import NotificationBell from "@/components/NotificationBell";
import { Moon, Sun, Settings, LogOut, Hand } from "lucide-react";

interface AppHeaderProps {
  session: { user: { name: string; role?: string } };
  theme: string;
  swipeEnabled: boolean;
  onToggleTheme: () => void;
  onToggleSwipe: () => void;
  onSettings?: () => void;
  onLogout: () => void;
}

const AppHeader = ({ session, theme, swipeEnabled, onToggleTheme, onToggleSwipe, onSettings, onLogout }: AppHeaderProps) => {
  return (
    <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10 shadow-soft">
      <div className="w-full px-2 sm:px-4 py-3 sm:py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="w-full sm:w-auto">
            <h1 className="text-lg sm:text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent truncate">
              TTT CRM
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              Welcome back, {session.user.name}{session.user.role ? ` (${session.user.role})` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-1 sm:gap-2 w-full sm:w-auto justify-end items-center">
            <NotificationBell user={session.user as any} />
            <Button
              variant={swipeEnabled ? "default" : "outline"}
              onClick={onToggleSwipe}
              className="gap-1 h-8 sm:h-10 text-xs sm:text-sm px-2 sm:px-4"
              aria-pressed={swipeEnabled}
            >
              <Hand className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Swipe {swipeEnabled ? 'On' : 'Off'}</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onToggleTheme}
              className="h-8 w-8 sm:h-10 sm:w-10 shrink-0"
            >
              {theme === 'dark' ? <Sun className="h-3 w-3 sm:h-4 sm:w-4" /> : <Moon className="h-3 w-3 sm:h-4 sm:w-4" />}
            </Button>
            {onSettings && (
              <Button
                variant="outline"
                onClick={onSettings}
                className="gap-1 h-8 sm:h-10 text-xs sm:text-sm px-2 sm:px-4"
              >
                <Settings className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Settings</span>
              </Button>
            )}
            <Button
              variant="outline"
              onClick={onLogout}
              className="gap-1 h-8 sm:h-10 text-xs sm:text-sm px-2 sm:px-4"
            >
              <LogOut className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Logout</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppHeader;
