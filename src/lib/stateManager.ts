// State persistence and caching for CRM
import { SheetLead } from './googleSheets';
import { secureStorage } from './secureStorage';
import { persistCacheSnapshot, readCacheSnapshot } from './deviceStorage';

interface AppState {
  // Dashboard state
  activeTab: string;
  searchQuery: string;
  statusFilter: string;
  priorityFilter: string;
  dateFilter: string;
  dateFromFilter?: string;
  dateToFilter?: string;
  consultantFilter: string;
  swipeEnabled: boolean;
  
  // Cached data
  cachedLeads: SheetLead[];
  lastFetchTime: number;
  
  // Scroll positions
  scrollPositions: Record<string, number>;
}

const STATE_KEY = 'crm_app_state';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const PERSISTENT_LEADS_KEY = 'crm_persistent_leads_cache';

class StateManager {
  private state: AppState = {
    activeTab: 'new',
    searchQuery: '',
    statusFilter: 'All Statuses',
    priorityFilter: 'All Priorities',
    dateFilter: '',
    dateFromFilter: '',
    dateToFilter: '',
    consultantFilter: 'All Consultants',
    swipeEnabled: true,
    cachedLeads: [],
    lastFetchTime: 0,
    scrollPositions: {}
  };

  constructor() {
    this.loadState();
    // Attempt to hydrate cached leads from device storage asynchronously
    // so large datasets persist across app launches on mobile/web.
    // Fire-and-forget; updates state when available.
    this.hydratePersistentCache();
  }

  private loadState(): void {
    try {
      const stored = localStorage.getItem(STATE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.state = { ...this.state, ...parsed };
      }
    } catch (error) {
      console.error('Failed to load state:', error);
    }
  }

  private saveState(): void {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  }

  private async hydratePersistentCache(): Promise<void> {
    try {
      let parsed: { leads: SheetLead[]; lastFetchTime: number } | null = null;
      const stored = await secureStorage.get(PERSISTENT_LEADS_KEY);
      if (stored) {
        parsed = JSON.parse(stored) as { leads: SheetLead[]; lastFetchTime: number };
      }
      if (!parsed) {
        parsed = await readCacheSnapshot<{ leads: SheetLead[]; lastFetchTime: number }>('leads');
      }
      if (!parsed) return;
      // Only hydrate if our in-memory cache is empty or older
      if (
        (!this.state.cachedLeads || this.state.cachedLeads.length === 0) ||
        (parsed.lastFetchTime && parsed.lastFetchTime > this.state.lastFetchTime)
      ) {
        this.state.cachedLeads = parsed.leads || [];
        this.state.lastFetchTime = parsed.lastFetchTime || 0;
        this.saveState();
      }
    } catch (err) {
      console.warn('Failed to hydrate persistent cache:', err);
    }
  }

  // Dashboard state
  getActiveTab(): string {
    return this.state.activeTab;
  }

  setActiveTab(tab: string): void {
    this.state.activeTab = tab;
    this.saveState();
  }

  getSearchQuery(): string {
    return this.state.searchQuery;
  }

  setSearchQuery(query: string): void {
    this.state.searchQuery = query;
    this.saveState();
  }

  getFilters(): {
    statusFilter: string;
    priorityFilter: string;
    dateFilter: string;
    dateFromFilter?: string;
    dateToFilter?: string;
    consultantFilter: string;
  } {
    return {
      statusFilter: this.state.statusFilter,
      priorityFilter: this.state.priorityFilter,
      dateFilter: this.state.dateFilter,
      dateFromFilter: this.state.dateFromFilter,
      dateToFilter: this.state.dateToFilter,
      consultantFilter: this.state.consultantFilter
    };
  }

  setFilters(filters: Partial<{
    statusFilter: string;
    priorityFilter: string;
    dateFilter: string;
    dateFromFilter: string;
    dateToFilter: string;
    consultantFilter: string;
  }>): void {
    this.state = { ...this.state, ...filters };
    this.saveState();
  }

  getSwipeEnabled(): boolean {
    return this.state.swipeEnabled !== false;
  }

  setSwipeEnabled(enabled: boolean): void {
    this.state.swipeEnabled = enabled;
    this.saveState();
  }

  // Cache management
  getCachedLeads(): { leads: SheetLead[]; isValid: boolean } {
    const now = Date.now();
    const isValid = (now - this.state.lastFetchTime) < CACHE_DURATION;
    return {
      leads: this.state.cachedLeads,
      isValid: isValid && this.state.cachedLeads.length > 0
    };
  }

  setCachedLeads(leads: SheetLead[]): void {
    this.state.cachedLeads = leads;
    this.state.lastFetchTime = Date.now();
    this.saveState();
    // Persist large datasets to device storage for fast subsequent loads
    secureStorage
      .set(PERSISTENT_LEADS_KEY, JSON.stringify({ leads, lastFetchTime: this.state.lastFetchTime }))
      .catch((e) => console.warn('Failed to persist leads cache:', e));
    // Keep a localStorage copy for offline web contexts
    try {
      localStorage.setItem('crm_leads_cache_v1', JSON.stringify({ leads, lastFetchTime: this.state.lastFetchTime }));
    } catch {}
    void persistCacheSnapshot('leads', { leads, lastFetchTime: this.state.lastFetchTime });
  }

  invalidateCache(): void {
    this.state.lastFetchTime = 0;
    this.saveState();
    secureStorage.remove(PERSISTENT_LEADS_KEY).catch(() => {});
  }

  // Scroll positions
  getScrollPosition(key: string): number {
    return this.state.scrollPositions[key] || 0;
  }

  setScrollPosition(key: string, position: number): void {
    this.state.scrollPositions[key] = position;
    this.saveState();
  }

  // Clear all state
  clearAll(): void {
    localStorage.removeItem(STATE_KEY);
    this.state = {
      activeTab: 'new',
      searchQuery: '',
      statusFilter: 'All Statuses',
      priorityFilter: 'All Priorities',
      dateFilter: '',
      dateFromFilter: '',
      dateToFilter: '',
      consultantFilter: 'All Consultants',
      swipeEnabled: true,
      cachedLeads: [],
      lastFetchTime: 0,
      scrollPositions: {}
    };
  }
}

export const stateManager = new StateManager();
