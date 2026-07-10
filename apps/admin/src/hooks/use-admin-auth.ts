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

  return useMutation({
    mutationFn: async (input: {
      email: string;
      password: string;
      rememberMe?: boolean;
      /** 2FA (TOTP) kodu — hesap 2FA'lıysa ikinci denemede gönderilir. */
      code?: string;
    }) => {
      const { data } = await api.post<AdminAuthResponse>(
        "/admin/auth/login",
        input,
      );
      return data;
    },
    onSuccess: (data, variables) => {
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

export function useAdminLogout() {
  const clear = useAdminAuthStore((s) => s.clear);
  const queryClient = useQueryClient();

  return () => {
    // Backend httpOnly cookie'yi temizler; sonucu beklemeden UI'ı boşalt.
    void api.post("/admin/auth/logout").catch(() => undefined);
    clear();
    queryClient.clear();
    window.location.href = "/admin/login";
  };
}
