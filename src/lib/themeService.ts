// Enhanced Dark/Light/System theme management
import { Preferences } from '@capacitor/preferences';

const THEME_KEY = 'app_theme';
export type Theme = 'light' | 'dark' | 'system';

class ThemeService {
  private currentTheme: Theme = 'system';

  async initialize(): Promise<void> {
    const { value } = await Preferences.get({ key: THEME_KEY });
    this.currentTheme = (value as Theme) || 'system';
    this.applyTheme(this.getResolvedTheme());
    this.listenToSystemChanges();
  }

  async setTheme(theme: Theme): Promise<void> {
    this.currentTheme = theme;
    await Preferences.set({ key: THEME_KEY, value: theme });
    this.applyTheme(this.getResolvedTheme());
  }

  getTheme(): Theme {
    return this.currentTheme;
  }

  async toggleTheme(): Promise<Theme> {
    const newTheme: Theme =
      this.currentTheme === 'light'
        ? 'dark'
        : this.currentTheme === 'dark'
        ? 'system'
        : 'light';
    await this.setTheme(newTheme);
    return newTheme;
  }

  private getResolvedTheme(): 'light' | 'dark' {
    if (this.currentTheme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return this.currentTheme;
  }

  private applyTheme(theme: 'light' | 'dark'): void {
    // Smooth transition for better UX
    document.documentElement.style.transition =
      'background-color 0.3s ease, color 0.3s ease';
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  private listenToSystemChanges(): void {
    // Listen to system theme changes when user selects "system"
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
      if (this.currentTheme === 'system') {
        this.applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }
}

export const themeService = new ThemeService();
