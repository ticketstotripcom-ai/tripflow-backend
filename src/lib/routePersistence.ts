// Simple last-route persistence to speed up cold starts and restore context
const KEY = 'crm_last_route_v1';

export function setLastRoute(path: string) {
  try {
    if (!path) return;
    localStorage.setItem(KEY, path);
  } catch {}
}

export function getLastRoute(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v || null;
  } catch {
    return null;
  }
}

