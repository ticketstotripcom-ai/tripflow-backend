import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotificationsContext } from "@/context/NotificationContext";
import { Notification } from "@/services/notificationService";

const formatRelative = (timestamp: string): string => {
  const date = new Date(timestamp);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const priorityColor: Record<string, string> = {
  high: "bg-red-500/15 text-red-700 border border-red-300",
  normal: "bg-amber-500/15 text-amber-700 border border-amber-300",
  low: "bg-emerald-500/15 text-emerald-700 border border-emerald-300",
};

const actionLabel: Record<string, string> = {
  CALL_NOW: "Call",
  SEND_WHATSAPP: "WhatsApp",
  SEND_EMAIL: "Email",
  PUSH_NEGOTIATION: "Negotiate",
  SHARE_PROPOSAL: "Proposal",
  CHECK_INTEREST: "Check",
};

const iconForType = (type?: string) => {
  switch ((type || "").toLowerCase()) {
    case "followup":
      return "/icons/followup.png";
    case "closing":
      return "/icons/closing.png";
    case "heads-up":
    case "heads_up":
      return "/icons/alert.png";
    default:
      return "/icons/bell.png";
  }
};

const NotificationItem = ({
  item,
  onClick,
  onSnooze,
}: {
  item: Notification;
  onClick: (item: Notification) => void;
  onSnooze: (item: Notification) => void;
}) => {
  const pill = priorityColor[item.priority || "normal"] || "bg-slate-100 text-slate-700 border border-slate-200";
  return (
    <div
      className="w-full text-left px-3 py-2 hover:bg-muted transition flex flex-col gap-2 border-b last:border-b-0 relative"
      onClick={() => onClick(item)}
      role="button"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <img src={iconForType(item.notificationType || item.type)} alt="" className="h-5 w-5" />
          <div>
            <div className="font-semibold text-sm">{item.title}</div>
            <div className="text-xs text-muted-foreground">{item.message}</div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground whitespace-nowrap">{formatRelative(item.timestamp)}</div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {item.priority && (
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${pill}`}>
            {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
          </span>
        )}
        {item.nextAction && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30">
            {actionLabel[item.nextAction] || item.nextAction}
          </span>
        )}
        {(item.targetTravellerName || item.targetTripId) && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {item.targetTravellerName || item.targetTripId}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onSnooze(item); }}>
          Snooze 30m
        </Button>
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onClick(item); }}>
          Open
        </Button>
      </div>
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-r-sm"
        style={{ backgroundColor: item.priority === "high" ? "#f87171" : item.priority === "low" ? "#22c55e" : "#f59e0b" }} />
    </div>
  );
};

const NotificationList = ({ onClose }: { onClose?: () => void }) => {
  const { notifications, markAsRead, markAllAsRead, isLoading, settings, updateSettings } = useNotificationsContext();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "high" | "unread" | "actions">("all");

  const filtered = useMemo(() => {
    let list = [...notifications];
    if (filter === "high") list = list.filter((n) => n.priority === "high");
    if (filter === "unread") list = list.filter((n) => !n.read);
    if (filter === "actions") list = list.filter((n) =>
      ["CALL_NOW", "SEND_WHATSAPP", "SEND_EMAIL", "PUSH_NEGOTIATION"].includes(n.nextAction || "")
    );
    return list;
  }, [notifications, filter]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [filtered]
  );

  const handleClick = async (item: Notification) => {
    await markAsRead(item.id);
    if (item.route) {
      try {
        navigate(item.route);
      } catch {}
    }
    onClose?.();
  };

  const handleSnooze = (item: Notification) => {
    const until = Date.now() + 30 * 60 * 1000;
    updateSettings({ snoozed: { ...settings.snoozed, [item.id]: until } });
    markAsRead(item.id);
  };

  const focusList = useMemo(() => {
    return notifications
      .filter((n) => n.priority === "high")
      .slice(0, 5);
  }, [notifications]);

  return (
    <div className="flex flex-col h-full max-h-96">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="text-sm font-semibold">Notifications</div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={markAllAsRead} disabled={isLoading || notifications.length === 0}>
            Mark all as read
          </Button>
        </div>
      </div>
      <div className="px-3 py-2 flex items-center gap-2 border-b">
        {(["all", "high", "unread", "actions"] as const).map((f) => (
          <Button key={f} variant={filter === f ? "secondary" : "ghost"} size="sm" onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "high" ? "High" : f === "unread" ? "Unread" : "Calls/WA"}
          </Button>
        ))}
      </div>
      <div className="px-3 py-2 flex items-center gap-3 border-b text-xs text-muted-foreground">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={settings.muteLowPriority}
            onChange={(e) => updateSettings({ muteLowPriority: e.target.checked })}
          />
          Mute low priority
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={settings.dndEnabled}
            onChange={(e) => updateSettings({ dndEnabled: e.target.checked })}
          />
          DND ({settings.dndStartHour}:00-{settings.dndEndHour}:00)
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={settings.digestLowPriority}
            onChange={(e) => updateSettings({ digestLowPriority: e.target.checked })}
          />
          Digest low priority
        </label>
      </div>
      {focusList.length > 0 && (
        <div className="px-3 py-2 border-b bg-amber-50 text-amber-900">
          <div className="text-xs font-semibold mb-1">Today's Focus (Top 5 High Priority)</div>
          <div className="flex gap-2 flex-wrap">
            {focusList.map((f) => (
              <Button key={f.id} size="sm" variant="outline" onClick={() => handleClick(f)}>
                {f.title}
              </Button>
            ))}
          </div>
        </div>
      )}
      <ScrollArea className="h-80">
        {isLoading && sorted.length === 0 && (
          <div className="p-3 space-y-2">
            <div className="h-12 bg-muted animate-pulse rounded" />
            <div className="h-12 bg-muted animate-pulse rounded" />
            <div className="h-12 bg-muted animate-pulse rounded" />
          </div>
        )}
        {!isLoading && sorted.length === 0 && (
          <div className="p-3 text-sm text-muted-foreground">No notifications</div>
        )}
        {sorted.map((item) => (
          <NotificationItem key={item.id} item={item} onClick={handleClick} onSnooze={handleSnooze} />
        ))}
      </ScrollArea>
    </div>
  );
};

export default NotificationList;
