"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CompanyProfile, CompanyUserDto } from "./types";

/**
 * Oturum artık httpOnly cookie'de (XSS'e kapalı) — token BURADA TUTULMAZ.
 * Store yalnız UI için `user`/`company` snapshot'ını tutar (anlık boyama);
 * gerçek kimlik cookie'dir, /me ile doğrulanır. `user` varlığı "giriş yapıldı"
 * sinyalidir (gate'ler bunu okur).
 */
interface CompanyAuthState {
  user: CompanyUserDto | null;
  company: CompanyProfile | null;
  isHydrated: boolean;

  setAuth: (data: { user: CompanyUserDto; company: CompanyProfile }) => void;
  setMe: (data: { user: CompanyUserDto; company: CompanyProfile }) => void;
  clear: () => void;
  setHydrated: () => void;
}

export const useCompanyAuthStore = create<CompanyAuthState>()(
  persist(
    (set) => ({
      user: null,
      company: null,
      isHydrated: false,
      setAuth: ({ user, company }) => set({ user, company }),
      setMe: ({ user, company }) => set({ user, company }),
      clear: () => set({ user: null, company: null }),
      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: "supkeys-company-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        company: state.company,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
