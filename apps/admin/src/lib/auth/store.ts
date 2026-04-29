"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AuthAdmin } from "./types";

interface AdminAuthState {
  token: string | null;
  admin: AuthAdmin | null;
  isHydrated: boolean;
  setAuth: (token: string, admin: AuthAdmin) => void;
  setAdmin: (admin: AuthAdmin) => void;
  clear: () => void;
  setHydrated: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      token: null,
      admin: null,
      isHydrated: false,
      setAuth: (token, admin) => set({ token, admin }),
      setAdmin: (admin) => set({ admin }),
      clear: () => set({ token: null, admin: null }),
      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: "supkeys-admin-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ token: state.token, admin: state.admin }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
