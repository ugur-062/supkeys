"use client";

import { localizePath, stripLocale } from "@/i18n/href";
import { runtimeLocale, tRuntime } from "@/i18n/runtime";
import axios, { type AxiosError } from "axios";
import { toast } from "sonner";
import { readCsrfToken } from "../csrf";
import { resolveApiBaseUrl } from "../resolve-api-url";
import {
  SERVICE_PROBE_TIMEOUT_MS,
  isServiceFailure,
  registerServiceProbe,
  reportServiceReachable,
  settleServiceRequest,
  suspectServiceOutage,
  trackServiceRequest,
} from "./service-health";
import { useCompanyAuthStore } from "./store";

declare module "axios" {
  interface AxiosRequestConfig {
    /** Sağlık yoklaması (`service-health.ts`): kendi sonucu sinyal üretmez. */
    serviceProbe?: boolean;
  }
}

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

/**
 * SAĞLIK YOKLAMASI (canlı doğrulama OUT-1): panelin bir isteği kesinti belirtisi
 * gösterince `service-health.ts` bunu TEK kez çağırır. Tek deneme, kısa zaman
 * aşımı (genel 45 sn değil), toast yok; sonucu "ulaşılamıyor" notunu açar ya da
 * açmaz. Oturum düşmüşse (401) aşağıdaki genel kural girişe yönlendirir.
 */
registerServiceProbe(() =>
  companyApi.get("/company-auth/me", {
    skipErrorToast: true,
    serviceProbe: true,
    timeout: SERVICE_PROBE_TIMEOUT_MS,
  }),
);

companyApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    // Yanıtsızlık sayacı: istek ~6 sn yanıtsız kalırsa (uyuyan API bağlantıyı
    // asılı tutar, hata saniyelerce gelmez) sağlık yoklaması tetiklenir.
    if (!config.serviceProbe) trackServiceRequest(config);
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

/**
 * KESİNTİ BELİRTİSİ TOAST'I (canlı doğrulama OUT-3). Okuma (GET) hatasında toast
 * sağlık kararını BEKLER: panelde "Sunucuya şu anda ulaşılamıyor" notu
 * çıkacaksa (ya da zaten duruyorsa) aynı şeyi ikinci kez, notun üstünde
 * söylemez. Mutasyonda hemen basılır — kullanıcının eylemi sessiz kalmasın
 * (not sayfanın üstünde, uzun formda görüş alanının dışında olabilir).
 */
function toastUnlessOutage(
  error: AxiosError<ApiErrorPayload>,
  outage: Promise<boolean> | null,
  message: () => string,
): void {
  const method = (error.config?.method ?? "get").toLowerCase();
  if (!outage || MUTATING.has(method)) {
    toast.error(message());
    return;
  }
  void outage.then((down) => {
    if (!down) toast.error(message());
  });
}

companyApi.interceptors.response.use(
  (response) => {
    if (typeof window !== "undefined") {
      settleServiceRequest(response.config);
      // API yanıt verdi → ulaşılıyor ("ulaşılamıyor" notu açıksa kapanır).
      reportServiceReachable();
    }
    return response;
  },
  (error: AxiosError<ApiErrorPayload>) => {
    if (typeof window === "undefined") return Promise.reject(error);
    settleServiceRequest(error.config);
    // İptal edilen istek (sorgu `signal`i: panel kapandı, sayfa değişti) hata
    // DEĞİL — eskiden "Bağlantı hatası" toast'ı atıyordu.
    if (axios.isCancel(error)) return Promise.reject(error);

    const status = error.response?.status;
    const data = error.response?.data;

    // SAĞLIK SİNYALİ: yanıtsız biten istek ya da 502 · 503 · 504 şüphe doğurur
    // (tek `/me` yoklaması — sonucu `outage`); API'den gelen her başka yanıt
    // (4xx, 500) "ulaşılıyor" demektir. Yoklamanın kendi hatası sinyal üretmez.
    let outage: Promise<boolean> | null = null;
    if (!error.config?.serviceProbe) {
      if (isServiceFailure(error)) outage = suspectServiceOutage();
      else reportServiceReachable();
    }

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

    // İstek başına toast kapatma (`api.ts` ile aynı `skipErrorToast` bayrağı):
    // hatayı kendi kartında gösteren sayfalar (ör. ekip daveti önizlemesi).
    if (error.config?.skipErrorToast) return Promise.reject(error);

    // Auth formları (giriş/kayıt/doğrulama) hatayı kendi inline kutularında
    // gösterir → interceptor toast atmasın (çift gösterimi önle).
    const reqUrl = error.config?.url ?? "";
    // Şifre sıfırlama onayı da kendi kutusunda/kartında gösterir (arayüz testi
    // D-085: kullanılmış bağlantıda hata hem kutuda hem toast'ta çıkıyordu).
    if (
      /\/company-auth\/(login|signup|verify-email|resend-email-code|forgot-password|onboarding|upgrade-premium|vies-check)/.test(
        reqUrl,
      ) ||
      /\/auth\/password-reset\/confirm/.test(reqUrl)
    ) {
      return Promise.reject(error);
    }

    if (status === 403) {
      // Paket kilidi (TIER_REQUIRED) ve ülke kapısı (COUNTRY_NOT_ELIGIBLE,
      // 2026-09-27): sayfa zaten kilit kartı basıyor — toast aynı mesajı ikinci
      // kez (ve her odak yenilemesinde) gösterirdi.
      const code = (data as { code?: string } | undefined)?.code;
      if (code !== "TIER_REQUIRED" && code !== "COUNTRY_NOT_ELIGIBLE") {
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
      // 502 · 503 · 504 kesinti belirtisidir (`outage` dolu); 500 hemen basılır.
      toastUnlessOutage(error, outage, () => tRuntime("common.errors.server"));
      return Promise.reject(error);
    }

    if (!error.response) {
      toastUnlessOutage(error, outage, () => tRuntime("common.errors.network"));
      return Promise.reject(error);
    }

    return Promise.reject(error);
  },
);
