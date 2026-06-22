"use client";

import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth/store";
import type {
  AuthResponse,
  AuthUser,
  LoginResult,
} from "@/lib/auth/types";
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

/**
 * Login — 2FA açıksa { twoFactorRequired } döner (setAuth YAPILMAZ); form OTP
 * adımına geçer. 2FA kapalıysa form setAuth çağırır.
 */
export function useLogin() {
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const { data } = await api.post<LoginResult>("/auth/login", input);
      return data;
    },
  });
}

/** Madde 29 — login OTP doğrula → token. */
export function useVerifyOtp() {
  return useMutation({
    mutationFn: async (input: { challengeId: string; code: string }) => {
      const { data } = await api.post<AuthResponse>("/auth/verify-otp", input);
      return data;
    },
  });
}

export function useSetAuth() {
  return useAuthStore((s) => s.setAuth);
}

// Madde 29 — panel-içi 2FA aç/kapat.
export function useEnable2faStart() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{
        challengeId: string;
        expiresAt: string;
      }>("/auth/2fa/enable/start");
      return data;
    },
  });
}

export function useEnable2faVerify() {
  return useMutation({
    mutationFn: async (input: { challengeId: string; code: string }) => {
      const { data } = await api.post("/auth/2fa/enable/verify", input);
      return data;
    },
  });
}

export function useDisable2fa() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/auth/2fa/disable");
      return data;
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
