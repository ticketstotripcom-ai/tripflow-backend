import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotificationsContext } from "@/context/NotificationContext";
import NotificationList from "./NotificationList";

const NotificationBell = () => {
  const { unreadCount } = useNotificationsContext();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [panelRight, setPanelRight] = useState<number>(8);
  const [panelTop, setPanelTop] = useState<number>(0);
  const [panelWidth, setPanelWidth] = useState<number>(320);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    const updatePosition = () => {
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const safeMargin = 8;
      const width = Math.min(320, Math.max(240, window.innerWidth - safeMargin * 2));
      setPanelWidth(width);
      setPanelRight(Math.max(safeMargin, window.innerWidth - rect.right));
      setPanelTop(Math.round(Math.min(rect.bottom + 8, window.innerHeight - 8)));
    };
    if (open) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, { passive: true });
      window.addEventListener("resize", updatePosition);
    }
    return () => {
      window.removeEventListener("scroll", updatePosition as any);
      window.removeEventListener("resize", updatePosition as any);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapperRef}>
      <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)} aria-label="Notifications">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] rounded-full px-1.5 py-0.5">
            {unreadCount}
          </span>
        )}
      </Button>
      {open &&
        createPortal(
          <div
            className="fixed bg-background border rounded-lg shadow-lg z-[9999]"
            style={{ right: panelRight, top: panelTop, width: panelWidth, maxHeight: `calc(100vh - ${Math.max(96, panelTop + 24)}px)` }}
          >
            <NotificationList onClose={() => setOpen(false)} />
          </div>,
          document.body
        )}
    </div>
  );
};

export default NotificationBell;
