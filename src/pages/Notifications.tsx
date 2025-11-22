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

export default function NotificationsPage() {
  const navigate = useNavigate();
  // Use hook at top-level; avoid calling hooks inside effects
  const { service: sheetService } = useSheetService();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showingCached, setShowingCached] = useState(false);

  const loadNotifications = async (service: GoogleSheetsService) => {
    try {
      setLoading(true);
      // SWR: show cached notifications first
      try {
        const cached = await cacheGet<AppNotification[]>("crm_notifications_all_cache_v1", 10 * 60 * 1000);
        if (cached && cached.length) {
          setItems(cached);
          setShowingCached(true);
        }
      } catch {}
      const all = await fetchAllNotifications(service);
      setItems(all);
      setShowingCached(false);
      await cacheSet("crm_notifications_all_cache_v1", all);
    } catch (e) {
      console.warn('Notifications page: failed to load notifications', e);
      // Keep showing cached if available
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sheetService) {
      loadNotifications(sheetService);
    }
  }, [sheetService]);

  const filtered = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      if (a.read && !b.read) return 1;
      if (!a.read && b.read) return -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return sorted.filter((n) => (showUnreadOnly ? !n.read : true));
  }, [items, showUnreadOnly]);

  const handleOpen = async (n: AppNotification) => {
    try { if (sheetService) await markNotificationAsRead(sheetService, n); } catch {}
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));

    // Deep-link support
    if (n.route) {
      navigate(n.route);
      return;
    }
    if (n.targetTravellerName || n.targetDateTime || n.targetTripId) {
      stateManager.setPendingTarget({
        travellerName: n.targetTravellerName,
        dateAndTime: n.targetDateTime,
        tripId: n.targetTripId,
      });
      navigate('/dashboard?view=analytics');
      return;
    }

    // Extract traveller name from message as heuristic
    const msg = (n.message || '').trim();
    let key = '';
    // Quoted name first: "Ankush Kalekar"
    const mQuoted = msg.match(/"([^\"]{2,80})"/);
    if (mQuoted && mQuoted[1]) key = mQuoted[1].trim();
    // "for NAME assigned" pattern (optional quotes)
    if (!key) {
      const mFor = msg.match(/\bfor\s+["']?([A-Za-z][A-Za-z\s.'-]{1,80})["']?\s+assigned\b/i);
      if (mFor && mFor[1]) key = mFor[1].trim();
    }
    // "NAME booked" pattern
    if (!key) {
      const mBooked = msg.match(/^([A-Za-z][A-Za-z\s.'-]{1,80})\s+booked\b/i);
      if (mBooked && mBooked[1]) key = mBooked[1].trim();
    }
    // Fallback: first capitalized phrase
    if (!key) {
      const words = msg.split(/\s+/);
      const start = words.findIndex(w => /^[A-Z]/.test(w));
      if (start >= 0) key = words.slice(start, start + 3).join(' ').trim();
    }
    // Final fallback: avoid generic title; use message sans separators
    if (!key) key = msg.replace(/[-–:]/g, ' ').trim();
    stateManager.setFilters({ searchQuery: key });
    navigate('/dashboard?view=analytics');
  };

  return (
    <PullToRefresh onRefresh={async () => sheetService && (await loadNotifications(sheetService))}>
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-6 pb-[calc(var(--bottom-nav-height)+3rem)] animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg sm:text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">Notifications</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={async () => {
              if (!sheetService) return;
              try {
                setLoading(true);
                await markNotificationAsRead(sheetService, items.filter(i => !i.read));
                setItems(prev => prev.map(i => ({ ...i, read: true })));
              } finally {
                setLoading(false);
              }
            }} disabled={loading || items.every(i => i.read)}>Mark all read</Button>
            <Button variant={showUnreadOnly ? 'outline' : 'default'} onClick={() => setShowUnreadOnly(false)} size="sm">All</Button>
            <Button variant={showUnreadOnly ? 'default' : 'outline'} onClick={() => setShowUnreadOnly(true)} size="sm">Unread</Button>
            <Button variant="outline" size="sm" onClick={() => sheetService && loadNotifications(sheetService)} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</Button>
          </div>
        </div>
        <Card className="shadow-soft">
          <CardHeader>
          <CardTitle className="text-sm">{filtered.length} item{filtered.length === 1 ? '' : 's'} {showingCached && <span className="text-[10px] text-muted-foreground">(cached)</span>}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && items.length === 0 ? (
              <div className="text-sm text-muted-foreground">Loading notifications...</div>
            ) : filtered.length === 0 ? (
              <div className="text-sm text-muted-foreground">No notifications to show.</div>
            ) : (
              <div className="divide-y">
                {filtered.map((n, idx) => (
                  <button key={`${n.id}|${idx}`} className="w-full text-left py-2 hover:bg-muted/40 rounded transition-colors" onClick={() => handleOpen(n)}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {n.title}
                          {!n.read && <div className="w-2 h-2 rounded-full bg-blue-500"></div>}
                        </div>
                        <div className="text-sm text-muted-foreground whitespace-pre-line">{(n.message || '').trim()}</div>
                      </div>
                      <div className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">{new Date(n.createdAt).toLocaleString()}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        {/* Spacer to ensure last content clears nav */}
        <div aria-hidden className='h-[calc(var(--bottom-nav-height)+3rem)]' />
      </div>
    </PullToRefresh>
  );
}



