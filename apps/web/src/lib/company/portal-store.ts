import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PortalKey } from "./portals";

interface PortalState {
  /** Son ziyaret edilen portal — /company landing yönlendirmesi için. */
  lastPortal: PortalKey | null;
  setLastPortal: (p: PortalKey) => void;
  /**
   * Sidebar sabit mi? false (varsayılan) = ikon rayı; mouse gelince genişler,
   * çekilince daralır. true = hep açık (pin).
   */
  sidebarPinned: boolean;
  toggleSidebarPinned: () => void;
}

export const usePortalStore = create<PortalState>()(
  persist(
    (set) => ({
      lastPortal: null,
      setLastPortal: (p) => set({ lastPortal: p }),
      sidebarPinned: false,
      toggleSidebarPinned: () =>
        set((s) => ({ sidebarPinned: !s.sidebarPinned })),
    }),
    { name: "rothern-company-portal" },
  ),
);
