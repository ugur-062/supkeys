import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PortalKey } from "./portals";

interface PortalState {
  /** Son ziyaret edilen portal — /company landing yönlendirmesi için. */
  lastPortal: PortalKey | null;
  setLastPortal: (p: PortalKey) => void;
  /**
   * Sidebar sabit mi? true (varsayılan, Faz 8.1) = hep açık/METİNLİ —
   * ikon-only ray ayırt edilemiyordu. false = ikon rayı; hover'da genişler.
   * Tercih localStorage'da kalıcı (pin butonu).
   */
  sidebarPinned: boolean;
  toggleSidebarPinned: () => void;
}

export const usePortalStore = create<PortalState>()(
  persist(
    (set) => ({
      lastPortal: null,
      setLastPortal: (p) => set({ lastPortal: p }),
      sidebarPinned: true,
      toggleSidebarPinned: () =>
        set((s) => ({ sidebarPinned: !s.sidebarPinned })),
    }),
    {
      name: "rothern-company-portal",
      // v1→v2 (Faz 8.1): varsayılan genişletilmişe TEK SEFERLİK taşıma —
      // eski false'lar bilinçli tercih değil eski varsayılandı; bundan
      // sonraki pin/unpin tercihi aynen kalıcı.
      version: 2,
      migrate: (state, version) => {
        const s = state as PortalState;
        if (version < 2) return { ...s, sidebarPinned: true };
        return s;
      },
    },
  ),
);
