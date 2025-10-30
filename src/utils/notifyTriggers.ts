import { createNotification, AppNotification } from './notifications';
import { useSheetService } from '@/hooks/useSheetService';

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const notifyUser = async (email: string, title: string, message: string, type: AppNotification['type'] = 'general') => {
  const sheetService = await useSheetService();
  await createNotification(sheetService, {
    id: uuid(), title, message, type, createdAt: new Date().toISOString(),
    read: false, userEmail: email
  });
};

export const notifyAll = async (title: string, message: string, type: AppNotification['type'] = 'general') => {
  const sheetService = await useSheetService();
  const users = await sheetService.getRows('Users');
  for (const u of users) {
    const email = u?.[1] || u?.email || u?.Email || u?.E || u?.D; // best-effort mapping
    if (!email) continue;
    await createNotification(sheetService, {
      id: uuid(), title, message, type, createdAt: new Date().toISOString(),
      read: false, userEmail: typeof email === 'string' ? email : String(email)
    });
  }
};

export const notifyAdmin = async (title: string, message: string) => {
  const sheetService = await useSheetService();
  const users = await sheetService.getRows('Users');
  for (const u of users) {
    const role = (u?.role || u?.M || u?.[12] || '').toString().toLowerCase(); // column M per template
    const email = u?.[1] || u?.email || u?.Email || u?.E || u?.D;
    if (role.includes('admin') && email) {
      await createNotification(sheetService, {
        id: uuid(), title, message, type: 'admin', createdAt: new Date().toISOString(),
        read: false, userEmail: typeof email === 'string' ? email : String(email)
      });
    }
  }
};
