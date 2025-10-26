// State persistence and caching for CRM
import { SheetLead } from './googleSheets';

interface AppState {
  // Dashboard state
  activeTab: string;
  searchQuery: string;
  statusFilter: string;
  priorityFilter: string;
  dateFilter: string;
  consultantFilter: string;
  
  // Cached data
  cachedLeads: SheetLead[];
  lastFetchTime: number;
  
  // Scroll positions
  scrollPositions: Record<string, number>;
}

const STATE_KEY = 'crm_app_state';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

class StateManager {
  private state: AppState = {
    activeTab: 'new',
    searchQuery: '',
    statusFilter: 'All Statuses',
    priorityFilter: 'All Priorities',
    dateFilter: '',
    consultantFilter: 'All Consultants',
    cachedLeads: [],
    lastFetchTime: 0,
    scrollPositions: {}
  };

  constructor() {
    this.loadState();
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
    consultantFilter: string;
  } {
    return {
      statusFilter: this.state.statusFilter,
      priorityFilter: this.state.priorityFilter,
      dateFilter: this.state.dateFilter,
      consultantFilter: this.state.consultantFilter
    };
  }

  setFilters(filters: Partial<{
    statusFilter: string;
    priorityFilter: string;
    dateFilter: string;
    consultantFilter: string;
  }>): void {
    this.state = { ...this.state, ...filters };
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
  }

  invalidateCache(): void {
    this.state.lastFetchTime = 0;
    this.saveState();
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
      consultantFilter: 'All Consultants',
      cachedLeads: [],
      lastFetchTime: 0,
      scrollPositions: {}
    };
  }
}

export const stateManager = new StateManager();
