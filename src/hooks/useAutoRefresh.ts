import { useEffect, useRef } from 'react';
import { fetchLatestLeads, fetchAnnouncements } from '@/services/googleSheets';

export const useAutoRefresh = (interval = 300000) => {
  const lastSync = useRef<number>(0);

  useEffect(() => {
    const doRefresh = async () => {
      const now = Date.now();
      if (lastSync.current && now - lastSync.current < interval) return;
      lastSync.current = now;
      try {
        await Promise.all([
          fetchLatestLeads(true),
          fetchAnnouncements(true),
        ]);
        console.log('✅ Background refresh complete');
      } catch (err) {
        console.warn('Auto refresh failed', err);
      }
    };
    const timer = setInterval(doRefresh, interval);
    return () => clearInterval(timer);
  }, [interval]);
};

