// Secure credential storage for mobile and web
import { Preferences } from '@capacitor/preferences';
import { localSecrets, areSecretsConfigured } from '@/config/localSecrets';
import {
  clearPersistedServiceAccountJson,
  persistAppMetadata,
  persistServiceAccountJson,
  readAppMetadata,
  readPersistedServiceAccountJson,
} from './deviceStorage';

const ENCRYPTION_KEY_STORAGE = 'app_encryption_key';
const CREDENTIALS_STORAGE = 'secure_credentials';

// Simple encryption/decryption (in production, use stronger crypto)
async function getEncryptionKey(): Promise<string> {
  try {
    const { value } = await Preferences.get({ key: ENCRYPTION_KEY_STORAGE });
    if (value) return value;
    
    // Generate new key
    const newKey = btoa(Math.random().toString(36).substring(2) + Date.now().toString(36));
    await Preferences.set({ key: ENCRYPTION_KEY_STORAGE, value: newKey });
    return newKey;
  } catch (error) {
    console.warn("[secureStorage] Failed to get/set encryption key, using fallback:", error);
    // Fallback to a static key if preferences fail
    return "fallback-encryption-key-2024";
  }
}

function toBytes(str: string): Uint8Array {
  try { return new TextEncoder().encode(str); } catch { return Uint8Array.from(Array.from(str).map(c => c.charCodeAt(0) & 0xff)); }
}

function fromBytes(bytes: Uint8Array): string {
  try { return new TextDecoder().decode(bytes); } catch { return String.fromCharCode(...Array.from(bytes)); }
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function bytesFromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function simpleEncrypt(text: string, key: string): string {
  const data = toBytes(text);
  const keyBytes = toBytes(key);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ keyBytes[i % keyBytes.length];
  }
  return base64FromBytes(out);
}

function simpleDecrypt(encrypted: string, key: string): string {
  const enc = bytesFromBase64(encrypted);
  const keyBytes = toBytes(key);
  const out = new Uint8Array(enc.length);
  for (let i = 0; i < enc.length; i++) {
    out[i] = enc[i] ^ keyBytes[i % keyBytes.length];
  }
  return fromBytes(out);
}

export interface SecureCredentials {
  googleApiKey?: string;
  googleServiceAccountJson?: string;
  googleSheetUrl: string;
  worksheetNames: string[];
  columnMappings: Record<string, string>;
  paymentLinks?: { name: string; url: string; qrImage?: string }[];
  notifySecret?: string;
  // Multi-sheet support (optional; preserves backward compatibility)
  sheets?: Array<{
    name: string;
    sheetId: string;
    worksheetNames?: string[];
    columnMappings?: Record<string, string>;
  }>;
}

export const secureStorage = {
  async saveCredentials(credentials: SecureCredentials): Promise<void> {
    const key = await getEncryptionKey();
    const encrypted = simpleEncrypt(JSON.stringify(credentials), key);
    try {
      await Preferences.set({ key: CREDENTIALS_STORAGE, value: encrypted });
    } catch (e) {
      console.warn('secureStorage: failed to save credentials (non-fatal):', e);
    }

    if (credentials.googleServiceAccountJson) {
      await persistServiceAccountJson(credentials.googleServiceAccountJson);
    } else {
      await clearPersistedServiceAccountJson();
    }

    await persistAppMetadata({
      paymentLinks: credentials.paymentLinks,
      updatedAt: new Date().toISOString(),
    });
  },

  async getCredentials(): Promise<SecureCredentials | null> {
    try {
      // First check if local secrets are configured
      if (areSecretsConfigured()) {
        const sheetIdMatch = localSecrets.spreadsheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        let bundledServiceAccount: string | undefined;
        if (typeof localSecrets.serviceAccountJson === 'string') {
          bundledServiceAccount = localSecrets.serviceAccountJson.includes('YOUR_')
            ? undefined
            : localSecrets.serviceAccountJson;
        } else if (localSecrets.serviceAccountJson) {
          try {
            bundledServiceAccount = JSON.stringify(localSecrets.serviceAccountJson);
          } catch {
            bundledServiceAccount = undefined;
          }
        }

        if (bundledServiceAccount) {
          await persistServiceAccountJson(bundledServiceAccount);
        }

        await persistAppMetadata({
          paymentLinks: localSecrets.paymentLinks,
          updatedAt: new Date().toISOString(),
        });

        return {
          googleApiKey: localSecrets.googleApiKey !== "YOUR_GOOGLE_API_KEY_HERE" ? localSecrets.googleApiKey : undefined,
          googleServiceAccountJson: bundledServiceAccount,
          googleSheetUrl: localSecrets.spreadsheetUrl,
          worksheetNames: localSecrets.worksheetNames,
          columnMappings: localSecrets.columnMappings,
          paymentLinks: localSecrets.paymentLinks,
          notifySecret: "Tickets@2018",
        };
      }
      
      // Fallback to stored credentials
      const { value } = await Preferences.get({ key: CREDENTIALS_STORAGE });
      if (!value) return null;
      
      const key = await getEncryptionKey();
      const decrypted = simpleDecrypt(value, key);
      const parsed = JSON.parse(decrypted) as SecureCredentials;

      // Ensure notifySecret is always present for backend auth
      if (!parsed.notifySecret) {
        parsed.notifySecret = "Tickets@2018";
      }

      if (!parsed.googleServiceAccountJson) {
        const persisted = await readPersistedServiceAccountJson();
        if (persisted) {
          parsed.googleServiceAccountJson = persisted;
        }
      }

      if (!parsed.paymentLinks || parsed.paymentLinks.length === 0) {
        const metadata = await readAppMetadata();
        if (metadata?.paymentLinks?.length) {
          parsed.paymentLinks = metadata.paymentLinks;
        }
      }

      return parsed;
    } catch (error) {
      console.error('Failed to decrypt credentials:', error);
      return null;
    }
  },

  async clearCredentials(): Promise<void> {
    await Preferences.remove({ key: CREDENTIALS_STORAGE });
    await clearPersistedServiceAccountJson();
  },

  async set(key: string, value: string): Promise<void> {
    const encKey = await getEncryptionKey();
    const encrypted = simpleEncrypt(value, encKey);
    try {
      await Preferences.set({ key, value: encrypted });
    } catch (e) {
      console.warn(`secureStorage: failed to persist key ${key} (non-fatal)`, e);
    }
  },

  async get(key: string): Promise<string | null> {
    try {
      const { value } = await Preferences.get({ key });
      if (!value) return null;
      
      const encKey = await getEncryptionKey();
      return simpleDecrypt(value, encKey);
    } catch (error) {
      console.error('Failed to decrypt value:', error);
      return null;
    }
  },

  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  }
};
