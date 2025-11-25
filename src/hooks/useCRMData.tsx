import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/services/db";
import { GoogleSheetsService, SheetLead } from "@/lib/googleSheets";
import { secureStorage } from "@/lib/secureStorage";
import { authService } from "@/lib/authService";

// ✅ NEW imports for the dual notification system
import { triggerNativeNotification } from "@/lib/nativeNotifications";
import { notificationSettingsService } from "@/lib/notificationSettings";
import { stateManager } from "@/lib/stateManager";
import { diffLeads } from "@/utils/diffLeads";
import type { AppNotification } from "@/utils/notifications";
import { createNotification as createSheetNotification } from "@/services/notificationService";

export function useCRMData() {
  const [leads, setLeads] = useState<SheetLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const detectAndNotify = useCallback(async (freshLeads: SheetLead[]) => {
    const oldLeads = stateManager.getCachedLeads().leads || [];
    console.log('[useCRMData] detectAndNotify - Old Leads count:', oldLeads.length);
    console.log('[useCRMData] detectAndNotify - Fresh Leads count:', freshLeads.length);

    if (oldLeads.length === 0) {
      // Don't notify on the very first load, just cache and exit.
      stateManager.setCachedLeads(freshLeads);
      console.log('[useCRMData] detectAndNotify - Initial cache set, no diff performed.');
      return;
    }

    await authService.initialize();
    const currentUser = authService.getSession()?.user || null;
    if (!currentUser?.email) {
      stateManager.setCachedLeads(freshLeads);
      console.warn('[useCRMData] detectAndNotify - No current user, cache set, no diff performed.');
      return;
    }

    const diff = diffLeads(oldLeads, freshLeads, currentUser.email);

    // 1. Notify for new leads (summary)
    if (diff.newLeads.length > 0) {
      const relevantNewLeads: SheetLead[] = [];
      for (const lead of diff.newLeads) {
        if (!(await notificationSettingsService.isLeadSnoozed(lead.tripId))) {
          relevantNewLeads.push(lead);
        } else {
          console.log(`[useCRMData] New lead "${lead.tripId}" is snoozed. Skipping notification.`);
        }
      }
      if (relevantNewLeads.length > 0) {
        const notification: AppNotification = {
          id: `new-leads-${Date.now()}`,
          type: 'new_trip',
          title: `${relevantNewLeads.length} New Lead${relevantNewLeads.length > 1 ? 's' : ''}`,
          message: `New trips for ${relevantNewLeads.map(l => l.travellerName).join(', ')}.`,
          createdAt: new Date().toISOString(),
        };
        await triggerNativeNotification(notification);
        await createSheetNotification({
          sourceSheet: "Master Data",
          title: notification.title,
          message: notification.message,
          roleTarget: currentUser.role,
          userEmail: currentUser.email,
          type: "in-app",
          priority: "normal",
          timestamp: notification.createdAt,
        });
      }
    }

    // 2. Notify for leads newly assigned to the current user
    for (const lead of diff.assignedToCurrentUser) {
      if (await notificationSettingsService.isLeadSnoozed(lead.tripId)) {
        console.log(`[useCRMData] Assigned lead "${lead.tripId}" is snoozed. Skipping notification.`);
        continue; // Skip this notification
      }
      const notification: AppNotification = {
        id: `assigned-${lead.tripId || lead.travellerName}-${Date.now()}`,
        type: 'trip_assigned',
        title: 'New Trip Assigned to You',
        message: `The trip for "${lead.travellerName}" has been assigned to you.`,
        route: `/dashboard`,
        targetTravellerName: lead.travellerName,
        targetTripId: lead.tripId,
        createdAt: new Date().toISOString(),
      };
      await triggerNativeNotification(notification);
      await createSheetNotification({
        sourceSheet: "Master Data",
        title: notification.title,
        message: notification.message,
        roleTarget: currentUser.role,
        userEmail: currentUser.email,
        route: notification.route,
        targetTravellerName: notification.targetTravellerName,
        targetTripId: notification.targetTripId,
        type: "in-app",
        priority: "high",
        timestamp: notification.createdAt,
      });
    }

    // 3. Notify for newly booked leads
    if (diff.bookedLeads.length > 0) {
      const relevantBookedLeads: SheetLead[] = [];
      for (const lead of diff.bookedLeads) {
        if (!(await notificationSettingsService.isLeadSnoozed(lead.tripId))) {
          relevantBookedLeads.push(lead);
        } else {
          console.log(`[useCRMData] Booked lead "${lead.tripId}" is snoozed. Skipping notification.`);
        }
      }
      if (relevantBookedLeads.length > 0) {
        const notification: AppNotification = {
          id: `booked-leads-${Date.now()}`,
          type: 'trip_booked',
          title: `${relevantBookedLeads.length} Trip${relevantBookedLeads.length > 1 ? 's' : ''} Booked!`,
          message: `Congratulations! Trips for ${relevantBookedLeads.map(l => l.travellerName).join(', ')} were booked.`,
          createdAt: new Date().toISOString(),
        };
        await triggerNativeNotification(notification);
        await createSheetNotification({
          sourceSheet: "Master Data",
          title: notification.title,
          message: notification.message,
          roleTarget: currentUser.role,
          userEmail: currentUser.email,
          type: "in-app",
          priority: "high",
          timestamp: notification.createdAt,
        });
      }
    }

    // Finally, update the cache for the next diff.
    stateManager.setCachedLeads(freshLeads);
    console.log('[useCRMData] detectAndNotify - Cached leads updated with fresh leads. New count:', freshLeads.length);
  }, []);

  const syncData = useCallback(
    async (showLoading = false) => {
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }
      if (showLoading) setLoading(true);
      setError(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const dexieLeads = await db.leads.toArray();
        if (dexieLeads.length > 0 && !leads.length) {
          setLeads(dexieLeads);
        }

        const credentials = await secureStorage.getCredentials();
        if (!credentials?.googleSheetUrl) {
          throw new Error("Google Sheets credentials not configured.");
        }
        
        const localServiceAccountJson = localStorage.getItem("serviceAccountJson") || undefined;
        
        const svc = new GoogleSheetsService({
          apiKey: credentials.googleApiKey || "",
          serviceAccountJson: credentials.googleServiceAccountJson || localServiceAccountJson,
          sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || "",
          worksheetNames: credentials.worksheetNames,
          columnMappings: credentials.columnMappings,
        });

        const freshLeads = await svc.fetchLeads(true);
        if (controller.signal.aborted) return;

        await db.leads.clear();
        await db.leads.bulkAdd(freshLeads);
        
        setLeads(freshLeads);
        setLastSync(new Date());

        // ✅ Trigger the change detection
        await detectAndNotify(freshLeads);

      } catch (err) {
        if (!controller.signal.aborted) {
          console.error("Failed to sync CRM data:", err);
          setError(err instanceof Error ? err.message : "Failed to sync data");
          const cached = await db.leads.toArray();
          if (cached.length > 0) setLeads(cached);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [detectAndNotify]
  );

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      await syncData(true);
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        if (mounted && document.visibilityState === 'visible') {
          syncData(false);
        }
      }, 300000); // 5 minutes
    };

    initialize();

    const onFocus = () => syncData(false);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      mounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      abortControllerRef.current?.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [syncData]);

  return { leads, loading, error, lastSync, syncData };
}
