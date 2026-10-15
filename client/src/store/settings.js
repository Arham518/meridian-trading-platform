import { create } from 'zustand';
import { api } from '../lib/api.js';

export const useSettings = create((set) => ({
  siteName: 'Meridian',
  tagline: 'Trade signals, live charts and paper trading in one place.',
  heroVideoUrl: null,
  ads: [],
  async load() {
    try {
      const s = await api('/settings');
      set({ siteName: s.siteName, tagline: s.tagline, heroVideoUrl: s.heroVideoUrl || null, ads: s.ads || [] });
      document.title = `${s.siteName} | Trade signals, live charts and paper trading`;
    } catch { /* defaults */ }
  },
  set: (p) => set(p),
}));
