// googleSheet.ts

import { secureStorage } from "@/lib/secureStorage";
import { Lead } from "@/types";

function extractSheetId(url: string): string {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error("Invalid Google Sheet URL");
  return match[1];
}

async function getServiceAccountAccessToken(sa: any): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  function base64url(source: string) {
    return btoa(source)
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }

  const headerBase64 = base64url(JSON.stringify(header));
  const payloadBase64 = base64url(JSON.stringify(payload));
  const textToSign = `${headerBase64}.${payloadBase64}`;
  const encoder = new TextEncoder();
  const keyData = sa.private_key.replace(/-----.*-----/g, "").replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(textToSign)
  );

  const signatureBase64 = base64url(
    String.fromCharCode(...new Uint8Array(signature))
  );
  const jwt = `${textToSign}.${signatureBase64}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error("Token generation failed: " + JSON.stringify(data));
  return data.access_token;
}

// ✅ Fetch all leads
export const fetchLeads = async (): Promise<Lead[]> => {
  try {
    const creds = await secureStorage.getCredentials();
    const sheetId = extractSheetId(creds.googleSheetUrl);
    const sheetName = creds.worksheetNames?.[0] || "MASTER DATA";

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetName}!A:Z?key=${creds.googleApiKey}`
    );

    const data = await res.json();
    if (!data.values || data.values.length < 2) return [];

    const headers = data.values[0];
    const rows = data.values.slice(1);
    const leads = rows
      .filter(r => r[1] && r[4]) // ensure Date & Traveller Name exist
      .map((r, i) => ({
        rowIndex: i + 2, // actual row in sheet
        trip_id: r[0],
        date: r[1],
        consultant: r[2],
        status: r[3],
        traveller_name: r[4],
        travel_date: r[6],
        travel_state: r[7],
        remarks: r[10],
        nights: r[11],
        pax: r[12],
        hotel_category: r[13],
        meal_plan: r[14],
        phone: r[15],
        email: r[16],
        priority: r[17]
      }));

    console.log("✅ Leads fetched:", leads.length);
    return leads;
  } catch (err) {
    console.error("❌ fetchLeads error:", err);
    return [];
  }
};

// ✅ Update lead (match by Date+TravellerName)
export const updateLead = async (updatedLead: Partial<Lead>) => {
  try {
    console.log("💾 Saving lead changes...", updatedLead);
    const creds = await secureStorage.getCredentials();
    const sheetId = extractSheetId(creds.googleSheetUrl);
    const sheetName = creds.worksheetNames?.[0] || "MASTER DATA";
    const columnMappings = creds.columnMappings || {};
    const sa = creds.googleServiceAccountJson ? JSON.parse(creds.googleServiceAccountJson) : null;
    if (!sa) throw new Error("Service Account JSON required for updates");

    const allLeads = await fetchLeads();
    const row = allLeads.find(
      l =>
        l.date?.trim() === updatedLead.date?.trim() &&
        l.traveller_name?.trim().toLowerCase() === updatedLead.traveller_name?.trim().toLowerCase()
    );

    if (!row) {
      throw new Error(
        `Row not found for Date=${updatedLead.date} Traveller=${updatedLead.traveller_name}`
      );
    }

    const targetRow = row.rowIndex;
    const data = Object.entries(updatedLead)
      .filter(([key]) => columnMappings[key])
      .map(([key, value]) => ({
        range: `${sheetName}!${columnMappings[key]}${targetRow}`,
        values: [[value ?? ""]],
      }));

    if (data.length === 0) {
      throw new Error("No valid fields to update");
    }

    console.log("🧠 Update ranges:", data);

    const token = await getServiceAccountAccessToken(sa);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data,
        }),
      }
    );

    const result = await res.json();
    console.log("✅ Sheets API response:", result);

    if (result.error) throw new Error(result.error.message);

    alert(`✅ Lead updated in Google Sheet (Row ${targetRow})`);
    return result;
  } catch (err: any) {
    console.error("❌ updateLead error:", err);
    alert("❌ Update failed: " + err.message);
  }
};
