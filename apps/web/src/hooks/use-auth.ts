"use client";

import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth/store";
import type { AuthResponse, AuthUser } from "@/lib/auth/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useAuth() {
  const { token, user, setAuth, clear } = useAuthStore();
  return {
    token,
    user,
    isAuthenticated: !!token && !!user,
    setAuth,
    logout: clear,
  };
}

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);

  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const { data } = await api.post<AuthResponse>("/auth/login", input);
      return data;
    },
    onSuccess: (data) => {
      setAuth(data.token, data.user);
    },
  });
}

export function useMe() {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);

  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const { data } = await api.get<AuthUser>("/auth/me");
      setUser(data);
      return data;
    },
    enabled: !!token,
    staleTime: 60 * 1000,
  });
}

export function useLogout() {
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();

  return () => {
    clear();
    queryClient.clear();
    window.location.href = "/login";
  };
}
