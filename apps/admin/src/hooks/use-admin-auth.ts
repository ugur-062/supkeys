"use client";

import { api } from "@/lib/api";
import { setAdminRemember, useAdminAuthStore } from "@/lib/auth/store";
import type { AdminAuthResponse, AuthAdmin } from "@/lib/auth/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useAdminAuth() {
  const { admin, setAuth, clear } = useAdminAuthStore();
  return {
    admin,
    // Oturum httpOnly cookie'de; `admin` varlığı istemci-taraflı "giriş yapıldı".
    isAuthenticated: !!admin,
    setAuth,
    logout: clear,
  };
}

export function useAdminLogin() {
  const setAuth = useAdminAuthStore((s) => s.setAuth);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      email: string;
      password: string;
      rememberMe?: boolean;
    }) => {
      const { data } = await api.post<AdminAuthResponse>(
        "/admin/auth/login",
        input,
      );
      return data;
    },
    onSuccess: (data, variables) => {
      // Dalga B-4: önceki admin oturumunun önbelleği temizlenmeliydi — oturum
      // 401 ile düşüp BAŞKA bir admin giriş yaptığında TanStack Query eski
      // hesabın verisini (firma listeleri, KPI, denetim kayıtları) servis
      // ediyordu. Admin panelinde bu doğrudan bir yetki sınırı sorunudur
      // (SUPPORT, SUPER_ADMIN'in önbelleğini görebilir).
      queryClient.clear();
      // Cookie (API) + istemci snapshot'ı aynı "hatırla" tercihine göre.
      setAdminRemember(variables.rememberMe !== false);
      setAuth(data.admin);
    },
  });
}

export function useAdminMe() {
  const admin = useAdminAuthStore((s) => s.admin);
  const setAdmin = useAdminAuthStore((s) => s.setAdmin);

  return useQuery({
    queryKey: ["admin", "auth", "me"],
    queryFn: async () => {
      const { data } = await api.get<AuthAdmin>("/admin/auth/me");
      setAdmin(data);
      return data;
    },
    enabled: !!admin,
    staleTime: 60 * 1000,
  });
}

/** Çıkış isteğinin en uzun bekleneceği süre (ms). */
export const LOGOUT_WAIT_MS = 3000;

export function useAdminLogout() {
  const clear = useAdminAuthStore((s) => s.clear);
  const queryClient = useQueryClient();

  return async () => {
    // Derin denetim MU-21: istek BEKLENMEDEN yönlendirilince yeni belge eski
    // belgenin bekleyen preflight/POST'unu iptal ediyordu → httpOnly `rk_admin`
    // çerezi silinmeden kalabiliyordu (ortak bilgisayarda oturum açık kalır).
    // Yanıt (Set-Cookie temizliği) beklenir; API askıda kalırsa en çok
    // LOGOUT_WAIT_MS sonra yine de çıkılır.
    try {
      await Promise.race([
        api.post("/admin/auth/logout"),
        new Promise((resolve) => setTimeout(resolve, LOGOUT_WAIT_MS)),
      ]);
    } catch {
      // Ağ/401 — istemci tarafı yine de temizlenir.
    } finally {
      clear();
      queryClient.clear();
      window.location.href = "/admin/login";
    }
  };
}
