import { useState, useEffect, useCallback, useRef } from "react";
import { changeQueue } from "@/lib/changeQueue";
import { dataService } from "@/lib/dataService";
import { networkService } from "@/lib/networkService";

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const updateOnlineStatus = useCallback(() => {
    setIsOnline(navigator.onLine);
  }, []);

  const syncPendingChanges = useCallback(async () => {
    // Cancel any existing sync
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (!navigator.onLine) return;

    setSyncing(true);
    try {
      const changes = await changeQueue.getAll();
      if (changes.length === 0) return;

      for (const change of changes) {
        if (controller.signal.aborted) break;
        
        try {
          await dataService.saveRecord(change.type, change.data, false);
          await changeQueue.remove(change.id!);
        } catch (error) {
          console.error(`Failed to sync change ${change.id}:`, error);
          // Continue with other changes even if one fails
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error("Sync failed:", error);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setSyncing(false);
      updatePendingChanges();
    }
  }, []);

  const updatePendingChanges = useCallback(async () => {
    try {
      const changes = await changeQueue.getAll();
      setPendingChanges(changes.length);
    } catch (error) {
      console.error("Failed to get pending changes:", error);
      setPendingChanges(0);
    }
  }, []);

  useEffect(() => {
    // Set up network status monitoring
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    // Initial status check
    updateOnlineStatus();
    updatePendingChanges();

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      
      // Cleanup sync timeout
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
      
      // Cleanup abort controller
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [updateOnlineStatus, updatePendingChanges]);

  useEffect(() => {
    // Sync when coming back online with debouncing
    if (isOnline && pendingChanges > 0) {
      // Clear existing timeout
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      
      // Set new timeout to avoid rapid syncs
      syncTimeoutRef.current = setTimeout(() => {
        syncPendingChanges();
      }, 3000); // 3 second debounce to prevent rapid syncs
    }

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
    };
  }, [isOnline, pendingChanges, syncPendingChanges]);

  // Monitor for changes
  useEffect(() => {
    const interval = setInterval(updatePendingChanges, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [updatePendingChanges]);

  return {
    isOnline,
    pendingChanges,
    syncing,
    syncNow: syncPendingChanges,
  };
}