// Secure credential storage for mobile and web
import { Preferences } from '@capacitor/preferences';
import { localSecrets, areSecretsConfigured } from '@/config/localSecrets';

const ENCRYPTION_KEY_STORAGE = 'app_encryption_key';
const CREDENTIALS_STORAGE = 'secure_credentials';

// Simple encryption/decryption (in production, use stronger crypto)
async function getEncryptionKey(): Promise<string> {
  const { value } = await Preferences.get({ key: ENCRYPTION_KEY_STORAGE });
  if (value) return value;
  
  // Generate new key
  const newKey = btoa(Math.random().toString(36).substring(2) + Date.now().toString(36));
  await Preferences.set({ key: ENCRYPTION_KEY_STORAGE, value: newKey });
  return newKey;
}

function simpleEncrypt(text: string, key: string): string {
  return btoa(text.split('').map((char, i) => 
    String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
  ).join(''));
}

function simpleDecrypt(encrypted: string, key: string): string {
  const decoded = atob(encrypted);
  return decoded.split('').map((char, i) => 
    String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
  ).join('');
}

export interface SecureCredentials {
  googleApiKey?: string;
  googleServiceAccountJson?: string;
  googleSheetUrl: string;
  worksheetNames: string[];
  columnMappings: Record<string, string>;
  paymentLinks?: { name: string; url: string; qrImage?: string }[];
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
    await Preferences.set({ key: CREDENTIALS_STORAGE, value: encrypted });
  },

  async getCredentials(): Promise<SecureCredentials | null> {
    try {
      // First check if local secrets are configured
      if (areSecretsConfigured()) {
        const sheetIdMatch = localSecrets.spreadsheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        return {
          googleApiKey: localSecrets.googleApiKey !== "YOUR_GOOGLE_API_KEY_HERE" ? localSecrets.googleApiKey : undefined,
          googleServiceAccountJson: localSecrets.serviceAccountJson.includes("YOUR_") ? undefined : localSecrets.serviceAccountJson,
          googleSheetUrl: localSecrets.spreadsheetUrl,
          worksheetNames: localSecrets.worksheetNames,
          columnMappings: localSecrets.columnMappings,
          paymentLinks: localSecrets.paymentLinks
        };
      }
      
      // Fallback to stored credentials
      const { value } = await Preferences.get({ key: CREDENTIALS_STORAGE });
      if (!value) return null;
      
      const key = await getEncryptionKey();
      const decrypted = simpleDecrypt(value, key);
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Failed to decrypt credentials:', error);
      return null;
    }
  },

  async clearCredentials(): Promise<void> {
    await Preferences.remove({ key: CREDENTIALS_STORAGE });
  },

  async set(key: string, value: string): Promise<void> {
    const encKey = await getEncryptionKey();
    const encrypted = simpleEncrypt(value, encKey);
    await Preferences.set({ key, value: encrypted });
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
