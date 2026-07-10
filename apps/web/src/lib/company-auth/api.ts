"use client";

import axios, { type AxiosError } from "axios";
import { toast } from "sonner";
import { readCsrfToken } from "../csrf";
import { resolveApiBaseUrl } from "../resolve-api-url";
import { useCompanyAuthStore } from "./store";

/**
 * Birleşik sistem — Company paneline ait axios instance. Oturum httpOnly
 * cookie'dedir (withCredentials); Bearer taşımıyoruz. Mutating isteklerde CSRF
 * çift-gönderim header'ı eklenir. 401'de /company/login'e yönlendirir.
 */
export const companyApi = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
  // Asılı soket koruması — cömert üst sınır: API (free tier) uykudan ~30 sn'de
  // kalkar, KISA timeout her cold-start'ı öldürür. Kısaltmayın.
  timeout: 45_000,
});

const MUTATING = new Set(["post", "put", "patch", "delete"]);

companyApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const method = (config.method ?? "get").toLowerCase();
    if (MUTATING.has(method)) {
      const csrf = readCsrfToken();
      if (csrf) config.headers["X-CSRF-Token"] = csrf;
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

companyApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorPayload>) => {
    if (typeof window === "undefined") return Promise.reject(error);

    const status = error.response?.status;
    const data = error.response?.data;

    if (status === 401) {
      // Oturum sinyali artık `user` (cookie geçersizse /me 401 verir).
      const { user, clear } = useCompanyAuthStore.getState();
      if (user) {
        clear();
        const onLogin = window.location.pathname === "/company/login";
        if (!onLogin) {
          window.location.href = "/company/login";
        }
      }
      return Promise.reject(error);
    }

    // Auth formları (giriş/kayıt/doğrulama) hatayı kendi inline kutularında
    // gösterir → interceptor toast atmasın (çift gösterimi önle).
    const reqUrl = error.config?.url ?? "";
    if (
      /\/company-auth\/(login|signup|verify-email|resend-email-code|onboarding|upgrade-premium|vies-check)/.test(
        reqUrl,
      )
    ) {
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
