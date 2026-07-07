"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CompanyProfile, CompanyUserDto } from "./types";

/**
 * "Beni hatırla" — işaretsizse oturum tarayıcı kapanınca bitmeli. Bunu istemci
 * snapshot'ında da yansıtmak için: remember=true → localStorage (kalıcı),
 * false → sessionStorage (kapanınca silinir). Bayrağın kendisi localStorage'da
 * tutulur (hassas değil). Cookie tarafı da paralel: session cookie (bkz. API).
 */
const REMEMBER_KEY = "rothern-company-remember";

export function setCompanyRemember(remember: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
}

function rememberEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(REMEMBER_KEY) !== "0";
}

/** remember bayrağına göre localStorage ya da sessionStorage'a yazan depolama. */
const rememberAwareStorage = {
  getItem: (name: string): string | null =>
    (rememberEnabled() ? window.localStorage : window.sessionStorage).getItem(
      name,
    ),
  setItem: (name: string, value: string): void => {
    (rememberEnabled() ? window.localStorage : window.sessionStorage).setItem(
      name,
      value,
    );
  },
  removeItem: (name: string): void => {
    // Her iki depodan da sil (çıkışta artık kalmasın).
    window.localStorage.removeItem(name);
    window.sessionStorage.removeItem(name);
  },
};

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
      name: "rothern-company-auth",
      storage: createJSONStorage(() => rememberAwareStorage),
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
