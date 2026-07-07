"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AuthAdmin } from "./types";

/**
 * Oturum artık httpOnly cookie'de (XSS'e kapalı) — token BURADA TUTULMAZ.
 * Store yalnız UI için `admin` snapshot'ını tutar; gerçek kimlik cookie'dir,
 * /me ile doğrulanır. `admin` varlığı "giriş yapıldı" sinyalidir.
 */
interface AdminAuthState {
  admin: AuthAdmin | null;
  isHydrated: boolean;
  setAuth: (admin: AuthAdmin) => void;
  setAdmin: (admin: AuthAdmin) => void;
  clear: () => void;
  setHydrated: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      admin: null,
      isHydrated: false,
      setAuth: (admin) => set({ admin }),
      setAdmin: (admin) => set({ admin }),
      clear: () => set({ admin: null }),
      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: "rothern-admin-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ admin: state.admin }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
