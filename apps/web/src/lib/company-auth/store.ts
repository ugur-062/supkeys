"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CompanyProfile, CompanyUserDto } from "./types";

interface CompanyAuthState {
  token: string | null;
  user: CompanyUserDto | null;
  company: CompanyProfile | null;
  isHydrated: boolean;

  setAuth: (data: {
    token: string;
    user: CompanyUserDto;
    company: CompanyProfile;
  }) => void;
  setMe: (data: { user: CompanyUserDto; company: CompanyProfile }) => void;
  clear: () => void;
  setHydrated: () => void;
}

export const useCompanyAuthStore = create<CompanyAuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      company: null,
      isHydrated: false,
      setAuth: ({ token, user, company }) => set({ token, user, company }),
      setMe: ({ user, company }) => set({ user, company }),
      clear: () => set({ token: null, user: null, company: null }),
      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: "supkeys-company-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        company: state.company,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
