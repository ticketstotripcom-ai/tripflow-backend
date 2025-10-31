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
}

const NOTIFICATION_SHEET = 'Notification';
const READ_COLUMN_INDEX = 5; // Zero-based index for the "Read" column

const normalizeEmail = (value?: string) => String(value || '').trim().toLowerCase();

const mapRowToNotification = (row: any[], index: number): AppNotification | null => {
  if (!row || row.length === 0) return null;
  const id = String(row[0] || '').trim();
  if (!id) return null;
  const readFlag = String(row[5] ?? '').trim().toLowerCase() === 'true';
  return {
    id,
    title: String(row[1] ?? '').trim(),
    message: String(row[2] ?? '').trim(),
    type: (String(row[3] ?? '').trim() || 'general') as AppNotification['type'],
    createdAt: String(row[4] ?? '').trim(),
    read: readFlag,
    userEmail: String(row[6] ?? '').trim() || undefined,
    sheetRowNumber: index + 2, // +2 because header row is removed in getRows helper
  };
};

export const createNotification = async (sheetService: Pick<SheetService, 'appendRow'>, n: AppNotification) => {
  await sheetService.appendRow(NOTIFICATION_SHEET, [
    n.id,
    n.title,
    n.message,
    n.type,
    n.createdAt,
    n.read ? 'TRUE' : 'FALSE',
    n.userEmail || ''
  ]);
  console.log(`✅ New notification appended to Google Sheet: ${n.id} (${n.type})`);
};

export const fetchNotifications = async (sheetService: Pick<SheetService, 'getRows'>, email?: string): Promise<AppNotification[]> => {
  const rows = await sheetService.getRows(NOTIFICATION_SHEET);
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
