// State persistence and caching for CRM (clean)
import { SheetLead } from './googleSheets';
import { secureStorage } from './secureStorage';
import { saveLeadsCache, loadLeadsCache } from './nativeStorage';
import { Preferences } from '@capacitor/preferences';

interface AppState {
  activeTab: string;
  searchQuery: string;
  statusFilter: string;
  priorityFilter: string;
  dateFilter: string;
  dateFromFilter?: string;
  dateToFilter?: string;
  consultantFilter: string;
  swipeEnabled: boolean;
  cachedLeads: SheetLead[];
  lastFetchTime: number;
  scrollPositions: Record<string, number>;
  pendingTarget?: { travellerName?: string; dateAndTime?: string; tripId?: string; route?: string } | null;
  isPopupOpen: boolean; // New state for popup visibility
}

const STATE_KEY = 'crm_app_state';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const PERSISTENT_LEADS_KEY = 'crm_persistent_leads_cache';

type StateListener = (state: AppState) => void;

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
    swipeEnabled: false,
    cachedLeads: [],
    lastFetchTime: 0,
    scrollPositions: {},
    isPopupOpen: false, // Default to false
  };
  private listeners: StateListener[] = [];

  constructor() {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STATE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as AppState;
        this.state = { ...this.state, ...parsed, isPopupOpen: false }; // Ensure popup is always closed on init
      }
    } catch {}
    this.initializeFromPreferences();
    this.hydratePersistentCache();
  }

  private async initializeFromPreferences() {
    try {
      const res = await Preferences.get({ key: STATE_KEY });
      if (res && res.value) {
        const parsed = JSON.parse(res.value) as AppState;
        this.state = { ...this.state, ...parsed, isPopupOpen: false };
      }
    } catch (err) {
      console.warn('Failed to initialize state from Preferences:', err);
    }
  }

  private saveState(): void {
    const payload = JSON.stringify(this.state);
    Preferences.set({ key: STATE_KEY, value: payload }).catch(()=>{});
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(STATE_KEY, payload); } catch {}
    this.notifyListeners();
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state));
  }

  // Popup state
  getIsPopupOpen(): boolean { return this.state.isPopupOpen; }
  setIsPopupOpen(isOpen: boolean): void {
    if (this.state.isPopupOpen !== isOpen) {
      console.log('Popup state changing from', this.state.isPopupOpen, 'to', isOpen);
      this.state.isPopupOpen = isOpen;
      this.saveState();
    }
  }
  resetPopupState(): void {
    console.log('Resetting popup state to false');
    this.state.isPopupOpen = false;
    this.saveState();
  }

  // Deep-link target
  setPendingTarget(target: { travellerName?: string; dateAndTime?: string; tripId?: string; route?: string } | null): void {
    this.state.pendingTarget = target;
    this.saveState();
  }
  consumePendingTarget(): { travellerName?: string; dateAndTime?: string; tripId?: string; route?: string } | null {
    const t = this.state.pendingTarget || null;
    this.state.pendingTarget = null;
    this.saveState();
    return t;
  }

  private async hydratePersistentCache(): Promise<void> {
    try {
      let parsed: { leads: SheetLead[]; lastFetchTime: number } | null = null;
      try {
        const fs = await loadLeadsCache<SheetLead[]>();
        if (fs && fs.length) parsed = { leads: fs, lastFetchTime: Date.now() };
      } catch {}
      if (!parsed) {
        const stored = await secureStorage.get(PERSISTENT_LEADS_KEY);
        if (stored) parsed = JSON.parse(stored) as { leads: SheetLead[]; lastFetchTime: number };
      }
      if (!parsed) return;
      if ((!this.state.cachedLeads || this.state.cachedLeads.length === 0) || (parsed.lastFetchTime && parsed.lastFetchTime > this.state.lastFetchTime)) {
        this.state.cachedLeads = parsed.leads || [];
        this.state.lastFetchTime = parsed.lastFetchTime || 0;
        this.saveState();
      }
    } catch (err) {
      console.warn('Failed to hydrate persistent cache:', err);
    }
  }

  // Dashboard state
  getActiveTab(): string { return this.state.activeTab; }
  setActiveTab(tab: string): void { this.state.activeTab = tab; this.saveState(); }

  getSearchQuery(): string { return this.state.searchQuery; }
  setSearchQuery(query: string): void { this.state.searchQuery = query; this.saveState(); }

  getFilters(): { statusFilter: string; priorityFilter: string; dateFilter: string; dateFromFilter?: string; dateToFilter?: string; consultantFilter: string; } {
    return {
      statusFilter: this.state.statusFilter,
      priorityFilter: this.state.priorityFilter,
      dateFilter: this.state.dateFilter,
      dateFromFilter: this.state.dateFromFilter,
      dateToFilter: this.state.dateToFilter,
      consultantFilter: this.state.consultantFilter,
    };
  }
  setFilters(filters: Partial<{ statusFilter: string; priorityFilter: string; dateFilter: string; dateFromFilter: string; dateToFilter: string; consultantFilter: string; }>): void {
    this.state = { ...this.state, ...filters };
    this.saveState();
  }

  getSwipeEnabled(): boolean { return this.state.swipeEnabled !== false; }
  setSwipeEnabled(enabled: boolean): void { this.state.swipeEnabled = enabled; this.saveState(); }

  // Cache management
  getCachedLeads(): { leads: SheetLead[]; isValid: boolean } {
    const now = Date.now();
    const isValid = (now - this.state.lastFetchTime) < CACHE_DURATION;
    return { leads: this.state.cachedLeads, isValid: isValid && this.state.cachedLeads.length > 0 };
  }
  setCachedLeads(leads: SheetLead[]): void {
    const MAX_LEADS_CACHE = 1000;
    const trimmed = Array.isArray(leads) ? leads.slice(0, MAX_LEADS_CACHE) : [];
    this.state.cachedLeads = trimmed;
    this.state.lastFetchTime = Date.now();
    this.saveState();
    secureStorage.set(PERSISTENT_LEADS_KEY, JSON.stringify({ leads: trimmed, lastFetchTime: this.state.lastFetchTime })).catch(() => {});
    saveLeadsCache(trimmed).catch(()=>{});
  }
  invalidateCache(): void {
    this.state.lastFetchTime = 0;
    this.saveState();
    secureStorage.remove(PERSISTENT_LEADS_KEY).catch(() => {});
  }

  // Scroll positions
  getScrollPosition(key: string): number { return this.state.scrollPositions[key] || 0; }
  setScrollPosition(key: string, position: number): void { this.state.scrollPositions[key] = position; this.saveState(); }

  // Clear all state
  clearAll(): void {
    Preferences.remove({ key: STATE_KEY }).catch(()=>{});
    this.state = {
      activeTab: 'new',
      searchQuery: '',
      statusFilter: 'All Statuses',
      priorityFilter: 'All Priorities',
      dateFilter: '',
      dateFromFilter: '',
      dateToFilter: '',
      consultantFilter: 'All Consultants',
      swipeEnabled: false,
      cachedLeads: [],
      lastFetchTime: 0,
      scrollPositions: {}
    };
  }
}

export const stateManager = new StateManager();
