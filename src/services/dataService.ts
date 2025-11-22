import { cacheService, changeQueue, mergeData } from "../utils/cacheService";
import { GoogleSheetsService } from "../lib/googleSheets";
import { secureStorage } from "../lib/secureStorage";

/**
 * Syncs new or updated data from Google Sheets since the last sync timestamp.
 * Loads from cache first, merges updates, and stores merged data back.
 */
export async function syncData() {
  const lastSync = await cacheService.getLastSync();
  
  try {
    // Get credentials
    const credentials = await secureStorage.getCredentials();
    if (!credentials) throw new Error('Google Sheets not configured');

    // Create sheets service
    const sheetsService = new GoogleSheetsService({
      apiKey: credentials.googleApiKey,
      serviceAccountJson: credentials.googleServiceAccountJson,
      sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
      worksheetNames: credentials.worksheetNames,
      columnMappings: credentials.columnMappings
    });

    // Fetch all data (Google Sheets doesn't support incremental sync natively)
    const updates = await sheetsService.fetchLeads(true); // force refresh

    const current = (await cacheService.getData()) || [];
    const merged = mergeData(current, updates);

    await cacheService.setData(merged);
    await cacheService.setLastSync(Date.now());

    return merged;
  } catch (error) {
    console.error('Sync error:', error);
    throw error;
  }
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
    const credentials = await secureStorage.getCredentials();
    if (!credentials) throw new Error('Google Sheets not configured');

    const sheetsService = new GoogleSheetsService({
      apiKey: credentials.googleApiKey,
      serviceAccountJson: credentials.googleServiceAccountJson,
      sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
      worksheetNames: credentials.worksheetNames,
      columnMappings: credentials.columnMappings
    });

    // For now, append the record as a new row
    await sheetsService.appendRow('MASTER DATA', record);
    return { success: true, message: "Record saved successfully" };
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
  
  if (pending.length === 0) {
    return;
  }

  console.log(`Attempting to sync ${pending.length} pending changes`);
  
  const failed: any[] = [];
  
  try {
    const credentials = await secureStorage.getCredentials();
    if (!credentials) throw new Error('Google Sheets not configured');

    const sheetsService = new GoogleSheetsService({
      apiKey: credentials.googleApiKey,
      serviceAccountJson: credentials.googleServiceAccountJson,
      sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
      worksheetNames: credentials.worksheetNames,
      columnMappings: credentials.columnMappings
    });

    for (const record of pending) {
      try {
        await sheetsService.appendRow('MASTER DATA', record);
        console.log('Successfully synced record:', record);
      } catch (error) {
        console.error('Failed to sync record:', record, error);
        failed.push(record);
      }
    }

    if (failed.length > 0) {
      // Re-queue failed items
      await changeQueue.clear();
      for (const record of failed) {
        await changeQueue.add(record);
      }
      
      throw new Error(`Failed to sync ${failed.length} records`);
    } else {
      // All items synced successfully
      await changeQueue.clear();
    }
  } catch (error) {
    console.error('Error pushing pending changes:', error);
  }
}