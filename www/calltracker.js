import { registerPlugin } from '@capacitor/core';

// Capacitor plugin binding
const CallTracker = registerPlugin('CallTracker');

// Simple event listener registry
export function addListener(cb) {
  return CallTracker.addListener('callEvent', cb);
}

export async function requestPermissions() {
  await CallTracker.requestPermissions();
}

export async function start() {
  await CallTracker.startService();
}

export async function stop() {
  await CallTracker.stopService();
}

/**
 * matchNumberAndWriteToSheet
 * Tries to match an incoming/outgoing call event with a lead/customer by phone number,
 * and appends a row to the Master Data sheet using the Sheets v4 append endpoint.
 *
 * @param {Object} eventObj  Call event from native layer { number, event, startTimestamp, endTimestamp, durationSeconds, incoming }
 * @param {Object} options   { sheetId, apiKey, sheetName="Master Data", columnMappings }
 *                           columnMappings defaults to { number:"P", name:"E", status:"D", remark:"K" }
 * @param {Function} leadResolver optional async (number) => { travellerName, tripId }
 */
export async function matchNumberAndWriteToSheet(eventObj, options = {}, leadResolver) {
  if (!eventObj) return;
  const { number } = eventObj;
  const sheetId = options.sheetId;
  const apiKey = options.apiKey;
  const sheetName = options.sheetName || 'Master Data';
  const columnMappings = options.columnMappings || { number: 'P', name: 'E', status: 'D', remark: 'K' };
  if (!sheetId || !apiKey) {
    console.warn('[calltracker] sheetId/apiKey missing');
    return;
  }

  let resolved = { travellerName: '', tripId: '' };
  if (typeof leadResolver === 'function') {
    try { resolved = (await leadResolver(number)) || resolved; } catch {}
  }

  const startIso = eventObj.startTimestamp ? new Date(eventObj.startTimestamp).toISOString() : '';
  const endIso = eventObj.endTimestamp ? new Date(eventObj.endTimestamp).toISOString() : '';
  const remark = [
    `Call Event: ${eventObj.event}`,
    `Incoming: ${!!eventObj.incoming}`,
    `Duration(s): ${eventObj.durationSeconds || 0}`,
    startIso ? `Start: ${startIso}` : null,
    endIso ? `End: ${endIso}` : null,
  ].filter(Boolean).join(' | ');

  // Build row per Master Data structure; we only populate a few columns and leave others blank.
  // Index by column letter where possible.
  const toIndex = (letter) => {
    let idx = 0;
    letter = (letter || '').toUpperCase();
    for (let i = 0; i < letter.length; i++) {
      idx = idx * 26 + (letter.charCodeAt(i) - 64);
    }
    return idx - 1;
  };

  const row = Array(30).fill('');
  row[toIndex(columnMappings.number)] = number || '';
  row[toIndex(columnMappings.name)] = resolved.travellerName || '';
  row[toIndex(columnMappings.status)] = 'Follow-up Calls';
  row[toIndex(columnMappings.remark)] = remark;

  // Append via Sheets API
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED&key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] })
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn('[calltracker] append failed', text);
  }
}

export default {
  addListener,
  requestPermissions,
  start,
  stop,
  matchNumberAndWriteToSheet,
};
