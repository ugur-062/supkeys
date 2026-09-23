"use client";

import { localizePath, stripLocale } from "@/i18n/href";
import { runtimeLocale, tRuntime } from "@/i18n/runtime";
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
    // İstek dili (i18n Faz 0): API hata/doğrulama metinlerini bu dilde döner.
    config.headers["Accept-Language"] = runtimeLocale();
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
        const onLogin = stripLocale(window.location.pathname) === "/company/login";
        if (!onLogin) {
          window.location.href = localizePath("/company/login", runtimeLocale());
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
      // Paket kilidi (TIER_REQUIRED): sayfa zaten kilit kartı basıyor — toast
      // aynı mesajı ikinci kez (ve her odak yenilemesinde) gösterirdi.
      if ((data as { code?: string } | undefined)?.code !== "TIER_REQUIRED") {
        toast.error(pickMessage(data, tRuntime("common.errors.forbidden")));
      }
      return Promise.reject(error);
    }

    if (status === 404) {
      // C12: GET 404'te toast YOK — detay sayfaları kendi hata kartını basar
      // (toast + kart aynı anda iki farklı mesaj gösteriyordu). Mutasyon
      // 404'ünde sayfada karşılık olmayabilir → toast kalır.
      const method = (error.config?.method ?? "get").toLowerCase();
      if (method !== "get") {
        toast.error(pickMessage(data, tRuntime("common.errors.notFound")));
      }
      return Promise.reject(error);
    }

    if (status === 400) {
      if (data?.errors && Object.keys(data.errors).length > 0) {
        return Promise.reject(error);
      }
      toast.error(pickMessage(data, tRuntime("common.errors.badRequest")));
      return Promise.reject(error);
    }

    if (status === 409) {
      toast.error(pickMessage(data, tRuntime("common.errors.conflict")));
      return Promise.reject(error);
    }

    if (status === 422) {
      toast.error(pickMessage(data, tRuntime("common.errors.unprocessable")));
      return Promise.reject(error);
    }

    if (status && status >= 500) {
      toast.error(tRuntime("common.errors.server"));
      return Promise.reject(error);
    }

    if (!error.response) {
      toast.error(tRuntime("common.errors.network"));
      return Promise.reject(error);
    }

    return Promise.reject(error);
  },
);
