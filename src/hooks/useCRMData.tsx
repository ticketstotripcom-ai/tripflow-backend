import { useEffect, useState } from "react";
import { syncData } from "../services/dataService";
import { cacheService } from "../utils/cacheService";

export function useCRMData() {
  const [data, setData] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    (async () => {
      const cached = await cacheService.getData();
      if (cached) setData(cached as any[]); // load instantly

      await refreshData(); // sync in background
      const interval = setInterval(refreshData, 5 * 60 * 1000); // 5 min sync
      window.addEventListener("focus", refreshData);

      return () => {
        clearInterval(interval);
        window.removeEventListener("focus", refreshData);
      };
    })();
  }, []);

  async function refreshData() {
    setSyncing(true);
    try {
      const newData = await syncData();
      setData(newData);
    } catch (error) {
      console.error("Failed to sync data:", error);
    } finally {
      setSyncing(false);
    }
  }

  return { data, syncing, refreshData };
}