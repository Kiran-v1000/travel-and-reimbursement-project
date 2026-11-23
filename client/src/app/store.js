import { create } from 'zustand';

const readTheme = () => {
  try {
    return localStorage.getItem('voyage-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } catch {
    return 'light';
  }
};

/** App-wide client state (server data lives in React Query). */
export const useAppStore = create((set, get) => ({
  user: null,
  delegatedFrom: [],
  booting: true,
  theme: readTheme(),
  sidebarOpen: false,
  paletteOpen: false,

  setSession: (user, delegatedFrom = []) => set({ user, delegatedFrom, booting: false }),
  clearSession: () => set({ user: null, delegatedFrom: [], booting: false }),
  setSidebar: (sidebarOpen) => set({ sidebarOpen }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
  toggleTheme: () => {
    const theme = get().theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('voyage-theme', theme);
    } catch {
      /* storage unavailable - theme still applies for this visit */
    }
    set({ theme });
  },
}));

export const hasRole = (user, ...roles) => !!user && roles.includes(user.role);
