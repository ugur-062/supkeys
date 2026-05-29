"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SupplierSidebarState {
  collapsed: boolean;
  /** Mobil drawer açık mı (hamburger ile açılır, rota değişince kapanır) */
  mobileOpen: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
  openMobile: () => void;
  closeMobile: () => void;
}

export const useSupplierSidebar = create<SupplierSidebarState>()(
  persist(
    (set, get) => ({
      collapsed: false,
      mobileOpen: false,
      toggle: () => set({ collapsed: !get().collapsed }),
      setCollapsed: (collapsed) => set({ collapsed }),
      openMobile: () => set({ mobileOpen: true }),
      closeMobile: () => set({ mobileOpen: false }),
    }),
    {
      name: "supkeys-supplier-sidebar",
      storage: createJSONStorage(() => localStorage),
      // mobileOpen kalıcı olmamalı (sayfa kapanınca sıfırlanır)
      partialize: (s) => ({ collapsed: s.collapsed }),
    },
  ),
);
