"use client";

import type { Locale } from "@rothern/i18n";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * Kapatılabilir bildirim tercihleri (backend NOTIFICATION_PREF_KEYS ile birebir).
 * UI'da toggle olarak gösterilir; varsayılan tümü açık. Etiket katalogda:
 * `web.panel.settings.accountSettingsSection.notificationPref.<key>`.
 */
export const NOTIFICATION_PREFS: { key: string }[] = [
  { key: "invitation" },
  { key: "reminder" },
  { key: "bidElimination" },
  { key: "listingClosed" },
  { key: "categoryMatch" },
  { key: "approvalPending" },
  { key: "announcement" },
];

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      /** Arayüz/bildirim dili (i18n Faz 1) — Ayarlar › Hesap Bilgileri › Dil. */
      locale?: Locale;
    }) => {
      const { data } = await companyApi.patch("/company-auth/me", input);
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-auth", "me"] }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (input: {
      currentPassword: string;
      newPassword: string;
    }) => {
      const { data } = await companyApi.post<{ ok: boolean; token?: string }>(
        "/company-auth/change-password",
        input,
      );
      return data;
    },
    // Parola değişimi diğer oturumları geçersiz kılar (tokenVersion). BU oturum
    // sunucunun döndürdüğü taze token'la devam eder — AuthCookieInterceptor
    // yeni httpOnly cookie'yi otomatik yazdığı için istemcide iş kalmaz.
  });
}

export function useSetup2fa() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await companyApi.post<{
        otpauthUrl: string;
        qrDataUrl: string;
        secret: string;
      }>("/company-auth/2fa/setup");
      return data;
    },
  });
}

export function useEnable2fa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data } = await companyApi.post<{
        ok: boolean;
        /** Tek kullanımlık kurtarma kodları — YALNIZCA bu yanıtta görünür. */
        recoveryCodes: string[];
      }>("/company-auth/2fa/enable", { code });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-auth", "me"] }),
  });
}

export function useDisable2fa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data } = await companyApi.post("/company-auth/2fa/disable", {
        code,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-auth", "me"] }),
  });
}

/** E-posta 2FA — kurulum/kapatma için e-postaya kod gönderir. */
export function useSendEmail2faCode() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await companyApi.post<{ sent: boolean }>(
        "/company-auth/2fa/email/send-code",
      );
      return data;
    },
  });
}

/** E-postaya gelen kodla E-POSTA 2FA'yı açar (kurtarma kodları döner). */
export function useEnableEmail2fa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data } = await companyApi.post<{
        ok: boolean;
        recoveryCodes: string[];
      }>("/company-auth/2fa/email/enable", { code });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-auth", "me"] }),
  });
}

export function useUpdateNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (prefs: Record<string, boolean>) => {
      const { data } = await companyApi.patch(
        "/company-auth/me/notifications",
        { prefs },
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-auth", "me"] }),
  });
}
