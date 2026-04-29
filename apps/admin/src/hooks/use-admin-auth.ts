"use client";

import { api } from "@/lib/api";
import { useAdminAuthStore } from "@/lib/auth/store";
import type { AdminAuthResponse, AuthAdmin } from "@/lib/auth/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useAdminAuth() {
  const { token, admin, setAuth, clear } = useAdminAuthStore();
  return {
    token,
    admin,
    isAuthenticated: !!token && !!admin,
    setAuth,
    logout: clear,
  };
}

export function useAdminLogin() {
  const setAuth = useAdminAuthStore((s) => s.setAuth);

  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const { data } = await api.post<AdminAuthResponse>(
        "/admin/auth/login",
        input,
      );
      return data;
    },
    onSuccess: (data) => {
      setAuth(data.token, data.admin);
    },
  });
}

export function useAdminMe() {
  const token = useAdminAuthStore((s) => s.token);
  const setAdmin = useAdminAuthStore((s) => s.setAdmin);

  return useQuery({
    queryKey: ["admin", "auth", "me"],
    queryFn: async () => {
      const { data } = await api.get<AuthAdmin>("/admin/auth/me");
      setAdmin(data);
      return data;
    },
    enabled: !!token,
    staleTime: 60 * 1000,
  });
}

export function useAdminLogout() {
  const clear = useAdminAuthStore((s) => s.clear);
  const queryClient = useQueryClient();

  return () => {
    clear();
    queryClient.clear();
    window.location.href = "/admin/login";
  };
}
