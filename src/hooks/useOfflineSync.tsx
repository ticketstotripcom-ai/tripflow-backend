import { useEffect, useState } from 'react';
import { changeQueue } from '../utils/cacheService';

export function useOfflineSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    async function checkPending() {
      const pending = await changeQueue.getAll();
      setPendingCount(pending.length);
    }
    
    checkPending();
    const interval = setInterval(checkPending, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function pushPending() {
      if (!navigator.onLine) return;
      
      const pending = await changeQueue.getAll();
      if (pending.length === 0) return;
      
      setIsSyncing(true);
      
      try {
        for (const item of pending) {
          await fetch("/api/saveRecord", { 
            method: "POST", 
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(item) 
          });
        }
        
        await changeQueue.clear();
        setPendingCount(0);
      } catch (error) {
        console.error("Failed to sync offline changes:", error);
      } finally {
        setIsSyncing(false);
      }
    }

    window.addEventListener("online", pushPending);
    pushPending(); // Try to push on mount
    
    return () => window.removeEventListener("online", pushPending);
  }, []);

  return { isSyncing, pendingCount };
}