// LOCAL SECRETS - DO NOT COMMIT TO GIT
// Add this file to .gitignore to keep secrets local
// Copy this template and fill with your actual values

const DEFAULT_SERVICE_ACCOUNT_JSON = `{
  "type": "service_account",
  "project_id": "YOUR_PROJECT",
  "private_key_id": "YOUR_KEY_ID",
  "private_key": "-----BEGIN PRIVATE KEY-----\\nYOUR_PRIVATE_KEY\\n-----END PRIVATE KEY-----\\n",
  "client_email": "YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com",
  "client_id": "YOUR_CLIENT_ID",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "YOUR_CERT_URL"
}`;

function loadBundledServiceAccountJson(): string | null {
  try {
    const matches = import.meta.glob('./serviceAccount*.json', { eager: true, query: '?raw', import: 'default' });
    for (const raw of Object.values(matches)) {
      if (typeof raw === 'string') {
        const sanitized = raw.trim();
        if (sanitized) {
          console.info('[localSecrets] Found bundled service account JSON');
          return sanitized;
        }
      }
    }
  } catch (error) {
    console.warn('[localSecrets] Unable to load bundled service account JSON:', error);
  }
  return null;
}

function decodeBase64(value: string): string | null {
  if (!value) return null;
  try {
    if (typeof atob === 'function') {
      const binary = atob(value);
      if (typeof TextDecoder !== 'undefined') {
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return new TextDecoder().decode(bytes);
      }
      return binary;
    }
  } catch (e) {
    // Ignore atob errors
  }

  try {
    const globalBuffer = (globalThis as unknown as { Buffer: typeof Buffer })?.Buffer;
    if (globalBuffer) {
      return globalBuffer.from(value, 'base64').toString('utf-8');
    }
  } catch (e) {
    // Ignore Buffer errors
  }
  return null;
}

function loadServiceAccountJsonFromEnv(): string | null {
  try {
    const env = (import.meta as { env: Record<string, string> })?.env || {};
    const raw = env.VITE_SERVICE_ACCOUNT_JSON ?? env.VITE_SERVICE_ACCOUNT_JSON_BASE64;
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{')) {
      console.info('[localSecrets] Service account JSON loaded from environment variable');
      return trimmed;
    }
    const decoded = decodeBase64(trimmed);
    if (decoded) {
      console.info('[localSecrets] Service account JSON decoded from base64 environment variable');
      return decoded.trim();
    }
  } catch (error) {
    console.warn('[localSecrets] Unable to read service account JSON from environment variables:', error);
  }
  return null;
}

const SERVICE_ACCOUNT_JSON = loadBundledServiceAccountJson() ?? loadServiceAccountJsonFromEnv() ?? DEFAULT_SERVICE_ACCOUNT_JSON;

export const localSecrets = {
  // Google Sheets API Key (read-only) OR Service Account JSON (for add/update)
  googleApiKey: "AIzaSyAozO0DUmODQ-tTnXJB-RIPqlIkmmo6SYY",
  
  // Google Sheets URL
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1L0wSffEo4CaP0AGikJDpu_bu5KLuJ1SzlFSS01Pqugg",
  
  // Service Account JSON for write operations (paste entire JSON as string or bundle in src/config/serviceAccount.json)
  serviceAccountJson: SERVICE_ACCOUNT_JSON,
  
  // Worksheet names in your Google Sheet
  worksheetNames: ["MASTER DATA", "BACKEND SHEET"],
  
  // Column mappings for MASTER DATA (exactly match SheetLead fields)
  columnMappings: {
    tripId: "A",
    date: "B",
    consultant: "C",
    status: "D",
    travellerName: "E",
    leadSource: "F",
    travelDate: "G",
    travelState: "H",
    destination: "I",
    ticketsRequired: "J",
    remarks: "K",
    nights: "L",
    pax: "M",
    hotelCategory: "N",
    mealPlan: "O",
    phone: "P",
    email: "Q",
    whatsappLink: "R",
    departureLocation: "S",
    mentorName: "T",
    remarkByMentor: "U",
    eventType: "V",
    eventDate: "W",
    contactStatus: "X",
    followupStatus: "Y",
    uniqueKey: "Z",
    timeStamp: "AA",
    whatsappNotification: "AB",
    customerReplies: "AC",
    aiResponse: "AD",
    fullConversation: "AE",
    bookingStatus: "AF",
    firstMessageTime: "AG",
    customerLastMessageTime: "AH",
    reminderCount: "AI",
    whatsappItinerary: "AJ",
    whatsappItineraryTiming: "AK",
    priority: "AL"
  },
  
  // Payment links and QR codes
  paymentLinks: [
    {
      name: "Primary Payment",
      url: "https://your-payment-link.com",
      qrCode: "data:image/png;base64,YOUR_QR_CODE_BASE64_HERE"
    }
  ]
};

function hasValidServiceAccount(value: unknown): boolean {
  if (!value) return false;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (trimmed.includes('YOUR_')) return false;
    if (trimmed.includes('"private_key"') && trimmed.includes('-----BEGIN')) {
      // Guard against placeholder private key text
      const privateKeyMatch = trimmed.match(/"private_key"\s*:\s*"([^"]+)"/);
      if (privateKeyMatch && privateKeyMatch[1].includes('YOUR_PRIVATE_KEY')) {
        return false;
      }
      return true;
    }
    return false;
  }
  if (typeof value === 'object') return true;
  return false;
}

// Helper to check if secrets are configured
export const areSecretsConfigured = () => {
  const sheetConfigured = typeof localSecrets.spreadsheetUrl === 'string' && !localSecrets.spreadsheetUrl.includes('YOUR_');
  const apiKeyConfigured = typeof localSecrets.googleApiKey === 'string' && !localSecrets.googleApiKey.includes('YOUR_');
  const serviceAccountConfigured = hasValidServiceAccount(localSecrets.serviceAccountJson);
  return sheetConfigured && (apiKeyConfigured || serviceAccountConfigured);
};