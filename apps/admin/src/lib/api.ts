import axios, { type AxiosError } from "axios";
import { toast } from "sonner";
import { useAdminAuthStore } from "./auth/store";
import { readCsrfToken } from "./csrf";
import { resolveApiBaseUrl } from "./resolve-api-url";

// Oturum httpOnly cookie'de (withCredentials); Bearer taşımıyoruz.
export const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

const MUTATING = new Set(["post", "put", "patch", "delete"]);

// Mutating isteklere CSRF çift-gönderim header'ı ekle.
api.interceptors.request.use((config) => {
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

/**
 * Interceptor'ın zaten toast bastığı hatayı işaretler (derin denetim MU-21):
 * sayfalar `toastApiError` ile ikinci (ham İngilizce) toast basmasın.
 */
const TOASTED = Symbol.for("rothern.admin.apiErrorToasted");

function markHandled(error: AxiosError<ApiErrorPayload>) {
  (error as unknown as Record<symbol, boolean>)[TOASTED] = true;
}

function toastOnce(error: AxiosError<ApiErrorPayload>, message: string) {
  markHandled(error);
  toast.error(message);
}

function wasToasted(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as Record<symbol, unknown>)[TOASTED] === true
  );
}

/**
 * Kullanıcıya gösterilecek hata metni. AxiosError'ın `message`'ı ("Request
 * failed with status code 400") ASLA gösterilmez: önce doğrulama `errors`
 * haritasındaki ilk alan mesajı, sonra sunucu `message`'ı, en son `fallback`.
 */
export function apiErrorMessage(e: unknown, fallback = "İşlem başarısız"): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as ApiErrorPayload | undefined;
    if (data?.errors && typeof data.errors === "object") {
      for (const v of Object.values(data.errors)) {
        const first = Array.isArray(v) ? v[0] : v;
        if (typeof first === "string" && first.trim()) return first;
      }
    }
    return pickMessage(data, fallback);
  }
  // Uygulama içi (axios dışı) hata — mesajı bilinçli yazılmıştır.
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

/**
 * Mutasyon `onError` için tek kapı: interceptor bu hatayı zaten toast'ladıysa
 * sessiz kalır (çift toast yok); aksi hâlde `apiErrorMessage` gösterir.
 */
export function toastApiError(e: unknown, fallback = "İşlem başarısız"): void {
  if (wasToasted(e)) return;
  toast.error(apiErrorMessage(e, fallback));
}

// Polish-3 — global toast handler. Web tarafıyla aynı kurallar.
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorPayload>) => {
    if (typeof window === "undefined") return Promise.reject(error);

    const status = error.response?.status;
    const data = error.response?.data;

    // 401 — token expire / yetkisiz
    if (status === 401) {
      // Oturum sinyali artık `admin` (cookie geçersizse /me 401 verir).
      const { admin, clear } = useAdminAuthStore.getState();
      if (admin) {
        // Oturum düştü → login'e gidiliyor; sayfa ayrıca toast basmasın.
        markHandled(error);
        clear();
        const onLogin = window.location.pathname === "/admin/login";
        if (!onLogin) {
          window.location.href = "/admin/login";
        }
      }
      return Promise.reject(error);
    }

    if (status === 403) {
      toastOnce(error, pickMessage(data, "Bu işlem için yetkiniz yok"));
      return Promise.reject(error);
    }

    if (status === 404) {
      const url = error.config?.url ?? "";
      const isDetailEndpoint = /\/[^/?]+\/[^/?]+(?:\?|$)/.test(url);
      if (isDetailEndpoint) {
        toastOnce(error, pickMessage(data, "Kayıt bulunamadı"));
      }
      return Promise.reject(error);
    }

    if (status === 400) {
      if (data?.errors && Object.keys(data.errors).length > 0) {
        return Promise.reject(error);
      }
      toastOnce(error, pickMessage(data, "Geçersiz istek"));
      return Promise.reject(error);
    }

    if (status === 409) {
      toastOnce(error, pickMessage(data, "Bu işlem mevcut durumda yapılamaz"));
      return Promise.reject(error);
    }

    if (status === 422) {
      toastOnce(error, pickMessage(data, "Geçersiz veri"));
      return Promise.reject(error);
    }

    if (status && status >= 500) {
      toastOnce(error, "Sunucu hatası, lütfen tekrar deneyin");
      return Promise.reject(error);
    }

    if (!error.response) {
      toastOnce(error, "Bağlantı hatası, internet bağlantınızı kontrol edin");
      return Promise.reject(error);
    }

    return Promise.reject(error);
  },
);
