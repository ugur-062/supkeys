import axios, { type AxiosError } from "axios";
import { toast } from "sonner";
import { useAdminAuthStore } from "./auth/store";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Her isteğe Bearer token ekle (admin token)
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = useAdminAuthStore.getState().token;
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

// Polish-3 — global toast handler. Web tarafıyla aynı kurallar.
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorPayload>) => {
    if (typeof window === "undefined") return Promise.reject(error);

    const status = error.response?.status;
    const data = error.response?.data;

    // 401 — token expire / yetkisiz
    if (status === 401) {
      const { token, clear } = useAdminAuthStore.getState();
      if (token) {
        clear();
        const onLogin = window.location.pathname === "/admin/login";
        if (!onLogin) {
          window.location.href = "/admin/login";
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
