export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'tripReminder' | 'newLead' | 'leadAssigned' | 'leadClosed' | 'followUp' | 'general' | 'admin';
  createdAt: string;
  read: boolean;
  userEmail?: string;
}

export const createNotification = async (sheetService: { appendRow: Function }, n: AppNotification) => {
  await sheetService.appendRow('notifications', [
    n.id,
    n.title,
    n.message,
    n.type,
    n.createdAt,
    n.read ? 'TRUE' : 'FALSE',
    n.userEmail || ''
  ]);
};

export const fetchNotifications = async (sheetService: { getRows: Function }, email?: string): Promise<AppNotification[]> => {
  const rows = await sheetService.getRows('notifications');
  return rows
    .filter((r: any[]) => r && r.length)
    .filter((r: any[]) => (String(r[5]).toUpperCase() !== 'TRUE') && (!email || String(r[6] || '').toLowerCase() === String(email || '').toLowerCase() || !r[6]))
    .map((r: any[]) => ({
      id: r[0],
      title: r[1],
      message: r[2],
      type: r[3],
      createdAt: r[4],
      read: String(r[5]).toUpperCase() === 'TRUE',
      userEmail: r[6] || undefined,
    }));
};
