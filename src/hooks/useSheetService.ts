import { useState, useEffect, useCallback, useRef } from "react";
import { GoogleSheetsService } from "@/lib/googleSheets";
import { useToast } from "@/components/ui/use-toast";
import { secureStorage } from "@/lib/secureStorage";
import { cacheGet, cacheSet } from "@/lib/appCache";

export function useSheetService() {
  const [service, setService] = useState<GoogleSheetsService | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const { toast } = useToast();

  const initializeService = useCallback(async () => {
    // Cancel any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setLoading(true);
      setError(null);

      // Get structured credentials (localSecrets + persisted)
      const credentials = await secureStorage.getCredentials();
      if (!credentials) {
        if (mountedRef.current) {
          setError("Google credentials not found");
          setLoading(false);
        }
        return;
      }

      // Build service using credentials
      let localServiceAccountJson: string | undefined;
      try { localServiceAccountJson = localStorage.getItem('serviceAccountJson') || undefined; } catch {}
      const sheetService = new GoogleSheetsService({
        apiKey: credentials.googleApiKey || '',
        serviceAccountJson: credentials.googleServiceAccountJson || localServiceAccountJson,
        sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
        worksheetNames: credentials.worksheetNames,
        columnMappings: credentials.columnMappings,
      });

      if (!controller.signal.aborted && mountedRef.current) {
        setService(sheetService);
        
        // Load users (SWR: show cache, then refresh)
        try {
          const cachedUsers = await cacheGet<any[]>("crm_users_cache_v1", 10 * 60 * 1000);
          if (cachedUsers && mountedRef.current) setUsers(cachedUsers);

          const usersData = await sheetService.fetchUsers();
          if (!controller.signal.aborted && mountedRef.current) {
            setUsers(usersData);
            // Cache fresh users
            await cacheSet("crm_users_cache_v1", usersData);
          }
        } catch (err) {
          console.error("Failed to load users:", err);
          if (!controller.signal.aborted && mountedRef.current) {
            setError("Failed to load users");
          }
        }
        
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    } catch (err) {
      console.error("Failed to initialize sheet service:", err);
      if (!controller.signal.aborted && mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to initialize service");
        setLoading(false);
      }
    }
  }, [toast]);

  const refreshUsers = useCallback(async () => {
    if (!service) return;

    // Cancel any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const usersData = await service.fetchUsers();
      if (!controller.signal.aborted && mountedRef.current) {
        setUsers(usersData);
      }
    } catch (err) {
      console.error("Failed to refresh users:", err);
      if (!controller.signal.aborted && mountedRef.current) {
        toast({
          title: "Error",
          description: "Failed to refresh users",
          variant: "destructive",
        });
      }
    }
  }, [service, toast]);

  useEffect(() => {
    let mounted = true;
    
    const initialize = async () => {
      if (mounted) {
        await initializeService();
      }
    };
    
    mountedRef.current = true;
    initialize();

    return () => {
      mounted = false;
      mountedRef.current = false;
      
      // Cleanup abort controller
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [initializeService]);

  return {
    service,
    users,
    loading,
    error,
    refreshUsers,
  };
}
