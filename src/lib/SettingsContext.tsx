import React, { createContext, useContext, useEffect, useState } from 'react';

interface SettingsContextValue {
  serviceAccountJson: string;
  setServiceAccountJson: (value: string) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  serviceAccountJson: '',
  setServiceAccountJson: () => {},
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [serviceAccountJson, setServiceAccountJson] = useState<string>('');

  // Load saved JSON on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('serviceAccountJson');
      if (stored) {
        setServiceAccountJson(stored);
        console.log('Loaded service account JSON from localStorage ✅');
      }
    } catch {}
  }, []);

  // Persist on update
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (serviceAccountJson) {
        localStorage.setItem('serviceAccountJson', serviceAccountJson);
      }
    } catch {}
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
