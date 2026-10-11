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

/**
 * "Oturumumu açık bırak" açık mı (varsayılan açık)? Kapalıyken anlık görüntü
 * sessionStorage'dadır, yani SEKMEYE özeldir: yeni sekmede anlık görüntü
 * olmaması "oturum yok" demek DEĞİLDİR — bkz. `useCompanySessionProbe`.
 */
export function companyRememberEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch {
    return true;
  }
}

const rememberEnabled = companyRememberEnabled;

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
  /**
   * Bu sayfa yüklemesinde izinler sunucudan TAZE mi (arayüz testi D-299)?
   * KALICI DEĞİL (partialize dışında): her tam yüklemede false başlar; giriş
   * (`setAuth`) ya da `/me` (`setMe`) true yapar, `/me` hata verirse de
   * anlık görüntü "bilinen en iyi" kabul edilir (`markPermissionsSynced`).
   * İzinli sorgular bunu bekler — yoksa izni kaldırılmış kullanıcı ilk
   * yüklemede bayat izinlerle istek atıp 403 tostları görüyordu.
   */
  permissionsSynced: boolean;

  setAuth: (data: { user: CompanyUserDto; company: CompanyProfile }) => void;
  setMe: (data: { user: CompanyUserDto; company: CompanyProfile }) => void;
  clear: () => void;
  setHydrated: () => void;
  markPermissionsSynced: () => void;
}

export const useCompanyAuthStore = create<CompanyAuthState>()(
  persist(
    (set) => ({
      user: null,
      company: null,
      isHydrated: false,
      permissionsSynced: false,
      setAuth: ({ user, company }) => set({ user, company, permissionsSynced: true }),
      setMe: ({ user, company }) => set({ user, company, permissionsSynced: true }),
      clear: () => set({ user: null, company: null, permissionsSynced: false }),
      setHydrated: () => set({ isHydrated: true }),
      markPermissionsSynced: () => set({ permissionsSynced: true }),
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
