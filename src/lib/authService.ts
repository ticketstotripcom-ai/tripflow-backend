// Authentication service using BACKEND SHEET
import { GoogleSheetsService, SheetUser } from './googleSheets';
import { secureStorage } from './secureStorage';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: 'admin' | 'consultant';
}

export interface AuthSession {
  user: AuthUser;
  token: string;
  timestamp: number;
}

const DEFAULT_ADMIN: AuthUser = {
  id: 'default-admin',
  email: 'ticketstotrip.com@gmail.com',
  name: 'Admin',
  phone: '',
  role: 'admin'
};

const DEFAULT_ADMIN_PASSWORD = '123456';
const SESSION_KEY = 'auth_session';

class AuthService {
  private session: AuthSession | null = null;

  async initialize(): Promise<void> {
    const stored = await secureStorage.get(SESSION_KEY);
    if (stored) {
      try {
        this.session = JSON.parse(stored);
      } catch (e) {
        console.error('Failed to parse stored session:', e);
        this.session = null;
      }
    }
  }

  async login(email: string, password: string): Promise<{ session: AuthSession | null; error: Error | null }> {
    try {
      // Check default admin first
      if (email === DEFAULT_ADMIN.email && password === DEFAULT_ADMIN_PASSWORD) {
        const session: AuthSession = {
          user: DEFAULT_ADMIN,
          token: btoa(`${DEFAULT_ADMIN.email}:${Date.now()}`),
          timestamp: Date.now()
        };
        
        this.session = session;
        await secureStorage.set(SESSION_KEY, JSON.stringify(session));
        return { session, error: null };
      }

      // Remove hardcoded users fallback; use dynamic users from Google Sheet only

      // Fetch users from BACKEND SHEET
      const credentials = await secureStorage.getCredentials();
      if (!credentials) {
        return { session: null, error: new Error('Google Sheets credentials not configured. Please setup in Admin Settings.') };
      }

      const sheetsService = new GoogleSheetsService({
        apiKey: credentials.googleApiKey || '',
        // Pass service account too so auth works without an API key
        serviceAccountJson: credentials.googleServiceAccountJson,
        sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
        worksheetNames: credentials.worksheetNames,
        columnMappings: credentials.columnMappings
      });

      const users = await sheetsService.fetchUsers();
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);

      if (!user) {
        return { session: null, error: new Error('Invalid email or password') };
      }

      const authUser: AuthUser = {
        id: btoa(user.email),
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role
      };

      const session: AuthSession = {
        user: authUser,
        token: btoa(`${authUser.email}:${Date.now()}`),
        timestamp: Date.now()
      };

      this.session = session;
      await secureStorage.set(SESSION_KEY, JSON.stringify(session));
      return { session, error: null };
    } catch (error: any) {
      console.error('Login error:', error);
      return { session: null, error };
    }
  }

  async logout(): Promise<void> {
    this.session = null;
    await secureStorage.remove(SESSION_KEY);
  }

  getSession(): AuthSession | null {
    return this.session;
  }

  isAuthenticated(): boolean {
    return this.session !== null;
  }
}

export const authService = new AuthService();
