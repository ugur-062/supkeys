import axios, { type AxiosError } from "axios";
import { toast } from "sonner";
import { resolveApiBaseUrl } from "./resolve-api-url";

// Genel (auth'suz) axios instance — public uçlar (ör. /reset-password confirm).
// Authentication gerektiren paneller kendi instance'larını kullanır
// (company-auth/api).
export const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: {
    "Content-Type": "application/json",
  },
  // Asılı soket koruması — cömert üst sınır: API (free tier) uykudan ~30 sn'de
  // kalkar, KISA timeout her cold-start'ı öldürür. Kısaltmayın.
  timeout: 45_000,
});

interface ApiErrorPayload {
  message?: string | string[];
  /** Polish-3 — backend ValidationPipe `{ field: msg }` */
  errors?: Record<string, string>;
}

function pickMessage(data: ApiErrorPayload | undefined, fallback: string): string {
  if (!data) return fallback;
  if (typeof data.message === "string") return data.message;
  if (Array.isArray(data.message) && data.message[0]) return data.message[0];
  return fallback;
}

// Polish-3 — global toast handler.
//
// Kurallar:
// - 401: mevcut davranış (token clear + redirect, public sayfada sessiz)
// - 403: "Yetkiniz yok" toast.
// - 404: tek-kayıt request'lerde toast (URL `/{id}` ile bitiyorsa). Liste
//   endpoint'lerinde sessiz (boş sonuç olabilir).
// - 400 + errors object: validation. Toast atılmaz; component
//   `extractFieldErrors` ile inline gösterir.
// - 400 (generic): message toast.
// - 409: conflict message toast.
// - 422: semantic message toast.
// - 5xx: "Sunucu hatası" toast.
// - Network (response yok): "Bağlantı hatası" toast.
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorPayload>) => {
    if (typeof window === "undefined") return Promise.reject(error);

    const status = error.response?.status;
    const data = error.response?.data;

    // 401 — public instance; sessizce reddet (panel kendi 401 redirect'ini yapar).
    if (status === 401) {
      return Promise.reject(error);
    }

    // 403 — forbidden
    if (status === 403) {
      toast.error(pickMessage(data, "Bu işlem için yetkiniz yok"));
      return Promise.reject(error);
    }

    // 404 — sadece detail endpoint'lerinde toast
    if (status === 404) {
      const url = error.config?.url ?? "";
      // /resource/:id pattern'ı (sonu / ile bitmiyor + ardından query string yok)
      const isDetailEndpoint = /\/[^/?]+\/[^/?]+(?:\?|$)/.test(url);
      if (isDetailEndpoint) {
        toast.error(pickMessage(data, "Kayıt bulunamadı"));
      }
      return Promise.reject(error);
    }

    // 400 — validation field errors propagate, generic mesaj toast
    if (status === 400) {
      if (data?.errors && Object.keys(data.errors).length > 0) {
        // Inline gösterim — component handle eder
        return Promise.reject(error);
      }
      toast.error(pickMessage(data, "Geçersiz istek"));
      return Promise.reject(error);
    }

    // 409 — conflict
    if (status === 409) {
      toast.error(pickMessage(data, "Bu işlem mevcut durumda yapılamaz"));
      return Promise.reject(error);
    }

    // 422 — semantic
    if (status === 422) {
      toast.error(pickMessage(data, "Geçersiz veri"));
      return Promise.reject(error);
    }

    // 5xx — server
    if (status && status >= 500) {
      toast.error("Sunucu hatası, lütfen tekrar deneyin");
      return Promise.reject(error);
    }

    // Network (no response)
    if (!error.response) {
      toast.error("Bağlantı hatası, internet bağlantınızı kontrol edin");
      return Promise.reject(error);
    }

    return Promise.reject(error);
  },
);
