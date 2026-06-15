"use client";

// Tedarikçi hesap ayarları: hesap bilgisi, şifre, bildirim tercihleri.

import { supplierApi } from "@/lib/supplier-auth/api";
import { useSupplierAuthStore } from "@/lib/supplier-auth/store";
import type { SupplierUserDto } from "@/lib/supplier-auth/types";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

const PREFS_KEY = ["supplier-account", "notification-prefs"] as const;

export interface UpdateAccountPayload {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

/** Ad/soyad/telefon güncelle + store senkronu. */
export function useUpdateSupplierAccount() {
  const setSupplierUser = useSupplierAuthStore((s) => s.setSupplierUser);
  return useMutation({
    mutationFn: async (payload: UpdateAccountPayload) => {
      const { data } = await supplierApi.patch<SupplierUserDto>(
        "/supplier-account/me",
        payload,
      );
      return data;
    },
    onSuccess: (user) => {
      setSupplierUser(user);
    },
  });
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export function useChangeSupplierPassword() {
  return useMutation({
    mutationFn: async (payload: ChangePasswordPayload) => {
      const { data } = await supplierApi.post(
        "/supplier-account/me/change-password",
        payload,
      );
      return data;
    },
  });
}

export function useSupplierNotificationPrefs() {
  return useQuery({
    queryKey: PREFS_KEY,
    queryFn: async () => {
      const { data } = await supplierApi.get<{
        notificationPrefs: Record<string, boolean> | null;
      }>("/supplier-account/me/notification-prefs");
      return data;
    },
  });
}

export function useUpdateSupplierNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (prefs: Record<string, boolean>) => {
      const { data } = await supplierApi.patch<{
        notificationPrefs: Record<string, boolean> | null;
      }>("/supplier-account/me/notification-prefs", { prefs });
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(PREFS_KEY, data);
    },
  });
}
