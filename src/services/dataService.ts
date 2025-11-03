import { cacheService, changeQueue } from "../utils/cacheService";
import { GoogleSheetsService } from "../lib/googleSheets"; // ✅ adjust import if path differs

/**
 * Syncs new or updated data from Google Sheets since the last sync timestamp.
 * Loads from cache first, merges updates, and stores merged data back.
 */
export async function syncData() {
  const lastSync = await cacheService.getLastSync();

  // ✅ Fetch updates directly from Google Sheets
  const updates = await GoogleSheetsService.getUpdatesSince
    ? await GoogleSheetsService.getUpdatesSince(lastSync)
    : await GoogleSheetsService.getAllData(); // fallback if incremental not implemented

  const current = (await cacheService.getData()) || [];
  const merged = mergeData(current, updates);

  await cacheService.setData(merged);
  await cacheService.setLastSync(Date.now());

  return merged;
}

/**
 * Merges old data with updates based on unique record ID.
 */
function mergeData(oldData: any[], updates: any[]) {
  const map = new Map(oldData.map((item) => [item.id, item]));
  updates.forEach((u) => map.set(u.id, { ...map.get(u.id), ...u }));
  return Array.from(map.values());
}

/**
 * Saves a record — either queues it offline or writes directly to Google Sheets.
 */
export async function saveRecord(record: any) {
  // If offline, queue change locally
  if (!navigator.onLine) {
    await changeQueue.add(record);
    return { success: true, offline: true, message: "Saved offline — will sync later" };
  }

  // ✅ Save to Google Sheets immediately
  try {
    const result = await GoogleSheetsService.saveRecord(record);
    return { success: true, ...result };
  } catch (err) {
    console.error("Error saving to Google Sheets:", err);
    return { success: false, error: err };
  }
}

/**
 * Pushes any queued offline edits to Google Sheets once online.
 */
export async function pushPendingChanges() {
  const pending = await changeQueue.getAll();
  if (!pending.length || !navigator.onLine) return;

  for (const record of pending) {
    try {
      await GoogleSheetsService.saveRecord(record);
    } catch (err) {
      console.error("Failed to sync offline record:", record, err);
    }
  }

  await changeQueue.clear();
}
