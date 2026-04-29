import axios, { type AxiosError } from "axios";
import { useAuthStore } from "./auth/store";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Her isteğe Bearer token ekle
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// 401 → otomatik logout + login'e yönlendir
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const { token, clear } = useAuthStore.getState();
      // Sadece bizim eklediğimiz token varsa logout yap (auth endpoint'leri 401 dönerse loop'a girmesin)
      if (token) {
        clear();
        // Public sayfalardayken yönlendirme yapma
        const publicPaths = ["/login", "/register", "/", "/demo-talep"];
        const onPublic = publicPaths.some((p) => window.location.pathname === p);
        if (!onPublic) {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  },
);
