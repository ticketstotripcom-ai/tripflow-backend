import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSheetService } from '@/hooks/useSheetService';
import { fetchAllNotifications, AppNotification, markNotificationAsRead } from '@/utils/notifications';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { stateManager } from '@/lib/stateManager';
import PullToRefresh from '@/components/PullToRefresh';
import { GoogleSheetsService } from '@/lib/googleSheets';
import { cacheGet, cacheSet } from '@/lib/appCache';
import { Archive, Bell, Fire, Inbox, Star } from 'lucide-react';
import { notificationSettingsService } from '@/lib/notificationSettings'; // Import notificationSettingsService

// A more detailed item for the Action Center
const ActionItem = ({ item, onClick, onSnooze }: { item: AppNotification; onClick: (item: AppNotification) => void; onSnooze: (item: AppNotification) => void }) => {
  const isUnread = !item.read;

  const getIcon = () => {
    switch (item.type) {
      case 'new_trip':
        return <Bell className="h-5 w-5 text-blue-500" />;
      case 'trip_assigned':
        return <Star className="h-5 w-5 text-yellow-500" />;
      case 'trip_booked':
        return <Fire className="h-5 w-5 text-red-500" />;
      default:
        return <Inbox className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <button 
      className={`w-full text-left p-3 flex items-start gap-4 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${isUnread ? 'bg-blue-500/5' : ''}`}
      onClick={() => onClick(item)}
    >
      <div className="mt-1">{getIcon()}</div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <p className={`font-semibold ${isUnread ? 'text-primary' : ''}`}>{item.title}</p>
          <p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p>
        </div>
        <p className="text-sm text-muted-foreground">{item.message}</p>
        <div className="flex items-center gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onSnooze(item); }}>Snooze 1hr</Button>
            {/* Add other action buttons here if needed */}
        </div>
      </div>
      {isUnread && <div className="h-2.5 w-2.5 rounded-full bg-blue-500 self-center" />}
    </button>
  );
};

// Utility function to group and sort notifications
interface GroupedNotification {
  key: string; // TravellerName or TripId or 'General'
  notifications: AppNotification[];
  lastActivity: Date;
  hasUnread: boolean;
  isHighPriority: boolean;
}

const groupAndSortNotifications = (notifications: AppNotification[]): GroupedNotification[] => {
  const groups: { [key: string]: AppNotification[] } = {};

  notifications.forEach(notif => {
    const groupKey = notif.targetTravellerName || notif.targetTripId || 'General';
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(notif);
  });

  return Object.entries(groups)
    .map(([key, notifs]) => {
      // Sort notifications within each group
      const sortedNotifs = [...notifs].sort((a, b) => {
        // Unread first
        if (!a.read && b.read) return -1;
        if (a.read && !b.read) return 1;
        // High priority first
        if (a.priority === 'high' && b.priority !== 'high') return -1;
        if (a.priority !== 'high' && b.priority === 'high') return 1;
        // Most recent first
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      const lastActivity = new Date(sortedNotifs[0].createdAt);
      const hasUnread = sortedNotifs.some(n => !n.read);
      const isHighPriority = sortedNotifs.some(n => n.priority === 'high');

      return {
        key,
        notifications: sortedNotifs,
        lastActivity,
        hasUnread,
        isHighPriority,
      };
    })
    .sort((a, b) => {
      // Prioritize groups with unread notifications
      if (a.hasUnread && !b.hasUnread) return -1;
      if (!a.hasUnread && b.hasUnread) return 1;
      // Prioritize groups with high priority notifications
      if (a.isHighPriority && !b.isHighPriority) return -1;
      if (!a.isHighPriority && b.isHighPriority) return 1;
      // Most recent activity first
      return b.lastActivity.getTime() - a.lastActivity.getTime();
    });
};


export default function ActionCenterPage() {
  const navigate = useNavigate();
  const { service: sheetService } = useSheetService();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'needs_attention'>('all');

  const loadNotifications = async (service: GoogleSheetsService) => {
    try {
      setLoading(true);
      const cached = await cacheGet<AppNotification[]>("crm_notifications_all_cache_v1", 10 * 60 * 1000);
      if (cached?.length) {
        setItems(cached);
      }
      const all = await fetchAllNotifications(service);
      const settings = await notificationSettingsService.getSettings();
      const nonSnoozed = all.filter(notif => {
        const snoozeEndTime = settings.snoozedLeads[notif.id];
        return !snoozeEndTime || snoozeEndTime <= Date.now();
      });
      setItems(nonSnoozed);
      await cacheSet("crm_notifications_all_cache_v1", nonSnoozed);
    } catch (e) {
      console.warn('Action Center: failed to load notifications', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sheetService) {
      loadNotifications(sheetService);
    }
  }, [sheetService]);

  const handleItemClick = async (n: AppNotification) => {
    if (!n.read) {
      try { if (sheetService) await markNotificationAsRead(sheetService, n); } catch {}
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    if (n.route) {
      navigate(n.route);
    }
  };
  
  const handleSnooze = async (n: AppNotification) => {
    // Assuming n.id can be used as a unique identifier for snoozing
    if (!n.id) return;
    await notificationSettingsService.snoozeLead(n.id, 60 * 60 * 1000); // Snooze for 1 hour
    if (sheetService) {
        await loadNotifications(sheetService); // Refresh the list
    }
  };
  
  const groupedItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    let itemsToGroup = sorted;
    if (filter === 'unread') {
      itemsToGroup = sorted.filter(item => !item.read);
    } else if (filter === 'needs_attention') {
      itemsToGroup = sorted.filter(item => 
        !item.read || 
        item.priority === 'high' || 
        ['CALL_NOW', 'SEND_WHATSAPP', 'PUSH_NEGOTIATION', 'SHARE_PROPOSAL'].includes(item.nextAction || '')
      );
    }
    return groupAndSortNotifications(itemsToGroup);
  }, [items, filter]);

  return (
    <PullToRefresh onRefresh={async () => sheetService && (await loadNotifications(sheetService))}>
      <div className="container mx-auto px-0 sm:px-4 py-4 sm:py-6 pb-[calc(var(--bottom-nav-height)+3rem)] animate-fade-in">
        <div className="px-4 mb-4">
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">Action Center</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Your prioritized notifications and tasks.</p>
        </div>

        <div className="flex items-center justify-between px-4 mb-2 border-b">
            <div className="flex items-center gap-2">
                <Button variant={filter === 'all' ? 'secondary' : 'ghost'} size="sm" onClick={() => setFilter('all')}>All</Button>
                <Button variant={filter === 'unread' ? 'secondary' : 'ghost'} size="sm" onClick={() => setFilter('unread')}>Unread</Button>
                <Button variant={filter === 'needs_attention' ? 'secondary' : 'ghost'} size="sm" onClick={() => setFilter('needs_attention')}>Needs Attention</Button>
            </div>
            <Button variant="ghost" size="sm" onClick={async () => {
                if (!sheetService) return;
                setItems(prev => prev.map(i => ({ ...i, read: true })));
                await markNotificationAsRead(sheetService, items.filter(i => !i.read));
            }} disabled={loading || items.every(i => i.read)}>
                <Archive className="h-4 w-4 mr-2" /> Mark all read
            </Button>
        </div>

        <Card className="shadow-none sm:shadow-soft border-0 sm:border">
          <CardContent className="p-0">
            {loading && items.length === 0 ? (
              <div className="text-center p-10 text-sm text-muted-foreground">Loading actions...</div>
            ) : groupedItems.length === 0 ? (
              <div className="text-center p-10 text-sm text-muted-foreground">Inbox zero!</div>
            ) : (
              <div>
                {groupedItems.map(group => (
                  <div key={group.key} className="mb-4 last:mb-0">
                    <h2 className="text-lg font-semibold px-4 py-2 bg-muted sticky top-0 z-10">{group.key}</h2>
                    <div className="divide-y">
                      {group.notifications.map(item => (
                        <ActionItem key={item.id} item={item} onClick={handleItemClick} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PullToRefresh>
  );
}
