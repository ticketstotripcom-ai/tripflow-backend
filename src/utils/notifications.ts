import type { SheetService } from '@/hooks/useSheetService';
import { openDB } from "idb";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'tripReminder' | 'newLead' | 'leadAssigned' | 'leadClosed' | 'followUp' | 'general' | 'admin' | 'blackboard';
  createdAt: string;
  read: boolean;
  userEmail?: string;
  sheetRowNumber?: number;
  route?: string;
  targetTravellerName?: string;
  targetDateTime?: string;
  targetTripId?: string;
  sourceSheet?: string;
  scheduleAt?: Date; // ✅ NEW property for scheduled notifications
  internalId?: string; // ✅ NEW property for unique ID in offline store
}

const NOTIFICATION_SHEET = 'Notifications';
const READ_COLUMN_INDEX = 5; // Zero-based index for column F (Read/Unread)

const normalizeEmail = (value?: string) => String(value || '').trim().toLowerCase();

const mapRowToNotification = (row: any[], index: number): AppNotification | null => {
  if (!row || row.length === 0) return null;
  const createdAt = String(row[0] ?? '').trim();
  const title = String(row[2] ?? '').trim();
  const message = String(row[3] ?? '').trim();
  const type = String(row[11] ?? 'general').trim() as AppNotification['type'];
  const readRaw = String(row[5] ?? '').trim().toLowerCase();
  const readFlag = readRaw === 'true' || readRaw === 'read' || readRaw === 'yes' || readRaw === '1';
  const userEmail = String(row[6] ?? '').trim() || undefined;
  const route = String(row[7] ?? '').trim() || undefined;
  const targetTravellerName = String(row[8] ?? '').trim() || undefined;
  const targetDateTime = String(row[9] ?? '').trim() || undefined;
  const targetTripId = String(row[10] ?? '').trim() || undefined;
  const internalId = String(row[14] ?? '').trim() || undefined; // Assuming column O for internalId
  const internalId = String(row[14] ?? '').trim() || undefined; // Assuming column O for internalId
  // Fallback ID: if internalId from sheet isn't available, create a unique one
  const id = internalId || `${createdAt}|${userEmail || ''}|${title}|${index}`;

  return {
    id, // Use internalId as the primary key if available from sheet
    title,
    message,
    type,
    createdAt: createdAt || new Date().toISOString(),
    read: readFlag,
    userEmail,
    route,
    targetTravellerName,
    targetDateTime,
    targetTripId,
    sheetRowNumber: index + 2,
    internalId: internalId || id, // Ensure internalId is always present
  };
  };
};

// Function to read notifications from IndexedDB
export async function readOfflineNotifications(): Promise<AppNotification[]> {
  try {
    const db = await openDB("notifications-db", 1);
    const tx = db.transaction("notifications", "readonly");
    const store = tx.objectStore("notifications");
    const offlineNotifs = await store.getAll();
    await tx.done;
    return offlineNotifs.map(n => ({
        ...n,
        // Ensure id matches internalId for offline items for consistent deduplication
        id: n.internalId, 
        // Ensure read status is boolean, it's stored as boolean in IndexedDB
        read: !!n.read,
    }));
  } catch (e) {
    console.warn('Failed to read offline notifications:', e);
    return [];
  }
}

// Fetch all notifications (read and unread)
export const fetchAllNotifications = async (sheetService: Pick<SheetService, 'getRows'>, email?: string): Promise<AppNotification[]> => {
  const normalizedEmail = normalizeEmail(email);
  
  // Fetch from Google Sheet
  const rows = await sheetService.getRows(NOTIFICATION_SHEET, 'A2:O10000'); // Assuming up to column O for internalId
  const sheetNotifications = rows
    .map((row: any[], index: number) => mapRowToNotification(row, index))
    .filter((n): n is AppNotification => !!n)
    .filter((n) => {
      if (!normalizedEmail) return true;
      return normalizeEmail(n.userEmail) === normalizedEmail;
    });

  // Fetch from IndexedDB
  const offlineNotifications = await readOfflineNotifications();

  // Merge and deduplicate
  const mergedNotificationsMap = new Map<string, AppNotification>();

  // Add sheet notifications first (they take precedence)
  sheetNotifications.forEach(notif => {
      if (notif.internalId) {
          mergedNotificationsMap.set(notif.internalId, notif);
      } else {
          // Fallback if internalId is missing from sheet (shouldn't happen with updated mapRowToNotification)
          mergedNotificationsMap.set(notif.id, notif);
      }
  });

  // Add offline notifications, but only if they don't already exist from the sheet
  offlineNotifications.forEach(notif => {
      if (notif.internalId && !mergedNotificationsMap.has(notif.internalId)) {
          mergedNotificationsMap.set(notif.internalId, notif);
      } else if (!mergedNotificationsMap.has(notif.id)) { // Fallback if internalId missing
          mergedNotificationsMap.set(notif.id, notif);
      }
  });

  const notifications = Array.from(mergedNotificationsMap.values());
    
  notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  console.log(`✅ Fetched and merged notifications for user: ${normalizedEmail || 'all'} (count: ${notifications.length})`);
  return notifications;
};
export const markNotificationAsRead = async (
  sheetService: SheetService,
  notification: AppNotification,
) => {
  if (!notification || notification.read) return;

  // Mark as read in Google Sheet if it came from there
  if (typeof notification.sheetRowNumber === 'number') {
    await sheetService.batchUpdateCells(NOTIFICATION_SHEET, [{
      row: notification.sheetRowNumber!,
      column: READ_COLUMN_INDEX,
      value: 'TRUE',
    }]);
  }

  // Remove from IndexedDB if it exists there (it means it was offline-persisted)
  if (notification.internalId) {
    try {
      const db = await openDB("notifications-db", 1);
      await db.delete("notifications", notification.internalId);
      await db.close();
    } catch (e) {
      console.warn('Failed to remove notification from IndexedDB on read:', e);
    }
  }
};

export const markNotificationsAsRead = async (
  sheetService: SheetService,
  notifications: AppNotification[],
) => {
  if (!notifications || notifications.length === 0) return;

  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) return;

  const sheetUpdates = unread.filter(n => typeof n.sheetRowNumber === 'number').map((n) => ({
    row: n.sheetRowNumber!,
    column: READ_COLUMN_INDEX,
    value: 'TRUE',
  }));

  if (sheetUpdates.length > 0) {
    await sheetService.batchUpdateCells(NOTIFICATION_SHEET, sheetUpdates);
  }

  // Remove from IndexedDB for all unread notifications
  for (const n of unread) {
    if (n.internalId) {
      try {
        const db = await openDB("notifications-db", 1);
        await db.delete("notifications", n.internalId);
        await db.close();
      } catch (e) {
        console.warn('Failed to remove notification from IndexedDB on mark all read:', e);
      }
    }
  }

  unread.forEach((n) => {
    console.log(`✅ Marked notification as read: ${n.id}`);
  });
};

export { NOTIFICATION_SHEET };
