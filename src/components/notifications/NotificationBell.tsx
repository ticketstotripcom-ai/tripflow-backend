import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotificationsContext } from "@/context/NotificationContext";
import NotificationList from "./NotificationList";
import { useSheetService } from "@/hooks/useSheetService";
import { fetchAllNotifications, AppNotification, markNotificationAsRead } from "@/utils/notifications";
import { notificationSettingsService } from "@/lib/notificationSettings";
import { cacheGet, cacheSet } from "@/lib/appCache";

const NotificationBell = () => {
  const { unreadCount } = useNotificationsContext();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate(); // For navigating to Action Center
  const { service: sheetService } = useSheetService();
  const [summaryItems, setSummaryItems] = useState<AppNotification[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);

  // Load needs attention notifications for the summary
  useEffect(() => {
    let isMounted = true;
    const loadSummaryNotifications = async () => {
      if (!sheetService) return;
      setLoadingSummary(true);
      try {
        const cached = await cacheGet<AppNotification[]>("crm_notifications_all_cache_v1", 10 * 60 * 1000);
        const all = cached || await fetchAllNotifications(sheetService);
        if (!cached) {
          await cacheSet("crm_notifications_all_cache_v1", all);
        }
        
        const settings = await notificationSettingsService.getSettings();
        const nonSnoozed = all.filter(notif => {
          const snoozeEndTime = settings.snoozedLeads[notif.id];
          return !snoozeEndTime || snoozeEndTime <= Date.now();
        });

        const needsAttention = nonSnoozed.filter(item => 
          !item.read || 
          item.priority === 'high' || 
          ['CALL_NOW', 'SEND_WHATSAPP', 'PUSH_NEGOTIATION', 'SHARE_PROPOSAL'].includes(item.nextAction || '')
        ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5); // Limit to top 5

        if (isMounted) {
          setSummaryItems(needsAttention);
        }
      } catch (e) {
        console.warn('NotificationBell: failed to load summary notifications', e);
      } finally {
        if (isMounted) {
          setLoadingSummary(false);
        }
      }
    };

    if (open && sheetService) {
      loadSummaryNotifications();
    } else if (!open) {
      setSummaryItems([]); // Clear summary when closed
    }

    return () => { isMounted = false; };
  }, [open, sheetService]);

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

  const handleItemClick = async (n: AppNotification) => {
    if (!n.read) {
      try { if (sheetService) await markNotificationAsRead(sheetService, n); } catch {}
      // No need to update summaryItems directly, will refresh on next open
    }
    if (n.route) {
      navigate(n.route);
    } else {
      // Default to Action Center if no specific route
      navigate('/action-center');
    }
    setOpen(false); // Close bell after action
  };

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
            <div className="p-3 border-b flex items-center justify-between">
                <h3 className="font-semibold text-sm">Needs Attention</h3>
                <Button variant="ghost" size="sm" onClick={() => { navigate('/action-center'); setOpen(false); }}>
                    View All
                </Button>
            </div>
            {loadingSummary ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
            ) : summaryItems.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No urgent items.</div>
            ) : (
                <div className="divide-y">
                    {summaryItems.map(item => (
                        <div key={item.id} className="flex items-center gap-2 p-3 hover:bg-muted/50 cursor-pointer" onClick={() => handleItemClick(item)}>
                            <Bell className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <div className="flex-1">
                                <p className="text-sm font-medium">{item.title}</p>
                                <p className="text-xs text-muted-foreground truncate">{item.message}</p>
                            </div>
                            {!item.read && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                        </div>
                    ))}
                </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

export default NotificationBell;
