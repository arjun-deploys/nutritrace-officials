import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  theme: 'light' | 'dark';
  language: string;
  /** Area the officer is looking at; never wider than their own scope (enforced server-side). */
  geoPath: string | null;
  setTheme: (t: UiState['theme']) => void;
  setLanguage: (l: string) => void;
  setGeoPath: (g: string | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'light',
      language: 'en',
      geoPath: null,
      setTheme: (theme) => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        set({ theme });
      },
      setLanguage: (language) => set({ language }),
      setGeoPath: (geoPath) => set({ geoPath }),
    }),
    { name: 'nt-ui', partialize: (s) => ({ theme: s.theme, language: s.language }) },
  ),
);
