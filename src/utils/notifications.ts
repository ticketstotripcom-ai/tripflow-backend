import type { SheetService } from '@/hooks/useSheetService';

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
}

const NOTIFICATION_SHEET = 'Notifications';
const READ_COLUMN_INDEX = 5; // Zero-based index for column F (Read/Unread)

const normalizeEmail = (value?: string) => String(value || '').trim().toLowerCase();

// Support two schemas + optional deep-link columns:
// A) Legacy (user's sheet):
//   A: timestamp, B: source, C: title, D: message, E: role/target, F: read/unread, G: userEmail
// B) App default:
//   A: id, B: title, C: message, D: type, E: createdAt, F: TRUE/FALSE, G: userEmail
const mapRowToNotification = (row: any[], index: number): AppNotification | null => {
  if (!row || row.length === 0) return null;
  // Determine schema by checking if column C has a title-like value
  const hasUserSchema = Boolean(String(row[2] ?? '').trim());
  const createdAt = String((hasUserSchema ? row[0] : row[4]) ?? '').trim();
  const title = String((hasUserSchema ? row[2] : row[1]) ?? '').trim();
  const message = String((hasUserSchema ? row[3] : row[2]) ?? '').trim();
  const type = String((hasUserSchema ? row[4] : row[3]) ?? 'general').trim() as AppNotification['type'];
  const readRaw = String(row[5] ?? '').trim().toLowerCase();
  const readFlag = readRaw === 'true' || readRaw === 'read' || readRaw === 'yes' || readRaw === '1';
  const userEmail = String(row[6] ?? '').trim() || undefined;
  const route = String(row[7] ?? '').trim() || undefined;
  const targetTravellerName = String(row[8] ?? '').trim() || undefined;
  const targetDateTime = String(row[9] ?? '').trim() || undefined;
  const targetTripId = String(row[10] ?? '').trim() || undefined;
  const id = (hasUserSchema ? `${createdAt}|${userEmail || ''}|${title}` : String(row[0] || '').trim()) || `${Date.now()}|${index}`;
  return {
    id,
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
    sheetRowNumber: index + 2, // +2 because header row is removed in getRows helper
  };
};

export const createNotification = async (sheetService: Pick<SheetService, 'appendRow'>, n: AppNotification) => {
  // Write in user's schema: A timestamp, B source, C title, D message, E role/target, F read/unread, G userEmail
  const createdAt = n.createdAt || new Date().toISOString();
  await sheetService.appendRow(NOTIFICATION_SHEET, [
    createdAt,
    n.sourceSheet || 'Master Data',
    n.title,
    n.message,
    n.type,
    n.read ? 'READ' : 'UNREAD',
    n.userEmail || '',
    n.route || '',
    n.targetTravellerName || '',
    n.targetDateTime || '',
    n.targetTripId || ''
  ]);
  console.log(`✅ New notification appended to Google Sheet: ${createdAt} (${n.type})`);
};

export const fetchNotifications = async (sheetService: Pick<SheetService, 'getRows'>, email?: string): Promise<AppNotification[]> => {
  const rows = await sheetService.getRows(NOTIFICATION_SHEET, 'A2:K10000');
  const normalizedEmail = normalizeEmail(email);
  const notifications = rows
    .map((row: any[], index: number) => mapRowToNotification(row, index))
    .filter((n): n is AppNotification => !!n)
    .filter((n) => {
      if (n.read) return false;
      if (!normalizedEmail) return true;
      return normalizeEmail(n.userEmail) === normalizedEmail;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  console.log(`✅ Notification fetched for user: ${normalizedEmail || 'all'} (count: ${notifications.length})`);
  return notifications;
};

// Fetch all notifications (read and unread)
export const fetchAllNotifications = async (sheetService: Pick<SheetService, 'getRows'>, email?: string): Promise<AppNotification[]> => {
  const rows = await sheetService.getRows(NOTIFICATION_SHEET, 'A2:K10000');
  const normalizedEmail = normalizeEmail(email);
  const notifications = rows
    .map((row: any[], index: number) => mapRowToNotification(row, index))
    .filter((n): n is AppNotification => !!n)
    .filter((n) => {
      if (!normalizedEmail) return true;
      return normalizeEmail(n.userEmail) === normalizedEmail;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return notifications;
};

export const markNotificationAsRead = async (
  sheetService: SheetService,
  notification: AppNotification,
) => {
  if (!notification || notification.read || typeof notification.sheetRowNumber !== 'number') return;
  await sheetService.batchUpdateCells(NOTIFICATION_SHEET, [{
    row: notification.sheetRowNumber!,
    column: READ_COLUMN_INDEX,
    value: 'TRUE',
  }]);
};

export const markNotificationsAsRead = async (
  sheetService: SheetService,
  notifications: AppNotification[],
) => {
  if (!notifications || notifications.length === 0) return;

  const unread = notifications.filter((n) => !n.read && typeof n.sheetRowNumber === 'number');
  if (unread.length === 0) return;

  await sheetService.batchUpdateCells(NOTIFICATION_SHEET, unread.map((n) => ({
    row: n.sheetRowNumber!,
    column: READ_COLUMN_INDEX,
    value: 'TRUE',
  })));

  unread.forEach((n) => {
    console.log(`✅ Marked notification as read: ${n.id}`);
  });
};

export { NOTIFICATION_SHEET };
