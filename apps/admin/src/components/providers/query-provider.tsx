"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useState } from "react";

/**
 * Sorgu yeniden deneme kuralı: 4xx (403 yetki, 404 bulunamadı, 400 geçersiz
 * istek) yeniden denemeyle düzelmez. Önceden her sorgu bir kez daha deneniyor,
 * interceptor her denemede toast bastığı için aynı hata İKİ kez görünüyordu
 * (arayüz testi D-215, D-033). Ağ/5xx hataları bir kez yeniden denenir.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isAxiosError(error)) {
    const status = error.response?.status ?? 0;
    if (status >= 400 && status < 500) return false;
  }
  return failureCount < 1;
}

export function createAdminQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
        retry: shouldRetryQuery,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(createAdminQueryClient);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
