"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SupplierSidebarState {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
}

export const useSupplierSidebar = create<SupplierSidebarState>()(
  persist(
    (set, get) => ({
      collapsed: false,
      toggle: () => set({ collapsed: !get().collapsed }),
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    {
      name: "supkeys-supplier-sidebar",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ collapsed: s.collapsed }),
    },
  ),
);
