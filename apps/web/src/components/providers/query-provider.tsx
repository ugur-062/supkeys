"use client";

import { installToastDedupe } from "@/lib/toast-dedupe";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

// Hata toast'ları iki katmandan (axios interceptor + mutation catch)
// basılabiliyor — aynı metni kısa pencerede tekilleştir.
installToastDedupe();

/**
 * Durum-farkında retry: 4xx istemci hatasıdır, tekrar denemek anlamsız
 * (401'i zaten axios interceptor'ı halleder) — TEK İSTİSNA 429 (rate limit),
 * o geçicidir. Network hatası / 5xx / 429 ise backoff'la 3 kez denenir:
 * API (Render free) uykudan kalkarken ilk istekler geçici hata verebilir;
 * tek retry o pencereyi kaçırıp kullanıcıyı elle yenilemeye mecbur bırakıyordu.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  if (status && status >= 400 && status < 500 && status !== 429) return false;
  return failureCount < 3;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            retry: shouldRetry,
            // 1s → 2s → 4s (tavan 30s) — cold-start penceresini köprüler.
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
