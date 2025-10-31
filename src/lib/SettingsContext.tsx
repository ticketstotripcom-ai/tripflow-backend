import React, { createContext, useContext, useEffect, useState } from 'react';
import { parseServiceAccountJson, stringifyServiceAccountJson, ServiceAccountJson } from './serviceAccount';

export interface SettingsContextValue {
  serviceAccountJson: ServiceAccountJson;
  setServiceAccountJson: (value: ServiceAccountJson) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  serviceAccountJson: null,
  setServiceAccountJson: () => {},
});

// Safe parser + sanitizer for Google Service Account JSON (backwards compatible export)
export function sanitizeServiceAccountJson(raw: unknown): ServiceAccountJson {
  return parseServiceAccountJson(raw);
}

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [serviceAccountJson, setServiceAccountJson] = useState<ServiceAccountJson>(null);

  // Load saved JSON on mount (sanitized)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('serviceAccountJson');
      if (stored) {
        const parsed = sanitizeServiceAccountJson(stored);
        if (parsed) {
          console.log('✅ Loaded valid service account JSON (localhost)');
          setServiceAccountJson(parsed);
        } else {
          console.warn('⚠️ Failed to parse saved service account JSON');
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not read service account JSON from localStorage:', err);
    }
  }, []);

  // Persist sanitized object to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (serviceAccountJson) {
        const serialized = stringifyServiceAccountJson(serviceAccountJson);
        if (serialized) {
          localStorage.setItem('serviceAccountJson', serialized);
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not persist service account JSON to localStorage:', err);
    }
  }, [serviceAccountJson]);

  return (
    <SettingsContext.Provider value={{ serviceAccountJson, setServiceAccountJson }}>
      {children}
    </SettingsContext.Provider>
  );
};

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
