"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import type {
  CompanyLoginResponse,
  CompanyMeResponse,
  CompanySignupInput,
} from "@/lib/company-auth/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export function useCompanyAuth() {
  const user = useCompanyAuthStore((s) => s.user);
  const company = useCompanyAuthStore((s) => s.company);
  return {
    user,
    company,
    // Oturum httpOnly cookie'de; `user` varlığı istemci-taraflı "giriş yapıldı".
    isAuthenticated: !!user,
  };
}

/** Rol kontrolü — kullanıcının verilen role sahip olup olmadığı. */
export function useHasRole(role: string): boolean {
  const user = useCompanyAuthStore((s) => s.user);
  return !!user?.roles.includes(role as never);
}

/**
 * Efektif izin kontrolü — backend'in hesapladığı (rol + override + sahiplik)
 * izin kümesini kullanır; sahibin verdiği izin ekleri UI'da da açılır.
 * Eski önbellekte `permissions` yoksa Yönetici/sahip varsayımına düşer
 * (yalnızca yönetim izinleri için güvenli — /me yenilenince kendini düzeltir).
 */
export function useHasCompanyPermission(permission: string): boolean {
  const user = useCompanyAuthStore((s) => s.user);
  if (!user) return false;
  if (user.permissions) return user.permissions.includes(permission);
  return user.isOwner || user.roles.includes("YONETICI" as never);
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
      rememberMe?: boolean;
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

/**
 * 6 haneli kodu doğrula. İlk doğrulamada oturum (token) döner; e-posta zaten
 * doğrulanmışsa güvenlik gereği token YOK → `{ alreadyVerified: true }`.
 */
export type VerifyEmailResult =
  | CompanyLoginResponse
  | { alreadyVerified: true };

export function useVerifyEmail() {
  return useMutation({
    mutationFn: async (input: { email: string; code: string }) => {
      const { data } = await companyApi.post<VerifyEmailResult>(
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

// ── Token'lı ekip daveti (public — davetli henüz hesapsız) ──

export interface InvitationPreview {
  email: string;
  roles: string[];
  companyName: string;
  expiresAt: string;
}

export function useInvitationPreview(token: string) {
  return useQuery({
    queryKey: ["company-invitation", token],
    queryFn: async () => {
      const { data } = await companyApi.get<InvitationPreview>(
        `/company/invitations/${token}`,
      );
      return data;
    },
    enabled: !!token,
    retry: false,
  });
}

export interface AcceptInvitationInput {
  firstName: string;
  lastName: string;
  phone?: string;
  password: string;
  termsAccepted: boolean;
  mediationAccepted: boolean;
  kvkkAccepted: boolean;
  marketingConsent?: boolean;
  profileImprovementConsent?: boolean;
}

export function useAcceptInvitation(token: string) {
  return useMutation({
    mutationFn: async (input: AcceptInvitationInput) => {
      const { data } = await companyApi.post<CompanyLoginResponse>(
        `/company/invitations/${token}/accept`,
        input,
      );
      return data;
    },
  });
}

/** Faz 5 — AB VAT numarası VIES ile doğrula. */
export function useViesCheck() {
  return useMutation({
    mutationFn: async (input: { countryCode: string; vatNumber: string }) => {
      const { data } = await companyApi.post<{
        valid: boolean;
        name: string | null;
        address: string | null;
        unavailable?: boolean;
      }>("/company-auth/vies-check", input);
      return data;
    },
  });
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
  const user = useCompanyAuthStore((s) => s.user);
  const setMe = useCompanyAuthStore((s) => s.setMe);
  const query = useQuery({
    queryKey: ["company-auth", "me"],
    queryFn: async () => {
      const { data } = await companyApi.get<CompanyMeResponse>(
        "/company-auth/me",
      );
      return data;
    },
    enabled: !!user && enabled,
    staleTime: 60 * 1000,
  });
  // Store senkronu render sonrası yan-etkiyle (queryFn içinde değil — StrictMode
  // çift-fetch veya cache okumasında setMe atlanmasını önler).
  useEffect(() => {
    if (query.data) setMe(query.data);
  }, [query.data, setMe]);
  return query;
}

export function useCompanyLogout() {
  const clear = useCompanyAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  return () => {
    // Backend httpOnly cookie'yi temizler; sonucu beklemeden UI'ı boşalt.
    void companyApi.post("/company-auth/logout").catch(() => undefined);
    clear();
    queryClient.clear();
    if (typeof window !== "undefined") {
      window.location.href = "/company/login";
    }
  };
}
