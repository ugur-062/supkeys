"use client";

import axios, { type AxiosError } from "axios";
import { useSupplierAuthStore } from "./store";

/**
 * Tedarikçi paneline ait axios instance — tenant ve admin api'lerinden BAĞIMSIZ.
 * Kendi store'undan token okur, 401'de kendi login sayfasına yönlendirir.
 */
export const supplierApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api",
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

supplierApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const { token, clear } = useSupplierAuthStore.getState();
      if (token) {
        clear();
        const onLogin = window.location.pathname === "/supplier/login";
        if (!onLogin) {
          window.location.href = "/supplier/login";
        }
      }
    }
    return Promise.reject(error);
  },
);
