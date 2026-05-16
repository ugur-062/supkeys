"use client";

import axios, { type AxiosError } from "axios";
import { toast } from "sonner";
import { resolveApiBaseUrl } from "../resolve-api-url";
import { useSupplierAuthStore } from "./store";

/**
 * Tedarikçi paneline ait axios instance — tenant ve admin api'lerinden BAĞIMSIZ.
 * Kendi store'undan token okur, 401'de kendi login sayfasına yönlendirir.
 */
export const supplierApi = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: { "Content-Type": "application/json" },
});

supplierApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = useSupplierAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

interface ApiErrorPayload {
  message?: string | string[];
  errors?: Record<string, string>;
}

function pickMessage(
  data: ApiErrorPayload | undefined,
  fallback: string,
): string {
  if (!data) return fallback;
  if (typeof data.message === "string") return data.message;
  if (Array.isArray(data.message) && data.message[0]) return data.message[0];
  return fallback;
}

// Polish-3 — global toast handler. Tenant tarafıyla aynı kurallar; supplier
// scope'una özel 401 redirect.
supplierApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorPayload>) => {
    if (typeof window === "undefined") return Promise.reject(error);

    const status = error.response?.status;
    const data = error.response?.data;

    if (status === 401) {
      const { token, clear } = useSupplierAuthStore.getState();
      if (token) {
        clear();
        const onLogin = window.location.pathname === "/supplier/login";
        if (!onLogin) {
          window.location.href = "/supplier/login";
        }
      }
      return Promise.reject(error);
    }

    if (status === 403) {
      toast.error(pickMessage(data, "Bu işlem için yetkiniz yok"));
      return Promise.reject(error);
    }

    if (status === 404) {
      const url = error.config?.url ?? "";
      const isDetailEndpoint = /\/[^/?]+\/[^/?]+(?:\?|$)/.test(url);
      if (isDetailEndpoint) {
        toast.error(pickMessage(data, "Kayıt bulunamadı"));
      }
      return Promise.reject(error);
    }

    if (status === 400) {
      if (data?.errors && Object.keys(data.errors).length > 0) {
        return Promise.reject(error);
      }
      toast.error(pickMessage(data, "Geçersiz istek"));
      return Promise.reject(error);
    }

    if (status === 409) {
      toast.error(pickMessage(data, "Bu işlem mevcut durumda yapılamaz"));
      return Promise.reject(error);
    }

    if (status === 422) {
      toast.error(pickMessage(data, "Geçersiz veri"));
      return Promise.reject(error);
    }

    if (status && status >= 500) {
      toast.error("Sunucu hatası, lütfen tekrar deneyin");
      return Promise.reject(error);
    }

    if (!error.response) {
      toast.error("Bağlantı hatası, internet bağlantınızı kontrol edin");
      return Promise.reject(error);
    }

    return Promise.reject(error);
  },
);
