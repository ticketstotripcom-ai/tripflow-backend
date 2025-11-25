import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun, Settings, LogOut, Hand } from "lucide-react";
import NotificationBell from "@/components/notifications/NotificationBell";
import UserPreferencesDialog from "@/components/UserPreferencesDialog"; // ✅ NEW import
import { useWebSocketNotifications } from "@/hooks/useWebSocketNotifications";

/* ---------------------------------------------------------
   AI Smart Greeting (still lightweight)
---------------------------------------------------------- */
function getAIGreeting(name: string) {
  const h = new Date().getHours();
  if (h < 5) return `Burning the midnight oil, ${name}? 🌙`;
  if (h < 12) return `Good morning, ${name} 🌅`;
  if (h < 17) return `Good afternoon, ${name} ☀️`;
  if (h < 22) return `Good evening, ${name} 🌆`;
  return `Working late, ${name}? 🌃`;
}

interface AppHeaderProps {
  session: { user: { name: string; role?: string; email?: string } };
  theme: string;
  swipeEnabled: boolean;
  unreadCount: number;
  onToggleTheme: () => void;
  onToggleSwipe: () => void;
  onSettings?: () => void;
  onLogout: () => void;
  onMarkAllAsRead: () => void;
}

export default function AppHeader({
  session,
  theme,
  swipeEnabled,
  unreadCount,
  onToggleTheme,
  onToggleSwipe,
  onSettings,
  onLogout,
}: AppHeaderProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [greeting, setGreeting] = useState(getAIGreeting(session.user.name));
  const { connectionStatus } = useWebSocketNotifications();
  const headerRef = useRef<HTMLDivElement>(null);

  /* ---------------------------------------------------------
     ✨ COLLAPSE HEADER ON SCROLL
  ---------------------------------------------------------- */
  useEffect(() => {
    let last = window.scrollY;
    const handler = () => {
      const now = window.scrollY;
      setCollapsed(now > last && now > 60);
      last = now;
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  /* ---------------------------------------------------------
     🔮 Refresh AI greeting every 60s
  ---------------------------------------------------------- */
  useEffect(() => {
    const id = setInterval(() => {
      setGreeting(getAIGreeting(session.user.name));
    }, 60000);
    return () => clearInterval(id);
  }, [session.user.name]);

  /* ---------------------------------------------------------
     🌐 Device Tilt Parallax (Gyroscope)
  ---------------------------------------------------------- */
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const handler = (e: any) => {
      const x = e.gamma / 30;
      const y = e.beta / 30;
      el.style.transform = `translate(${x * 4}px, ${y * 2}px)`;
    };

    window.addEventListener("deviceorientation", handler);
    return () => window.removeEventListener("deviceorientation", handler);
  }, []);

  return (
    <div
      ref={headerRef}
      className={`
        sticky top-0 z-30
        backdrop-blur-2xl
        border-b
        overflow-hidden
        transition-all duration-300 
        shadow-soft 
        ${collapsed ? "py-1 scale-[0.97] opacity-95" : "py-3 sm:py-4"}
        relative
      `}
    >
      {/* ---------------------------------------------------------
         🌈 Aurora Ribbon Background
      ---------------------------------------------------------- */}
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top,rgba(147,51,234,0.25),transparent)] animate-aurora"></div>

      {/* ---------------------------------------------------------
         🌟 Twinkling Stars (Night mode)
      ---------------------------------------------------------- */}
      <div className="absolute inset-0 pointer-events-none -z-10 twinkle-layer"></div>

      {/* ---------------------------------------------------------
         ✈️ Animated Plane Path behind header
      ---------------------------------------------------------- */}
      <div className="absolute -bottom-4 left-0 w-full h-6 overflow-visible -z-10 pointer-events-none">
        <div className="plane-animation whitespace-nowrap text-sm opacity-40">
          ✈️ — — — — ✈️ — — — — ✈️ — — — — ✈️
        </div>
      </div>

      {/* ---------------------------------------------------------
         HEADER CONTENT
      ---------------------------------------------------------- */}
      <div className="px-2 sm:px-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 relative">
        
        {/* LEFT — title + greeting */}
        <div>
          <h1 className="text-lg sm:text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent transition-all duration-500">
            TTT CRM
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground animate-fade-in" key={greeting}>
            {greeting}
          </p>
        </div>

        {/* RIGHT — actions */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">

          {/* 🌐 Connection Status Halo */}
          <span
            className={`
              h-3 w-3 rounded-full shadow
              transition-all duration-300 
              ${
                connectionStatus === "connected"
                  ? "bg-green-500 animate-pulse-smooth"
                  : connectionStatus === "connecting"
                  ? "bg-yellow-500 animate-pulse"
                  : "bg-red-500"
              }
            `}
            title={connectionStatus}
          />

          {/* 🔔 Notification Bell with magnetic hover */}
          <div className="relative magnet-area">
            <NotificationBell />
          </div>

          {/* ✅ User Preferences Dialog */}
          <UserPreferencesDialog />

          {/* 🌙/☀️ Theme Toggle */}
          <Button variant="outline" size="icon" onClick={onToggleTheme} className="three-d-button">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {/* ⚙ Settings (Admin only) */}
          {session.user.role === 'admin' && onSettings && (
            <Button
              variant="outline"
              onClick={onSettings}
              className="gap-1 h-8 sm:h-10 three-d-button text-xs sm:text-sm px-2"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden xs:inline">Settings</span>
            </Button>
          )}

          {/* 🚪 Logout */}
          <Button
            variant="outline"
            onClick={onLogout}
            className="gap-1 h-8 sm:h-10 three-d-button text-xs sm:text-sm px-2"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden xs:inline">Logout</span>
          </Button>
        </div>
      </div>

      {/* ---------------------------------------------------------
         Animated CSS
      ---------------------------------------------------------- */}
      <style>{`
        @keyframes auroraMove {
          0% { background-position: 0% 0%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 0%; }
        }

        .animate-aurora {
          background-size: 200% 200%;
          animation: auroraMove 12s ease-in-out infinite;
        }

        /* ✨ Soft Pulse */
        @keyframes pulseSoft {
          0%,100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        .animate-pulse-smooth {
          animation: pulseSoft 2.5s ease-in-out infinite;
        }

        /* 🌟 Star twinkle layer */
        .twinkle-layer {
          background-image:
            radial-gradient(2px 2px at 20% 30%, white 70%, transparent),
            radial-gradient(2px 2px at 80% 70%, white 70%, transparent),
            radial-gradient(1px 1px at 50% 20%, white 70%, transparent),
            radial-gradient(1.5px 1.5px at 60% 80%, white 70%, transparent);
          opacity: 0.25;
          animation: twinkle 4s infinite alternate;
        }

        @keyframes twinkle {
          from { opacity: 0.15; }
          to { opacity: 0.45; }
        }

        /* ✈️ Plane Animation */
        .plane-animation {
          animation: planeMove 12s linear infinite;
        }
        @keyframes planeMove {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        /* 3D Floating Button */
        .three-d-button {
          transition: transform .2s ease, box-shadow .2s ease;
        }
        .three-d-button:hover {
          transform: translateY(-3px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.15);
        }

        /* Magnetic hover for notification */
        .magnet-area:hover {
          transform: scale(1.06);
        }
      `}</style>
    </div>
  );
}
