// src/lib/googleSheet.ts
import { SecureCredentials, secureStorage } from "./secureStorage";

interface Lead {
  trip_id: string;
  [key: string]: string | number | null;
}

/**
 * Extract Google Sheet ID from URL
 */
const extractSheetId = (url: string): string | null => {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
};

/**
 * Fetch leads using API Key (read-only) or Service Account (if provided)
 */
export const fetchLeads = async (): Promise<Lead[]> => {
  try {
    const creds = await secureStorage.getCredentials();
    if (!creds || !creds.googleSheetUrl) throw new Error("Google Sheet not configured");

    const sheetId = extractSheetId(creds.googleSheetUrl);
    if (!sheetId) throw new Error("Invalid Google Sheet URL");

    const sheetName = creds.worksheetNames?.[0] || "MASTER DATA";

    // If Service Account JSON is available, use access token
    if (creds.googleServiceAccountJson) {
      const sa = JSON.parse(creds.googleServiceAccountJson);
      const token = await getServiceAccountAccessToken(sa);
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}?majorDimension=ROWS`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!data.values) throw new Error("No data found");
      return parseLeads(data.values);
    }

    // Fallback to API Key (read-only)
    if (creds.googleApiKey) {
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}?key=${creds.googleApiKey}`
      );
      const data = await res.json();
      if (!data.values) throw new Error("No data found");
      return parseLeads(data.values);
    }

    throw new Error("Missing credentials");
  } catch (err: any) {
    console.error("fetchLeads error:", err);
    alert("⚠️ Failed to load leads: " + err.message);
    return [];
  }
};

/**
 * Update an existing lead (by Trip ID)
 */
export const updateLead = async (tripId: string, updatedFields: Partial<Lead>) => {
  try {
    const creds = await secureStorage.getCredentials();
    if (!creds) throw new Error("Missing credentials");
    const sheetId = extractSheetId(creds.googleSheetUrl);
    if (!sheetId) throw new Error("Invalid sheet URL");

    const sheetName = creds.worksheetNames?.[0] || "MASTER DATA";
    const columnMappings = creds.columnMappings || {};

    // 1. Find the row number of this Trip ID
    const allLeads = await fetchLeads();
    const rowIndex = allLeads.findIndex(l => l.trip_id?.toString() === tripId.toString());
    if (rowIndex === -1) throw new Error(`Trip ID ${tripId} not found in sheet`);

    const targetRow = rowIndex + 1; // +1 since array is 0-based, sheet row starts at 1
    const updates: any[] = [];

    for (const [field, value] of Object.entries(updatedFields)) {
      const column = columnMappings[field];
      if (column) {
        updates.push({
          range: `${sheetName}!${column}${targetRow}`,
          values: [[value ?? ""]],
        });
      }
    }

    if (!updates.length) {
      console.warn("No valid columns to update:", updatedFields);
      return;
    }

    const sa = creds.googleServiceAccountJson ? JSON.parse(creds.googleServiceAccountJson) : null;
    if (!sa) throw new Error("Service Account JSON required for updates");

    const token = await getServiceAccountAccessToken(sa);

    const batchUpdateBody = {
      valueInputOption: "USER_ENTERED",
      data: updates,
    };

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batchUpdateBody),
      }
    );

    const result = await res.json();
    if (!res.ok) throw new Error(result.error?.message || "Google Sheets update failed");

    console.log("✅ Lead updated successfully:", result);
    alert("✅ Lead updated in Google Sheet!");
    return result;
  } catch (err: any) {
    console.error("updateLead error:", err);
    alert("❌ Update failed: " + err.message);
    return null;
  }
};

/**
 * Add a new lead to the sheet
 */
export const addLead = async (lead: Lead) => {
  try {
    const creds = await secureStorage.getCredentials();
    if (!creds) throw new Error("Missing credentials");
    const sheetId = extractSheetId(creds.googleSheetUrl);
    if (!sheetId) throw new Error("Invalid sheet URL");

    const sheetName = creds.worksheetNames?.[0] || "MASTER DATA";
    const columnMappings = creds.columnMappings || {};

    const sa = creds.googleServiceAccountJson ? JSON.parse(creds.googleServiceAccountJson) : null;
    if (!sa) throw new Error("Service Account JSON required for adding leads");

    const token = await getServiceAccountAccessToken(sa);

    const headers = Object.keys(columnMappings);
    const values = headers.map(key => lead[key] ?? "");

    const body = {
      values: [values],
    };

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetName}!A1:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const result = await res.json();
    if (!res.ok) throw new Error(result.error?.message || "Add lead failed");

    console.log("✅ Lead added successfully:", result);
    alert("✅ Lead added to Google Sheet!");
    return result;
  } catch (err: any) {
    console.error("addLead error:", err);
    alert("❌ Add failed: " + err.message);
    return null;
  }
};

/**
 * Get Access Token from Service Account
 */
async function getServiceAccountAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const jwtClaimSet = btoa(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  // Generate signature using subtle crypto
  const encoder = new TextEncoder();
  const keyData = encoder.encode(serviceAccount.private_key.replace(/-----.*-----/g, "").replace(/\n/g, ""));
  const importedKey = await crypto.subtle.importKey(
    "pkcs8",
    str2ab(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", importedKey, encoder.encode(`${jwtHeader}.${jwtClaimSet}`));
  const jwt = `${jwtHeader}.${jwtClaimSet}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get access token");
  return data.access_token;
}

/**
 * Convert ArrayBuffer
 */
function str2ab(str: string): ArrayBuffer {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0; i < str.length; i++) bufView[i] = str.charCodeAt(i);
  return buf;
}

/**
 * Parse rows from sheet into Lead objects
 */
function parseLeads(rows: any[][]): Lead[] {
  const [header, ...dataRows] = rows;
  if (!header) return [];
  return dataRows.map((row, i) => {
    const obj: any = {};
    header.forEach((key: string, j: number) => {
      obj[key?.toLowerCase()?.trim().replace(/\s+/g, "_")] = row[j] ?? "";
    });
    obj.trip_id = obj.trip_id || String(i + 2); // Default ID if missing
    return obj;
  });
}
