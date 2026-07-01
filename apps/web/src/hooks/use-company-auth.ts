"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import type {
  CompanyLoginResponse,
  CompanyMeResponse,
  CompanySignupInput,
} from "@/lib/company-auth/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useCompanyAuth() {
  const token = useCompanyAuthStore((s) => s.token);
  const user = useCompanyAuthStore((s) => s.user);
  const company = useCompanyAuthStore((s) => s.company);
  return {
    token,
    user,
    company,
    isAuthenticated: !!token && !!user,
  };
}

/** Rol kontrolü — kullanıcının verilen role sahip olup olmadığı. */
export function useHasRole(role: string): boolean {
  const user = useCompanyAuthStore((s) => s.user);
  return !!user?.roles.includes(role as never);
}

export type CompanyLoginResult =
  | CompanyLoginResponse
  | { twoFactorRequired: true };

export function useCompanyLogin() {
  return useMutation({
    mutationFn: async (input: {
      email: string;
      password: string;
      code?: string;
    }) => {
      const { data } = await companyApi.post<CompanyLoginResult>(
        "/company-auth/login",
        input,
      );
      return data;
    },
  });
}

export function useCompanySignup() {
  return useMutation({
    mutationFn: async (input: CompanySignupInput) => {
      const { data } = await companyApi.post<{
        email: string;
        verificationRequired: true;
      }>("/company-auth/signup", input);
      return data;
    },
  });
}

/** 6 haneli kodu doğrula → oturum (token) döner. */
export function useVerifyEmail() {
  return useMutation({
    mutationFn: async (input: { email: string; code: string }) => {
      const { data } = await companyApi.post<CompanyLoginResponse>(
        "/company-auth/verify-email",
        input,
      );
      return data;
    },
  });
}

export function useResendEmailCode() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { data } = await companyApi.post<{ success: true }>(
        "/company-auth/resend-email-code",
        { email },
      );
      return data;
    },
  });
}

export function useSetCompanyAuth() {
  return useCompanyAuthStore((s) => s.setAuth);
}

/** Faz 3 — doğrulama tamamsa premium'a (PAKET) geç. */
export function useUpgradePremium() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await companyApi.post<{ ok: true; tier: string }>(
        "/company-auth/upgrade-premium",
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-auth", "me"] }),
  });
}

/** Faz 2 — firma doğrulama sihirbazını tamamla. */
export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const { data } = await companyApi.post<{ ok: true }>(
        "/company-auth/onboarding",
        input,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-auth", "me"] }),
  });
}

export function useCompanyMe(enabled = true) {
  const token = useCompanyAuthStore((s) => s.token);
  const setMe = useCompanyAuthStore((s) => s.setMe);
  return useQuery({
    queryKey: ["company-auth", "me"],
    queryFn: async () => {
      const { data } = await companyApi.get<CompanyMeResponse>(
        "/company-auth/me",
      );
      setMe(data);
      return data;
    },
    enabled: !!token && enabled,
    staleTime: 60 * 1000,
  });
}

export function useCompanyLogout() {
  const clear = useCompanyAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  return () => {
    clear();
    queryClient.clear();
    if (typeof window !== "undefined") {
      window.location.href = "/company/login";
    }
  };
}
