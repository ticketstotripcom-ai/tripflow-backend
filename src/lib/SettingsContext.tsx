import React, { createContext, useContext, useEffect, useState } from 'react';

export interface SettingsContextValue {
  serviceAccountJson: any | null;
  setServiceAccountJson: (value: any | null) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  serviceAccountJson: null,
  setServiceAccountJson: () => {},
});

// Safe parser + sanitizer for Google Service Account JSON
export function sanitizeServiceAccountJson(raw: string) {
  if (!raw) return null;
  try {
    let fixed = String(raw).trim();

    // If the value is already an object stringified once, unwrap it first
    if (fixed.startsWith('"') && fixed.endsWith('"')) {
      fixed = JSON.parse(fixed);
    }

    // Replace escaped newlines with real ones and strip carriage returns
    // Also handle cases where the JSON itself used literal \n inside strings
    // We'll normalize after parsing as well
    // Note: We only do text replacements before first parse attempt
    const preParsed = JSON.parse(
      fixed
        .replace(/\\n/g, '\n')
        .replace(/\r/g, '')
    );

    // Ensure private_key has real newlines for downstream crypto
    if (preParsed && typeof preParsed === 'object' && preParsed.private_key) {
      preParsed.private_key = String(preParsed.private_key)
        .replace(/\\n/g, '\n')
        .replace(/\r/g, '');
    }

    return preParsed;
  } catch (err) {
    console.error('❌ Invalid service account JSON:', err);
    return null;
  }
}

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [serviceAccountJson, setServiceAccountJson] = useState<any | null>(null);

  // Load saved JSON on mount (sanitized)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('serviceAccountJson');
      if (stored) {
        const parsed = sanitizeServiceAccountJson(stored);
        if (parsed) {
          console.log('✅ Loaded service account JSON from localStorage');
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
        localStorage.setItem('serviceAccountJson', JSON.stringify(serviceAccountJson));
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
