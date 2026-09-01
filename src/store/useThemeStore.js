import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const applyTheme = (theme) => {
  const root = document.documentElement;

  if (theme === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }
};

const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: 'light',

      initTheme: () => {
        applyTheme(get().theme);
      },

      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },

      toggleTheme: () => {
        const nextTheme = get().theme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
        set({ theme: nextTheme });
      },
    }),
    {
      name: 'taste-map-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme || 'light');
        }
      },
    }
  )
);

export default useThemeStore;
