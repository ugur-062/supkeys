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
 * Faz R: eski "permissions yoksa Kurucu/Yönetici→true" fallback'i KALDIRILDI —
 * SAHIP artık işlem izni taşımaz, o varsayım yanlış butonlar açardı. Bayat
 * önbellekte kapı kapalı kalır; /me yenilenince doğru küme gelir.
 */
export function useHasCompanyPermission(permission: string): boolean {
  const user = useCompanyAuthStore((s) => s.user);
  if (!user?.permissions) return false;
  return user.permissions.includes(permission);
}

export type CompanyLoginResult =
  | CompanyLoginResponse
  | { twoFactorRequired: true; method?: "email" | "authenticator" };

export function useCompanyLogin() {
  const queryClient = useQueryClient();
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
    // Dalga B-4: girişte önbellek TEMİZLENMİYORDU. Çıkışta temizleniyor ama
    // çıkış zaten sert yönlendirme yapıyor; asıl riskli yol oturumun 401 ile
    // düşmesi: kullanıcı SPA'da kalıyor, BAŞKA bir hesapla giriş yapıyor ve
    // TanStack Query önceki hesabın önbelleğini servis ediyor (ihale listesi,
    // teklifler, mesajlar). Girişte de sıfırdan başla.
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export function useCompanySignup() {
  return useMutation({
    mutationFn: async (input: CompanySignupInput) => {
      const { data } = await companyApi.post<{
        email: string;
        verificationRequired: true;
        // Kod e-postası gerçekten gönderildi mi? false → gönderim başarısız
        // (backend dürüst sinyal; UI "tekrar gönder" gösterir). Eski yanıtlarda
        // alan olmayabilir → default true (geriye uyumlu).
        emailSent?: boolean;
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
