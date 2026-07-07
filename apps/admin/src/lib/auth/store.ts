"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AuthAdmin } from "./types";

/**
 * "Beni hatırla" — işaretsizse oturum tarayıcı kapanınca bitmeli. remember=true
 * → localStorage (kalıcı), false → sessionStorage (kapanınca silinir). Cookie
 * tarafı da paralel (session cookie). Bkz. web store aynı desen.
 */
const REMEMBER_KEY = "rothern-admin-remember";

export function setAdminRemember(remember: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
}

function rememberEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(REMEMBER_KEY) !== "0";
}

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
    window.localStorage.removeItem(name);
    window.sessionStorage.removeItem(name);
  },
};

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
      storage: createJSONStorage(() => rememberAwareStorage),
      partialize: (state) => ({ admin: state.admin }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
