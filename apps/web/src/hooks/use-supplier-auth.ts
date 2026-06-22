"use client";

import { supplierApi } from "@/lib/supplier-auth/api";
import { useSupplierAuthStore } from "@/lib/supplier-auth/store";
import type {
  SupplierLoginResponse,
  SupplierLoginResult,
  SupplierMeResponse,
  SupplierProfile,
} from "@/lib/supplier-auth/types";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

export function useSupplierAuth() {
  const token = useSupplierAuthStore((s) => s.token);
  const supplierUser = useSupplierAuthStore((s) => s.supplierUser);
  const supplier = useSupplierAuthStore((s) => s.supplier);
  const tenantRelations = useSupplierAuthStore((s) => s.tenantRelations);
  return {
    token,
    supplierUser,
    supplier,
    tenantRelations,
    isAuthenticated: !!token && !!supplierUser,
  };
}

/**
 * Login — 2FA açıksa { twoFactorRequired } döner (setAuth YAPILMAZ); form
 * OTP adımına geçer. 2FA kapalıysa form setAuth çağırır.
 */
export function useSupplierLogin() {
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const { data } = await supplierApi.post<SupplierLoginResult>(
        "/supplier-auth/login",
        input,
      );
      return data;
    },
  });
}

/** Madde 29 — login OTP doğrula → token. */
export function useSupplierVerifyOtp() {
  return useMutation({
    mutationFn: async (input: { challengeId: string; code: string }) => {
      const { data } = await supplierApi.post<SupplierLoginResponse>(
        "/supplier-auth/verify-otp",
        input,
      );
      return data;
    },
  });
}

/** Store'a auth yaz (login/OTP başarısında form çağırır). */
export function useSetSupplierAuth() {
  return useSupplierAuthStore((s) => s.setAuth);
}

export function useSupplierMe(enabled = true) {
  const token = useSupplierAuthStore((s) => s.token);
  const setMe = useSupplierAuthStore((s) => s.setMe);
  return useQuery({
    queryKey: ["supplier-auth", "me"],
    queryFn: async () => {
      const { data } = await supplierApi.get<SupplierMeResponse>(
        "/supplier-auth/me",
      );
      setMe(data);
      return data;
    },
    enabled: !!token && enabled,
    staleTime: 60 * 1000,
  });
}

export interface UpdateCompanyInfoPayload {
  industry?: string;
  website?: string;
  city?: string;
  district?: string;
  addressLine?: string;
  postalCode?: string;
}

/** Çekirdek firma bilgisi (iletişim/adres) güncelle + store senkronu. */
export function useUpdateCompanyInfo() {
  const setSupplier = useSupplierAuthStore((s) => s.setSupplier);
  return useMutation({
    mutationFn: async (payload: UpdateCompanyInfoPayload) => {
      const { data } = await supplierApi.patch<SupplierProfile>(
        "/supplier-profile/me/company-info",
        payload,
      );
      return data;
    },
    onSuccess: (supplier) => {
      setSupplier(supplier);
    },
  });
}

// Madde 29 — panel-içi 2FA aç/kapat.
export function useSupplierEnable2faStart() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await supplierApi.post<{
        challengeId: string;
        expiresAt: string;
      }>("/supplier-auth/2fa/enable/start");
      return data;
    },
  });
}

export function useSupplierEnable2faVerify() {
  return useMutation({
    mutationFn: async (input: { challengeId: string; code: string }) => {
      const { data } = await supplierApi.post(
        "/supplier-auth/2fa/enable/verify",
        input,
      );
      return data;
    },
  });
}

export function useSupplierDisable2fa() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await supplierApi.post("/supplier-auth/2fa/disable");
      return data;
    },
  });
}

export function useSupplierLogout() {
  const clear = useSupplierAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  return () => {
    clear();
    queryClient.clear();
    if (typeof window !== "undefined") {
      window.location.href = "/supplier/login";
    }
  };
}
