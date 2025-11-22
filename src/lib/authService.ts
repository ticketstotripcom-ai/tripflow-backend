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
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  lastRefreshedAt?: number;
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
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (inactivity window)
const ACCESS_TOKEN_TTL_MS = 45 * 60 * 1000; // 45 minutes
const REFRESH_TOKEN_TTL_MS = 120 * 24 * 60 * 60 * 1000; // 120 days
const ACCESS_REFRESH_GRACE_MS = 5 * 60 * 1000; // refresh 5 minutes before expiry
const REFRESH_ROTATE_WINDOW_MS = 15 * 24 * 60 * 60 * 1000; // rotate refresh token 15 days before expiry

class AuthService {
  private session: AuthSession | null = null;
  private initialized = false;
  private authStateListeners: ((session: AuthSession | null) => void)[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  private generateToken(length = 64): string {
    try {
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fallback for environments without crypto (very rare)
      return btoa(`${Date.now()}-${Math.random()}`).replace(/=/g, '');
    }
  }

  private buildSession(base: Partial<AuthSession> | null, user: AuthUser): AuthSession {
    const now = Date.now();
    const accessToken = base?.accessToken || base?.token || this.generateToken(48);
    const refreshToken = base?.refreshToken || this.generateToken(80);

    return {
      user,
      token: accessToken, // backwards compatibility for older code paths
      accessToken,
      refreshToken,
      accessTokenExpiresAt: base?.accessTokenExpiresAt || now + ACCESS_TOKEN_TTL_MS,
      refreshTokenExpiresAt: base?.refreshTokenExpiresAt || now + REFRESH_TOKEN_TTL_MS,
      timestamp: base?.timestamp || now,
      lastRefreshedAt: base?.lastRefreshedAt || base?.timestamp || now,
    };
  }

  private clearRefreshTimer() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private scheduleTokenMaintenance() {
    this.clearRefreshTimer();
    if (!this.session) return;

    const now = Date.now();
    const timeToExpiry = this.session.accessTokenExpiresAt - now - ACCESS_REFRESH_GRACE_MS;
    const nextRun = Math.max(30_000, timeToExpiry); // never schedule too tight

    this.refreshTimer = setTimeout(async () => {
      try {
        await this.refreshTokens('scheduled');
      } catch (err) {
        console.warn('[AuthService] Scheduled refresh failed:', err);
      }
    }, nextRun);
  }

  private async persistSession(session: AuthSession) {
    this.session = session;
    await secureStorage.set(SESSION_KEY, JSON.stringify(session));
    this.notifyAuthStateChange();
    this.scheduleTokenMaintenance();
  }

  private async refreshTokens(reason: string): Promise<AuthSession | null> {
    if (!this.session) return null;

    const now = Date.now();
    if (now > this.session.refreshTokenExpiresAt) {
      console.warn('[AuthService] Refresh token expired; logging out');
      await this.logout();
      return null;
    }

    const rotateRefresh =
      this.session.refreshTokenExpiresAt - now < REFRESH_ROTATE_WINDOW_MS;

    const updatedSession: AuthSession = {
      ...this.session,
      accessToken: this.generateToken(48),
      accessTokenExpiresAt: now + ACCESS_TOKEN_TTL_MS,
      refreshToken: rotateRefresh ? this.generateToken(80) : this.session.refreshToken,
      refreshTokenExpiresAt: rotateRefresh
        ? now + REFRESH_TOKEN_TTL_MS
        : this.session.refreshTokenExpiresAt,
      token: '', // overwritten below for compatibility
      timestamp: now,
      lastRefreshedAt: now,
    };

    updatedSession.token = updatedSession.accessToken;
    console.log(`[AuthService] Refreshed tokens (${reason})`);
    await this.persistSession(updatedSession);
    return updatedSession;
  }

  private async hydrateFromStorage() {
    try {
      console.log("[AuthService] Initializing...");
      const stored = await secureStorage.get(SESSION_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as AuthSession;
          const hydrated = this.buildSession(parsed, parsed.user);
          const now = Date.now();

          // Basic expiry check to avoid infinite sessions
          if (
            hydrated?.timestamp &&
            now - hydrated.timestamp < SESSION_TTL_MS &&
            now < hydrated.refreshTokenExpiresAt
          ) {
            this.session = hydrated;
            if (hydrated.accessTokenExpiresAt - now < ACCESS_REFRESH_GRACE_MS) {
              await this.refreshTokens('init-expiry');
            } else {
              await this.persistSession(hydrated);
            }
            console.log("[AuthService] Valid session found and hydrated");
          } else {
            await secureStorage.remove(SESSION_KEY);
            this.session = null;
            console.log("[AuthService] Session expired, removed");
          }
        } catch (e) {
          console.error('Failed to parse stored session:', e);
          this.session = null;
        }
      } else {
        console.log("[AuthService] No stored session found");
      }
    } catch (error) {
      console.error("[AuthService] Initialization failed:", error);
      this.session = null;
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.hydrateFromStorage();
    this.initialized = true;
    console.log("[AuthService] Initialization completed");
  }

  onAuthStateChange(callback: (session: AuthSession | null) => void): () => void {
    this.authStateListeners.push(callback);
    // Immediately invoke with current session state
    callback(this.session);
    return () => {
      this.authStateListeners = this.authStateListeners.filter(listener => listener !== callback);
    };
  }

  private notifyAuthStateChange() {
    this.authStateListeners.forEach(listener => listener(this.session));
  }

  private async ensureSessionFreshness(reason: string): Promise<boolean> {
    if (!this.session) return false;

    const now = Date.now();
    if (now > this.session.refreshTokenExpiresAt) {
      await this.logout();
      return false;
    }

    if (this.session.accessTokenExpiresAt - now < ACCESS_REFRESH_GRACE_MS) {
      const refreshed = await this.refreshTokens(reason);
      return !!refreshed;
    }

    await this.touchSession();
    return !!this.session;
  }

  // Check auth state with initialization and expiry
  async checkAuth(): Promise<boolean> {
    await this.initialize();
    if (!this.session) return false;
    return this.ensureSessionFreshness('checkAuth');
  }

  // Extend session lifetime on activity/open
  async touchSession(): Promise<void> {
    if (!this.session) return;
    this.session.timestamp = Date.now();
    await secureStorage.set(SESSION_KEY, JSON.stringify(this.session));
    this.scheduleTokenMaintenance();
    console.log('Session touched - extended lifetime');
  }

  // Check if session is still valid and extend it
  async validateAndExtendSession(): Promise<boolean> {
    await this.initialize();
    if (!this.session) return false;

    return this.ensureSessionFreshness('validate');
  }

  async login(rawEmail: string, rawPassword: string): Promise<{ session: AuthSession | null; error: Error | null }> {
    try {
      const email = String(rawEmail || '').trim().toLowerCase();
      const password = String(rawPassword || '').trim();

      // Check default admin first
      if (email === DEFAULT_ADMIN.email.toLowerCase() && password === DEFAULT_ADMIN_PASSWORD) {
        const session = this.buildSession(null, DEFAULT_ADMIN);
        await this.persistSession(session);
        return { session, error: null };
      }

      // Remove hardcoded users fallback; use dynamic users from Google Sheet only

      // Fetch users from BACKEND SHEET
      const credentials = await secureStorage.getCredentials();
      if (!credentials) {
        return { session: null, error: new Error('Google Sheets credentials not configured. Please setup in Admin Settings.') };
      }

      // Fallback to locally persisted service account JSON if secure storage is empty (e.g., Vercel preview)
      let localServiceAccountJson: string | undefined;
      try { localServiceAccountJson = localStorage.getItem('serviceAccountJson') || undefined; } catch {}

      const sheetsService = new GoogleSheetsService({
        apiKey: credentials.googleApiKey || '',
        // Prefer secure storage, fallback to localStorage
        serviceAccountJson: credentials.googleServiceAccountJson || localServiceAccountJson,
        sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
        worksheetNames: credentials.worksheetNames,
        columnMappings: credentials.columnMappings
      });

      const attemptFetch = async (tries = 2): Promise<SheetUser[]> => {
        try {
          const u = await sheetsService.fetchUsers();
          return u;
        } catch (e) {
          if (tries > 0) {
            await new Promise(r => setTimeout(r, 700));
            return attemptFetch(tries - 1);
          }
          throw e;
        }
      };

      const users = await attemptFetch(2);
      const matched = users.find((u) =>
        String(u.email || '').trim().toLowerCase() === email &&
        String(u.password || '').trim() === password
      );
      if (!matched) {
        console.error('Login failed: user not found in backend sheet', { email });
        return { session: null, error: new Error('user not found in backend sheet') };
      }
      const user = matched;

      const authUser: AuthUser = {
        id: btoa(user.email),
        email: user.email.trim().toLowerCase(),
        name: user.name,
        phone: user.phone,
        role: user.role
      };

      const session = this.buildSession(null, authUser);
      await this.persistSession(session);
      return { session, error: null };
    } catch (error: any) {
      console.error('Login error:', error);
      return { session: null, error };
    }
  }

  async logout(): Promise<void> {
    this.clearRefreshTimer();
    this.session = null;
    await secureStorage.remove(SESSION_KEY);
    this.notifyAuthStateChange();
  }

  getSession(): AuthSession | null {
    return this.session;
  }

  isAuthenticated(): boolean {
    return this.session !== null;
  }
}

export const authService = new AuthService();
