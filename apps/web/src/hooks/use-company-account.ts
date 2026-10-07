"use client";

import type { Locale } from "@rothern/i18n";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * Kapatılabilir bildirim tercihleri (backend NOTIFICATION_PREF_KEYS ile birebir).
 * UI'da toggle olarak gösterilir; varsayılan tümü açık. Etiket katalogda:
 * `web.panel.settings.accountSettingsSection.notificationPref.<key>`.
 */
/**
 * `parent`: alt tercihin ana şalteri (backend `PREF_KEY_PARENT`) — üst
 * kapalıyken alt türün e-postası da gitmez; satır pasif ve girintili görünür.
 */
export const NOTIFICATION_PREFS: { key: string; parent?: string }[] = [
  { key: "invitation" },
  { key: "aiInvitation", parent: "invitation" },
  { key: "reminder" },
  { key: "growthNudges", parent: "reminder" },
  { key: "bidElimination" },
  { key: "listingClosed" },
  { key: "categoryMatch" },
  { key: "approvalPending" },
  { key: "announcement" },
  { key: "aiSuggestions" },
  { key: "lifecycle" },
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
