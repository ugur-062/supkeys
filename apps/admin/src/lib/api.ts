import axios, { type AxiosError } from "axios";
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

// 401 → otomatik logout + admin login'e yönlendir
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const { token, clear } = useAdminAuthStore.getState();
      if (token) {
        clear();
        const onLogin = window.location.pathname === "/admin/login";
        if (!onLogin) {
          window.location.href = "/admin/login";
        }
      }
    }
    return Promise.reject(error);
  },
);
