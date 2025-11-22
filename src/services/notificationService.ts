// Notification service: reads/writes per-user notification rows in the Google Sheets "Notifications" tab.
// One row = one notification for one user; rows are deleted when read.
import { GoogleSheetsService } from "@/lib/googleSheets";
import { secureStorage } from "@/lib/secureStorage";

export type NotificationType = "push" | "in-app" | "local" | "heads-up" | "badge" | "message";
export type NotificationPriority = "low" | "normal" | "high";

export interface Notification {
  id: string; // sheet row number for deletion
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
  type?: NotificationType;
  priority?: NotificationPriority;
  nextAction?: string;
  notificationType?: string;
  internalId?: string;
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
  notificationType?: string;
  internalId?: string;
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
];

async function buildSheetService(): Promise<GoogleSheetsService> {
  const credentials = await secureStorage.getCredentials();
  if (!credentials) {
    throw new Error("Google Sheets credentials not configured");
  }
  const localServiceAccountJson = (() => {
    try {
      return localStorage.getItem("serviceAccountJson") || undefined;
    } catch {
      return undefined;
    }
  })();

  return new GoogleSheetsService({
    apiKey: credentials.googleApiKey || "",
    serviceAccountJson: credentials.googleServiceAccountJson || localServiceAccountJson,
    sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || "",
    worksheetNames: [NOTIFICATIONS_SHEET, NOTIFICATIONS_SHEET],
    columnMappings: {},
  });
}

async function getSheetId(svc: GoogleSheetsService): Promise<number> {
  const sheetMetadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${(svc as any).config.sheetId}?fields=sheets.properties`;
  const token = await (svc as any).getAccessToken?.();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(sheetMetadataUrl, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch sheet metadata: ${await res.text()}`);
  }
  const data = await res.json();
  const sheet = (data.sheets || []).find((s: any) => s.properties?.title === NOTIFICATIONS_SHEET);
  if (!sheet) throw new Error(`Sheet "${NOTIFICATIONS_SHEET}" not found`);
  return sheet.properties.sheetId;
}

function mapRowToNotification(row: (string | number | null)[], rowNumber: number): Notification | null {
  if (!row || row.length === 0) return null;
  const get = (i: number) => (row[i] ?? "").toString().trim();
  return {
    id: String(rowNumber),
    timestamp: get(0),
    sourceSheet: get(1),
    title: get(2),
    message: get(3),
    roleTarget: get(4),
    read: get(5).toLowerCase() === "read",
    userEmail: get(6),
    route: get(7) || undefined,
    targetTravellerName: get(8) || undefined,
    targetDateTime: get(9) || undefined,
    targetTripId: get(10) || undefined,
    type: (get(11) as NotificationType) || undefined,
    priority: (get(12) as NotificationPriority) || undefined,
    nextAction: get(13) || undefined,
    notificationType: get(11) || undefined,
    internalId: get(14) || undefined,
  };
}

async function appendRows(svc: GoogleSheetsService, rows: (string | number | null)[][]) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${(svc as any).config.sheetId}/values/${encodeURIComponent(
    NOTIFICATIONS_SHEET
  )}:append?valueInputOption=USER_ENTERED`;
  const token = await (svc as any).getAccessToken?.();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ values: rows }),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
}

async function deleteRow(svc: GoogleSheetsService, rowIndex1Based: number) {
  if (rowIndex1Based < 2) return; // never delete header
  const sheetId = await getSheetId(svc);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${(svc as any).config.sheetId}:batchUpdate`;
  const token = await (svc as any).getAccessToken?.();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const start = rowIndex1Based - 1;
  const end = rowIndex1Based;
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
              startIndex: start,
              endIndex: end,
            },
          },
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
}

export async function getUserNotifications(userEmail: string): Promise<Notification[]> {
  if (!userEmail) return [];
  const svc = await buildSheetService();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${(svc as any).config.sheetId}/values/${encodeURIComponent(
    NOTIFICATIONS_SHEET
  )}`;
  const token = await (svc as any).getAccessToken?.();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const data = await res.json();
  const rows: (string | number | null)[][] = data.values || [];
  if (!rows || rows.length <= 1) return [];
  const items: Notification[] = [];
  for (let i = 1; i < rows.length; i++) {
    const mapped = mapRowToNotification(rows[i], i + 1);
    if (mapped && mapped.userEmail.toLowerCase() === userEmail.toLowerCase()) {
      items.push(mapped);
    }
  }
  return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function markNotificationRead(notification: Notification | string): Promise<void> {
  const id = typeof notification === "string" ? notification : notification.id;
  const rowIndex = Number(id);
  if (Number.isNaN(rowIndex)) return;
  const svc = await buildSheetService();
  await deleteRow(svc, rowIndex);
}

export async function createNotification(input: NewNotificationInput): Promise<void> {
  if (!input.userEmail) return;
  const svc = await buildSheetService();
  const now = input.timestamp || new Date().toISOString();
  const row: (string | number | null)[] = [
    now,
    input.sourceSheet,
    input.title,
    input.message,
    input.roleTarget,
    "Unread",
    input.userEmail.toLowerCase(),
    input.route || "",
    input.targetTravellerName || "",
    input.targetDateTime || "",
    input.targetTripId || "",
    input.notificationType || input.type || "",
    input.priority || "",
    input.nextAction || "",
    input.internalId || "",
  ];
  await appendRows(svc, [row]);
}

export async function createNotifications(inputs: NewNotificationInput[]): Promise<void> {
  if (!inputs.length) return;
  const svc = await buildSheetService();
  const rows = inputs.map((input) => {
    const now = input.timestamp || new Date().toISOString();
    return [
      now,
      input.sourceSheet,
      input.title,
      input.message,
      input.roleTarget,
      "Unread",
      input.userEmail.toLowerCase(),
      input.route || "",
      input.targetTravellerName || "",
      input.targetDateTime || "",
      input.targetTripId || "",
      input.notificationType || input.type || "",
      input.priority || "",
      input.nextAction || "",
      input.internalId || "",
    ] as (string | number | null)[];
  });
  await appendRows(svc, rows);
}
