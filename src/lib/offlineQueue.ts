import { GoogleSheetsService, SheetLead, GoogleSheetsConfig } from "./googleSheets";

export type QueuedAction =
  | { type: "appendLead"; config: GoogleSheetsConfig; lead: Partial<SheetLead> }
  | { type: "updateLead"; config: GoogleSheetsConfig; identity: { dateAndTime: string; travellerName: string }; updates: Partial<SheetLead> };

const STORAGE_KEY = "crm_offline_queue_v1";

async function readQueue(): Promise<QueuedAction[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedAction[];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedAction[]): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

export async function enqueue(action: QueuedAction): Promise<void> {
  const q = await readQueue();
  q.push(action);
  await writeQueue(q);
}

export async function processQueue(): Promise<void> {
  if (!navigator.onLine) return;
  const q = await readQueue();
  if (q.length === 0) return;

  const remaining: QueuedAction[] = [];
  for (const item of q) {
    try {
      const service = new GoogleSheetsService(item.config);
      if (item.type === "appendLead") {
        await service.appendLead(item.lead);
      } else if (item.type === "updateLead") {
        await service.updateLead(item.identity, item.updates);
      }
    } catch (e) {
      // Keep the action if it still fails (probably offline or server error)
      remaining.push(item);
    }
  }
  await writeQueue(remaining);
}

export function setupOfflineSync(): void {
  window.addEventListener("online", () => {
    processQueue().catch(() => {});
  });
}
