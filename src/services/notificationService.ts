// Notification service (improved):
// - Uses stable InternalId for deletes and offline idempotency
// - Header/column mapping by name (safe against column reordering)
// - Deletes oldest rows to control capacity (no ghost rows)
// - Skips empty rows on read
// - Offline store + syncOfflineNotifications()
// - Better error handling + enum normalization
// - Safer defaults and small ergonomics
//
// Google Sheet tab: "Notifications"
// Headers (row 1):
// Timestamp | Source Sheet | Title | Message | Role / Target | Read / Unread | UserEmail | route | targetTravellerName |
// targetDateTime | targetTripId | NotificationType | Priority | NextAction | InternalId

import { GoogleSheetsService } from "@/lib/googleSheets";
import { secureStorage } from "@/lib/secureStorage";
import { localSecrets, areSecretsConfigured } from "@/config/localSecrets";
import { openDB } from "idb";
import { toast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/config/api";

export type NotificationType =
  | "push"
  | "in-app"
  | "local"
  | "heads-up"
  | "badge"
  | "message";

export type NotificationPriority = "low" | "normal" | "high";

export interface Notification {
  id: string; // (legacy) row number for display only; NOT used for deletes anymore
  internalId: string; // stable identifier for deletes/idempotency
  timestamp: string;
  sourceSheet: string;
  title: string;
  message: string;
  roleTarget: string;
  read: boolean;
  userEmail: string;
  route?: string;
  targetTravellerName?: string;
  targetDateTime?: string;
  targetTripId?: string;
  type: NotificationType;
  priority: NotificationPriority;
  nextAction?: string;
}

export interface NewNotificationInput {
  sourceSheet: string;
  title: string;
  message: string;
  roleTarget: string;
  userEmail: string;
  route?: string;
  targetTravellerName?: string;
  targetDateTime?: string;
  targetTripId?: string;
  type?: NotificationType;
  priority?: NotificationPriority;
  timestamp?: string;
  nextAction?: string;
  internalId?: string; // if caller already has one; otherwise generated
}

const NOTIFICATIONS_SHEET = "Notifications";

const HEADER = [
  "Timestamp",
  "Source Sheet",
  "Title",
  "Message",
  "Role / Target",
  "Read / Unread",
  "UserEmail",
  "route",
  "targetTravellerName",
  "targetDateTime",
  "targetTripId",
  "NotificationType",
  "Priority",
  "NextAction",
  "InternalId",
] as const;

type HeaderName = (typeof HEADER)[number];

const READ_VALUE = "Read";
const UNREAD_VALUE = "Unread";

const ALLOWED_TYPES: NotificationType[] = [
  "push",
  "in-app",
  "local",
  "heads-up",
  "badge",
  "message",
];

const ALLOWED_PRIORITIES: NotificationPriority[] = [
  "low",
  "normal",
  "high",
];

// Keep workbook under cell limits
const MAX_NOTIFICATION_ROWS = 9000;
const TRIM_TO_ROWS = 7000;

// ------------------------ Sheets service bootstrap ------------------------

async function buildSheetService(): Promise<GoogleSheetsService> {
  const credentials = await secureStorage.getCredentials().catch(() => null);
  const secretsOk = areSecretsConfigured();
  if (!credentials && !secretsOk) {
    throw new Error("Google Sheets credentials not configured");
  }

  const localServiceAccountJson = (() => {
    try {
      return localStorage.getItem("serviceAccountJson") || undefined;
    } catch {
      return undefined;
    }
  })();

  const sheetUrl = credentials?.googleSheetUrl || localSecrets.spreadsheetUrl;
  const apiKey = credentials?.googleApiKey || localSecrets.googleApiKey || "";
  const serviceAccountJson =
    credentials?.googleServiceAccountJson ||
    localServiceAccountJson ||
    localSecrets.serviceAccountJson;

  const sheetId =
    sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || "";

  return new GoogleSheetsService({
    apiKey,
    serviceAccountJson,
    sheetId,
    worksheetNames: [NOTIFICATIONS_SHEET],
    columnMappings: {},
  });
}

async function getAccessHeaders(svc: GoogleSheetsService) {
  const token = await (svc as any).getAccessToken?.();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function valuesUrl(svc: GoogleSheetsService, rangeA1: string) {
  return `https://sheets.googleapis.com/v4/spreadsheets/${
    (svc as any).config.sheetId
  }/values/${encodeURIComponent(rangeA1)}`;
}

// ------------------------ Header / column mapping ------------------------

async function fetchAllRows(
  svc: GoogleSheetsService
): Promise<(string | number | null)[][]> {
  const url = valuesUrl(svc, NOTIFICATIONS_SHEET);
  const headers = await getAccessHeaders(svc);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.values || []) as (string | number | null)[][];
}

function normalizeHeaderCell(v: unknown) {
  return String(v ?? "").trim();
}

function buildColumnMap(headerRow: (string | number | null)[]) {
  const map: Partial<Record<HeaderName, number>> = {};
  for (let i = 0; i < headerRow.length; i++) {
    const name = normalizeHeaderCell(headerRow[i]);
    const idx = (HEADER as readonly string[]).indexOf(name);
    if (idx !== -1) {
      map[HEADER[idx]] = i;
    }
  }
  return map as Record<HeaderName, number>;
}

function assertHeaderCompatible(
  map: Record<HeaderName, number>,
  headerRow: (string | number | null)[]
) {
  // Ensure at least all required headers are present
  const missing = HEADER.filter((h) => map[h] === undefined);
  if (missing.length) {
    throw new Error(
      `Notifications sheet header mismatch. Missing: ${missing.join(", ")}. ` +
        `Found: ${headerRow.map(normalizeHeaderCell).join(" | ")}`
    );
  }
}

// ------------------------ Row mapping & validation ------------------------

function isRowEmpty(row: (string | number | null)[]) {
  return !row || row.every((c) => !String(c ?? "").trim());
}

function getCell(
  row: (string | number | null)[],
  col: number | undefined
): string {
  if (col === undefined) return "";
  return String(row[col] ?? "").trim();
}

function normalizeType(v: string): NotificationType {
  const t = v.toLowerCase();
  return (ALLOWED_TYPES.includes(t as NotificationType)
    ? (t as NotificationType)
    : "message");
}

function normalizePriority(v: string): NotificationPriority {
  const p = v.toLowerCase();
  return (ALLOWED_PRIORITIES.includes(p as NotificationPriority)
    ? (p as NotificationPriority)
    : "normal");
}

function mapRowToNotification(
  row: (string | number | null)[],
  rowNumber1Based: number,
  COL: Record<HeaderName, number>
): Notification | null {
  if (isRowEmpty(row)) return null;

  const internalId = getCell(row, COL["InternalId"]);
  if (!internalId) return null; // stable id required

  const readVal = getCell(row, COL["Read / Unread"]).toLowerCase();
  const typeVal = getCell(row, COL["NotificationType"]);
  const prioVal = getCell(row, COL["Priority"]);

  return {
    id: String(rowNumber1Based),
    internalId,
    timestamp: getCell(row, COL["Timestamp"]),
    sourceSheet: getCell(row, COL["Source Sheet"]),
    title: getCell(row, COL["Title"]),
    message: getCell(row, COL["Message"]),
    roleTarget: getCell(row, COL["Role / Target"]),
    read: readVal === READ_VALUE.toLowerCase(),
    userEmail: getCell(row, COL["UserEmail"]),
    route: getCell(row, COL["route"]) || undefined,
    targetTravellerName:
      getCell(row, COL["targetTravellerName"]) || undefined,
    targetDateTime: getCell(row, COL["targetDateTime"]) || undefined,
    targetTripId: getCell(row, COL["targetTripId"]) || undefined,
    type: normalizeType(typeVal),
    priority: normalizePriority(prioVal),
    nextAction: getCell(row, COL["NextAction"]) || undefined,
  };
}

// ------------------------ Writes ------------------------

async function appendRows(
  svc: GoogleSheetsService,
  rows: (string | number | null)[][]
) {
  const url = `${valuesUrl(
    svc,
    NOTIFICATIONS_SHEET
  )}:append?valueInputOption=USER_ENTERED`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await getAccessHeaders(svc)),
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ values: rows }),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function getSheetNumericId(svc: GoogleSheetsService): Promise<number> {
  const sheetMetadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${
    (svc as any).config.sheetId
  }?fields=sheets.properties`;

  const headers = await getAccessHeaders(svc);
  const res = await fetch(sheetMetadataUrl, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch sheet metadata: ${await res.text()}`);
  }

  const data = await res.json();
  const sheet = (data.sheets || []).find(
    (s: any) => s.properties?.title === NOTIFICATIONS_SHEET
  );
  if (!sheet) throw new Error(`Sheet "${NOTIFICATIONS_SHEET}" not found`);
  return sheet.properties.sheetId;
}

