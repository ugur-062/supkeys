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
      const { data } = await companyApi.post<CompanyLoginResponse>(
        "/company-auth/signup",
        input,
      );
      return data;
    },
  });
}

export function useSetCompanyAuth() {
  return useCompanyAuthStore((s) => s.setAuth);
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
