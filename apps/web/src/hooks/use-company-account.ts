"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * Kapatılabilir bildirim tercihleri (backend NOTIFICATION_PREF_KEYS ile birebir).
 * UI'da toggle olarak gösterilir; varsayılan tümü açık.
 */
export const NOTIFICATION_PREFS: { key: string; label: string }[] = [
  { key: "invitation", label: "İhale daveti aldığımda" },
  { key: "reminder", label: "Davetli olduğum ihalenin kapanışı yaklaştığında" },
  { key: "bidElimination", label: "Teklifim elendiğinde" },
  { key: "listingClosed", label: "Katıldığım ihale kapandığında" },
  { key: "categoryMatch", label: "Kategorime uygun yeni ihale açıldığında" },
  { key: "approvalPending", label: "Onayım beklendiğinde" },
];

/**
 * Transactional bildirimler — kapatılamaz, her zaman gönderilir. UI'da bilgi
 * olarak gösterilir (toggle'sız).
 */
export const TRANSACTIONAL_NOTIFICATIONS: string[] = [
  "Teklifim kazandığında / sipariş oluştuğunda",
  "Siparişimin durumu değiştiğinde",
  "Şifre sıfırlama ve hesap/davet e-postaları",
];

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      firstName?: string;
      lastName?: string;
      phone?: string;
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
      const { data } = await companyApi.post(
        "/company-auth/change-password",
        input,
      );
      return data;
    },
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
      const { data } = await companyApi.post("/company-auth/2fa/enable", {
        code,
      });
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
