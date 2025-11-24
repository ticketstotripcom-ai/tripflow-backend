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
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    if (open) {
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", closeOnEscape);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", closeOnEscape);
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
            className="fixed inset-x-0 top-16 mx-auto w-[95vw] max-w-md bg-background border rounded-lg shadow-lg z-[9999] sm:absolute sm:top-full sm:right-0 sm:left-auto sm:w-96 sm:mt-2 sm:mx-0"
            style={{ maxHeight: "calc(100vh - 5rem)" }}
          >
            <NotificationList onClose={() => setOpen(false)} />
          </div>,
          document.body
        )}
    </div>
  );
};

export default NotificationBell;
