import { SheetLead } from "@/lib/googleSheets";
import LZString from "lz-string";

/**
 * Cache service for managing leads data in localStorage
 * Provides methods to get, set, and manage cached leads with TTL support
 */

const CACHE_KEYS = {
  LEADS: 'tripflow_leads_cache',
  LEADS_TIMESTAMP: 'tripflow_leads_cache_timestamp',
  LEADS_COMPRESSED: 'crm_cache_leads',
  CACHE_TTL: 5 * 60 * 1000, // 5 minutes in milliseconds
} as const;

export interface CacheService {
  getLeads(): SheetLead[] | null;
  setLeads(leads: SheetLead[]): void;
  clearLeads(): void;
  isCacheValid(): boolean;
  getCacheAge(): number;
}

class LeadsCacheService implements CacheService {
  private readonly storage: Storage;

  constructor() {
    this.storage = typeof window !== 'undefined' ? window.localStorage : ({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    } as Storage);
  }

  private isLocalStorageAvailable(): boolean {
    try {
      const k = '__ls_test__';
      this.storage.setItem(k, '1');
      this.storage.removeItem(k);
      return true;
    } catch (e) {
      console.warn('LocalStorage unavailable:', e);
      return false;
    }
  }

  /**
   * Get cached leads from localStorage
   * Returns null if no cache exists or cache is invalid
   */
  getLeads(): SheetLead[] | null {
    try {
      // Prefer compressed cache first
      if (this.isCacheValid()) {
        const compressed = this.storage.getItem(CACHE_KEYS.LEADS_COMPRESSED);
        if (compressed) {
          try {
            const json = LZString.decompressFromUTF16(compressed);
            if (json) {
              const leads = JSON.parse(json) as SheetLead[];
              if (Array.isArray(leads)) {
                console.log('[cacheService] Loaded leads from compressed cache:', leads.length);
                return leads;
              }
            }
          } catch (e) {
            console.warn('[cacheService] Failed to decompress leads cache:', e);
          }
        }
        const cachedData = this.storage.getItem(CACHE_KEYS.LEADS);
        if (cachedData) {
          const leads = JSON.parse(cachedData) as SheetLead[];
          if (Array.isArray(leads)) {
            console.log('[cacheService] Loaded leads from legacy cache:', leads.length);
            return leads;
          }
        }
      }
      return null;
    } catch (error) {
      console.warn('Failed to get cached leads:', error);
      return null;
    }
  }

  /**
   * Set leads in cache with current timestamp
   */
  setLeads(leads: SheetLead[]): void {
    try {
      if (!Array.isArray(leads)) {
        throw new Error('Leads must be an array');
      }

      const serializedData = JSON.stringify(leads);
      if (this.isLocalStorageAvailable()) {
        try {
          // Compressed cache to avoid quota issues
          this.storage.setItem(CACHE_KEYS.LEADS_COMPRESSED, LZString.compressToUTF16(serializedData));
        } catch (err) {
          console.warn('[cacheService] Compressed cache failed, falling back to plain JSON:', err);
        }
        this.storage.setItem(CACHE_KEYS.LEADS, serializedData);
        this.storage.setItem(CACHE_KEYS.LEADS_TIMESTAMP, Date.now().toString());
      }
    } catch (error) {
      console.warn('Failed to set leads cache:', error);
      
      // Handle quota exceeded errors
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        this.clearLeads();
        try {
          // Try again after clearing
          const serializedData = JSON.stringify(leads);
          this.storage.setItem(CACHE_KEYS.LEADS_COMPRESSED, LZString.compressToUTF16(serializedData));
          this.storage.setItem(CACHE_KEYS.LEADS, serializedData);
          this.storage.setItem(CACHE_KEYS.LEADS_TIMESTAMP, Date.now().toString());
        } catch (retryError) {
          console.error('Failed to cache leads even after clearing:', retryError);
        }
      }
    }
  }

  /**
   * Clear leads cache
   */
  clearLeads(): void {
    try {
      this.storage.removeItem(CACHE_KEYS.LEADS);
      this.storage.removeItem(CACHE_KEYS.LEADS_TIMESTAMP);
    } catch (error) {
      console.warn('Failed to clear leads cache:', error);
    }
  }

  /**
   * Check if cached data is still valid (not expired)
   */
  isCacheValid(): boolean {
    try {
      const timestampStr = this.storage.getItem(CACHE_KEYS.LEADS_TIMESTAMP);
      if (!timestampStr) {
        return false;
      }

      const timestamp = parseInt(timestampStr, 10);
      if (isNaN(timestamp)) {
        return false;
      }

      const age = Date.now() - timestamp;
      return age < CACHE_KEYS.CACHE_TTL;
    } catch (error) {
      console.warn('Failed to check cache validity:', error);
      return false;
    }
  }

  /**
   * Get the age of the cache in milliseconds
   * Returns -1 if no cache exists
   */
  getCacheAge(): number {
    try {
      const timestampStr = this.storage.getItem(CACHE_KEYS.LEADS_TIMESTAMP);
      if (!timestampStr) {
        return -1;
      }

      const timestamp = parseInt(timestampStr, 10);
      if (isNaN(timestamp)) {
        return -1;
      }

      return Date.now() - timestamp;
    } catch (error) {
      console.warn('Failed to get cache age:', error);
      return -1;
    }
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): { hasCache: boolean; isValid: boolean; age: number; size: number } {
    try {
      const cachedData = this.storage.getItem(CACHE_KEYS.LEADS);
      const hasCache = !!cachedData;
      const isValid = this.isCacheValid();
      const age = this.getCacheAge();
      const size = cachedData ? cachedData.length : 0;

      return {
        hasCache,
        isValid,
        age,
        size,
      };
    } catch (error) {
      console.warn('Failed to get cache stats:', error);
      return {
        hasCache: false,
        isValid: false,
        age: -1,
        size: 0,
      };
    }
  }
}

// Export singleton instance
export const cacheService = new LeadsCacheService();

// Export class for testing or custom instances
export { LeadsCacheService };
