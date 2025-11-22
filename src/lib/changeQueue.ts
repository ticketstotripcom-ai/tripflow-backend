/**
 * Change Queue Service
 * Manages pending changes when offline for later synchronization
 */

export interface PendingChange {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: 'lead' | 'user' | 'booking';
  data: any;
  timestamp: number;
  attempts: number;
  lastAttempt?: number;
}

export interface ChangeQueueConfig {
  maxAttempts: number;
  retryDelay: number;
  maxRetryDelay: number;
}

class ChangeQueueService {
  private queue: PendingChange[] = [];
  private config: ChangeQueueConfig = {
    maxAttempts: 3,
    retryDelay: 1000,
    maxRetryDelay: 30000
  };
  private listeners: Set<(queue: PendingChange[]) => void> = new Set();

  constructor() {
    this.loadQueue();
  }

  /**
   * Add a change to the queue
   */
  addChange(change: Omit<PendingChange, 'id' | 'timestamp' | 'attempts'>): PendingChange {
    const pendingChange: PendingChange = {
      ...change,
      id: this.generateId(),
      timestamp: Date.now(),
      attempts: 0
    };

    this.queue.push(pendingChange);
    this.saveQueue();
    this.notifyListeners();

    return pendingChange;
  }

  /**
   * Get all pending changes (alias for getPendingChanges for compatibility)
   */
  getAll(): PendingChange[] {
    return this.getPendingChanges();
  }

  /**
   * Get all pending changes
   */
  getPendingChanges(): PendingChange[] {
    return [...this.queue];
  }

  /**
   * Get changes ready for synchronization (attempts < maxAttempts)
   */
  getChangesForSync(): PendingChange[] {
    return this.queue.filter(change => change.attempts < this.config.maxAttempts);
  }

  /**
   * Remove a change from the queue (successful sync)
   */
  remove(id: string): void {
    this.removeChange(id);
  }

  /**
   * Remove a change from the queue (successful sync)
   */
  removeChange(id: string): boolean {
    const index = this.queue.findIndex(change => change.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.saveQueue();
      this.notifyListeners();
      return true;
    }
    return false;
  }

  /**
   * Increment attempt count for a change (failed sync)
   */
  incrementAttempt(id: string): void {
    const change = this.queue.find(c => c.id === id);
    if (change) {
      change.attempts++;
      change.lastAttempt = Date.now();
      this.saveQueue();
      this.notifyListeners();
    }
  }

  /**
   * Clear all changes from the queue
   */
  clearQueue(): void {
    this.queue = [];
    this.saveQueue();
    this.notifyListeners();
  }

  /**
   * Get the number of pending changes
   */
  getPendingCount(): number {
    return this.queue.length;
  }

  /**
   * Check if there are any pending changes
   */
  hasPendingChanges(): boolean {
    return this.queue.length > 0;
  }

  /**
   * Subscribe to queue changes
   */
  subscribe(callback: (queue: PendingChange[]) => void): () => void {
    this.listeners.add(callback);
    callback(this.queue); // Initial notification
    
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    total: number;
    ready: number;
    failed: number;
    byType: Record<string, number>;
    byEntity: Record<string, number>;
  } {
    const ready = this.getChangesForSync().length;
    const failed = this.queue.filter(c => c.attempts >= this.config.maxAttempts).length;
    
    const byType = this.queue.reduce((acc, change) => {
      acc[change.type] = (acc[change.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byEntity = this.queue.reduce((acc, change) => {
      acc[change.entity] = (acc[change.entity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: this.queue.length,
      ready,
      failed,
      byType,
      byEntity
    };
  }

  private generateId(): string {
    return `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private saveQueue(): void {
    try {
      localStorage.setItem('changeQueue', JSON.stringify(this.queue));
    } catch (error) {
      console.warn('Failed to save change queue to localStorage:', error);
      // Fallback to memory only
    }
  }

  private loadQueue(): void {
    try {
      const saved = localStorage.getItem('changeQueue');
      if (saved) {
        this.queue = JSON.parse(saved);
      }
    } catch (error) {
      console.warn('Failed to load change queue from localStorage:', error);
      this.queue = [];
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.queue);
      } catch (error) {
        console.warn('Change queue listener error:', error);
      }
    });
  }
}

// Export singleton instance
export const changeQueue = new ChangeQueueService();