async function deleteRowsRange(
  svc: GoogleSheetsService,
  startRow1Based: number,
  endRow1BasedExclusive: number
) {
  if (startRow1Based < 2) startRow1Based = 2; // never delete header
  if (endRow1BasedExclusive <= startRow1Based) return;

  const sheetId = await getSheetNumericId(svc);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${
    (svc as any).config.sheetId
  }:batchUpdate`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await getAccessHeaders(svc)),
  };

  const startIndex0 = startRow1Based - 1;
  const endIndex0 = endRow1BasedExclusive - 1;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: startIndex0,
              endIndex: endIndex0,
            },
          },
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(await res.text());
}

async function ensureCapacity(
  svc: GoogleSheetsService,
  rows: (string | number | null)[][]
) {
  // rows includes header at index 0
  const count = Math.max(0, rows.length - 1);

  if (count > MAX_NOTIFICATION_ROWS) {
    const deleteCount = Math.max(0, count - TRIM_TO_ROWS);
    if (deleteCount > 0) {
      // Delete oldest rows immediately below header
      await deleteRowsRange(svc, 2, 2 + deleteCount);
      console.log(
        `[notificationService] Deleted ${deleteCount} old notification rows.`
      );
    }
  }
}

// ------------------------ Offline store ------------------------

async function openOfflineDb() {
  return openDB("notifications-db", 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains("notifications")) {
        d.createObjectStore("notifications", { keyPath: "internalId" });
      }
    },
  });
}

async function writeOffline(
  items: NewNotificationInput | NewNotificationInput[]
) {
  const list = Array.isArray(items) ? items : [items];

  try {
    const db = await openOfflineDb();
    const tx = db.transaction("notifications", "readwrite");
    const store = tx.objectStore("notifications");

    for (const input of list) {
      const now = input.timestamp || new Date().toISOString();
      const internalId =
        input.internalId ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      await store.put({
        internalId,
        createdAt: now,
        title: input.title,
        message: input.message,
        read: false,
        userEmail: input.userEmail.toLowerCase(),
        route: input.route,
        sourceSheet: input.sourceSheet,
        roleTarget: input.roleTarget,
        targetTravellerName: input.targetTravellerName,
        targetDateTime: input.targetDateTime,
        targetTripId: input.targetTripId,
        type: input.type || "message",
        priority: input.priority || "normal",
        nextAction: input.nextAction,
      });
    }

    await tx.done;
  } catch (err) {
    console.warn("[notificationService] writeOffline failed:", err);
  }
}

export async function syncOfflineNotifications(): Promise<void> {
  // Sheets sync disabled: notifications now live only in device local storage.
  return;
}

// ------------------------ Public API ------------------------

export async function getUserNotifications(
  userEmail: string
): Promise<Notification[]> {
  if (!userEmail) return [];
  const emailLower = userEmail.toLowerCase();

  try {
    // Resolve backend secret for secured API
    const creds = await secureStorage.getCredentials().catch(() => null);
    const notifySecret = creds?.notifySecret;

    const headers: Record<string, string> = {};
    if (notifySecret) {
      headers["x-tripflow-secret"] = notifySecret;
    }

    // 1) Fetch from backend DB
    const res = await fetch(
      `${API_BASE_URL}/api/notifications?userEmail=${encodeURIComponent(
        userEmail
      )}`,
      { headers }
    );
    if (!res.ok) {
      throw new Error(`backend responded ${res.status}`);
    }
    const backendItems: any[] = await res.json();

    // 2) Normalize + cache into IndexedDB for offline use
    const db = await openOfflineDb();
    const tx = db.transaction("notifications", "readwrite");
    const store = tx.objectStore("notifications");
    // Clear existing
    const existingKeys = await store.getAllKeys();
    for (const key of existingKeys) {
      await store.delete(key as string);
    }

    const mapped: Notification[] = [];

    for (const raw of backendItems) {
      const internalId = String(
        raw.internalId || raw.id || `${Date.now()}-${Math.random()}`
      );
      const notif: Notification = {
        id: internalId,
        internalId,
        timestamp: String(raw.createdAt || new Date().toISOString()),
        sourceSheet: String(raw.source || "WS"),
        title: String(raw.title || "Notification"),
        message: String(raw.message || ""),
        roleTarget: String(raw.roleTarget || "all"),
        read: !!raw.read,
        userEmail: emailLower,
        route: raw.route || undefined,
        targetTravellerName: raw.meta?.travellerName || raw.targetTravellerName,
        targetDateTime: raw.meta?.dateAndTime || raw.targetDateTime,
        targetTripId: raw.meta?.tripId || raw.targetTripId,
        type: (raw.type as NotificationType) || "message",
        priority: (raw.priority as NotificationPriority) || "normal",
        nextAction: raw.nextAction || undefined,
      };

      mapped.push(notif);

      await store.put({
        internalId,
        createdAt: notif.timestamp,
        title: notif.title,
        message: notif.message,
        read: notif.read,
        userEmail: notif.userEmail,
        route: notif.route,
        sourceSheet: notif.sourceSheet,
        roleTarget: notif.roleTarget,
        targetTravellerName: notif.targetTravellerName,
        targetDateTime: notif.targetDateTime,
        targetTripId: notif.targetTripId,
        type: notif.type,
        priority: notif.priority,
        nextAction: notif.nextAction,
      });
    }

    await tx.done;

    return mapped.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (err) {
    console.warn(
      "[notificationService] getUserNotifications backend failed, falling back to local IndexedDB:",
      err
    );

    try {
      const db = await openOfflineDb();
      const all = await db.getAll("notifications");
      const items: Notification[] = all
        .filter(
          (n: any) => String(n.userEmail || "").toLowerCase() === emailLower
        )
        .map((n: any, idx: number) => ({
          id: String(n.internalId || n.id || idx),
          internalId: String(n.internalId || n.id || idx),
          timestamp: String(
            n.createdAt || n.timestamp || new Date().toISOString()
          ),
          sourceSheet: String(n.sourceSheet || "WS"),
          title: String(n.title || "Notification"),
          message: String(n.message || n.text || ""),
          roleTarget: String(n.roleTarget || "all"),
          read: !!n.read,
          userEmail: emailLower,
          route: n.route || undefined,
          targetTravellerName: n.targetTravellerName || undefined,
          targetDateTime: n.targetDateTime || undefined,
          targetTripId: n.targetTripId || undefined,
          type: (n.type as NotificationType) || "message",
          priority: (n.priority as NotificationPriority) || "normal",
          nextAction: n.nextAction || undefined,
        }));

      return items.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (e2) {
      console.warn(
        "[notificationService] getUserNotifications local fallback failed:",
        e2
      );
      return [];
    }
  }
}

// Legacy signature kept, but now prefers internalId
export async function markNotificationRead(
  notification: Notification | string
): Promise<void> {
  const internalId =
    typeof notification === "string"
      ? notification
      : notification.internalId || "";

  if (!internalId) return;

  try {
    const db = await openOfflineDb();
    const tx = db.transaction("notifications", "readwrite");
    const store = tx.objectStore("notifications");
    await store.delete(internalId);
    await tx.done;
  } catch (err) {
    console.warn("[notificationService] markNotificationRead failed:", err);
  }

  // Best-effort backend sync
  try {
    const creds = await secureStorage.getCredentials().catch(() => null);
    const notifySecret = creds?.notifySecret;

    const headers: Record<string, string> = {};
    if (notifySecret) {
      headers["x-tripflow-secret"] = notifySecret;
    }

    await fetch(`${API_BASE_URL}/api/notifications/${encodeURIComponent(
      internalId
    )}/read`, {
      method: "PATCH",
      headers,
    });
  } catch (err) {
    console.warn("[notificationService] backend mark read failed:", err);
  }
}

function toRow(input: NewNotificationInput): (string | number | null)[] {
  const now = input.timestamp || new Date().toISOString();
  const internalId =
    input.internalId ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const type = input.type || "message";
  const priority = input.priority || "normal";

  return [
    now, // Timestamp
    input.sourceSheet || "",
    input.title || "",
    input.message || "",
    input.roleTarget || "",
    UNREAD_VALUE, // Read / Unread
    input.userEmail.toLowerCase(),
    input.route || "",
    input.targetTravellerName || "",
    input.targetDateTime || "",
    input.targetTripId || "",
    type,
    priority,
    input.nextAction || "",
    internalId,
  ];
}

export async function createNotification(
  input: NewNotificationInput
): Promise<void> {
  if (!input.userEmail) return;
  await writeOffline(input);
}

export async function createNotifications(
  inputs: NewNotificationInput[]
): Promise<void> {
  if (!inputs.length) return;
  await writeOffline(inputs);
}
