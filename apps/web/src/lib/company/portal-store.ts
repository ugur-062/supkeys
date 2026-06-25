import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PortalKey } from "./portals";

interface PortalState {
  /** Son ziyaret edilen portal — /company landing yönlendirmesi için. */
  lastPortal: PortalKey | null;
  setLastPortal: (p: PortalKey) => void;
}

export const usePortalStore = create<PortalState>()(
  persist(
    (set) => ({
      lastPortal: null,
      setLastPortal: (p) => set({ lastPortal: p }),
    }),
    { name: "rothern-company-portal" },
  ),
);
