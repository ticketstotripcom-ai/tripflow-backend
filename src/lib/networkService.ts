/**
 * Network service for monitoring online/offline status
 * Provides reliable network connectivity detection
 */

export interface NetworkService {
  isOnline(): Promise<boolean>;
  addEventListener(callback: (online: boolean) => void): () => void;
  getConnectionInfo(): Promise<ConnectionInfo>;
}

export interface ConnectionInfo {
  online: boolean;
  type?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

class BrowserNetworkService implements NetworkService {
  private listeners: Set<(online: boolean) => void> = new Set();
  private connection: any = null;

  constructor() {
    this.setupEventListeners();
    this.setupConnectionAPI();
  }

  private setupEventListeners(): void {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      this.notifyListeners(true);
    };

    const handleOffline = () => {
      this.notifyListeners(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup function for potential future use
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }

  private setupConnectionAPI(): void {
    if (typeof window === 'undefined') return;

    // Check for Network Information API
    const nav = navigator as any;
    this.connection = nav.connection || nav.mozConnection || nav.webkitConnection;

    if (this.connection) {
      this.connection.addEventListener('change', () => {
        this.notifyListeners(!this.connection?.effectiveType?.includes('offline'));
      });
    }
  }

  private notifyListeners(online: boolean): void {
    this.listeners.forEach(listener => {
      try {
        listener(online);
      } catch (error) {
        console.warn('Network listener error:', error);
      }
    });
  }

  /**
   * Check if the application is currently online
   * Uses multiple detection methods for reliability
   */
  async isOnline(): Promise<boolean> {
    try {
      // Primary check: navigator.onLine
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return false;
      }

      // Secondary check: attempt a lightweight network request
      if (typeof window !== 'undefined') {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        try {
          // Try to fetch a small resource to verify connectivity
          const response = await fetch('/favicon.ico', {
            method: 'HEAD',
            signal: controller.signal,
            cache: 'no-store'
          });
          clearTimeout(timeoutId);
          return response.ok;
        } catch (fetchError) {
          clearTimeout(timeoutId);
          // If favicon fetch fails, try a more reliable endpoint
          try {
            const response = await fetch(window.location.origin, {
              method: 'HEAD',
              signal: controller.signal,
              cache: 'no-store'
            });
            return response.ok;
          } catch {
            return false;
          }
        }
      }

      return true; // Default to online if we can't verify
    } catch (error) {
      console.warn('Network status check failed:', error);
      return navigator?.onLine ?? true; // Fallback to navigator.onLine
    }
  }

  /**
   * Add event listener for network status changes
   * Returns a cleanup function to remove the listener
   */
  addEventListener(callback: (online: boolean) => void): () => void {
    this.listeners.add(callback);
    
    // Return cleanup function
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Get detailed connection information
   */
  async getConnectionInfo(): Promise<ConnectionInfo> {
    const online = await this.isOnline();
    
    const info: ConnectionInfo = { online };

    if (this.connection) {
      info.type = this.connection.type;
      info.effectiveType = this.connection.effectiveType;
      info.downlink = this.connection.downlink;
      info.rtt = this.connection.rtt;
    }

    return info;
  }

  /**
   * Perform a connectivity test to a specific URL
   */
  async testConnectivity(url: string = '/favicon.ico', timeout: number = 5000): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store'
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const networkService = new BrowserNetworkService();