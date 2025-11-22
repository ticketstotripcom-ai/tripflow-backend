import { Preferences } from '@capacitor/preferences';

export const persistState = async (key: string, data: any) => {
  const payload = JSON.stringify(data);
  try {
    
  } catch (err) {
    console.warn('Failed to persist state', err);
  }
  try {
    await Preferences.set({ key, value: payload });
    console.log('State persisted to Preferences', key);
  } catch (err) {
    console.warn('Failed to persist state', err);
  }
};

export const restoreState = async (key: string) => {
  try {
    const { value } = await Preferences.get({ key });
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};
