"use client";

import type { Locale } from "@rothern/i18n";

import { companyApi } from "@/lib/company-auth/api";
import { nativePush, PUSH_DEVICES_PATH, readPushToken, runPushDeviceRequest } from "@/lib/native-push";
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

/**
 * Kişinin kendi hesabını silmesi (şifreyle). Hata metnini bölüm kendi satırında
 * gösterir → global toast yok.
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async (input: { password: string }) => {
      const { data } = await companyApi.post<{ ok: boolean; companyClosed: boolean }>(
        "/company-auth/delete-account",
        input,
        { skipErrorToast: true },
      );
      return data;
    },
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
    // yeni httpOnly cookie'yi otomatik yazar.
    onSuccess: () => {
      void rebindStoredPushToken();
    },
  });
}

/**
 * Mobil kabuk: anlık bildirim cihaz kaydı oturum sürümüne bağlıdır (sunucu
 * sürümü eskiyen cihaza göndermez). Şifre değişimi sürümü artırır ama bu
 * oturum sürer → bu cihazın saklı belirteci taze oturumla yeniden yazılır;
 * yoksa telefon bir sonraki açılışa dek bildirim almazdı. Tarayıcıda ya da
 * belirteç yokken hiçbir şey yapmaz; hata görünmez.
 */
export async function rebindStoredPushToken(): Promise<void> {
  if (typeof window === "undefined") return;
  const push = nativePush(window);
  const token = push ? readPushToken() : null;
  if (!push || !token) return;
  try {
    await runPushDeviceRequest(() =>
      companyApi.post(PUSH_DEVICES_PATH, { token, platform: push.platform }, { skipErrorToast: true }),
    );
  } catch {
    // Görünür bir şey yok: sonraki açılışta kaydedici yeniden kaydeder.
  }
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

/**
 * E-posta 2FA — kurulum/kapatma için e-postaya kod gönderir. `capped`: saatlik
 * tavan dolu, yeni kod GİTMEDİ ama gelen kutusundaki son kod geçerli (tavan
 * dolu + geçerli kod yoksa API 429 atar).
 */
export function useSendEmail2faCode() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await companyApi.post<{ sent: boolean; capped?: boolean }>(
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
