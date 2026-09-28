"use client";

import { reportClientError } from "@/lib/client-error";
import { DEFAULT_LOCALE, type Locale } from "@rothern/i18n";
import { globalErrorText, localeFromPathname } from "@/lib/global-error-text";
import { useEffect, useState } from "react";
import "./globals.css";

/**
 * Kök hata sınırı — root layout'un kendisi render/hata verirse (error.tsx'in
 * yakalayamadığı tek durum) devreye girer. Kendi <html>/<body>'sini render
 * eder çünkü root layout'un yerini alır. Prod-only.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // İlk çizim Türkçe (sunucu ve istemci aynı → hidrasyon uyuşmazlığı yok),
  // dil efektte adresten okunur.
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => {
    setLocale(localeFromPathname(window.location.pathname));
  }, []);
  const text = globalErrorText(locale);

  useEffect(() => {
    console.error(error);
    // Kök sınır: buraya düşen hata kullanıcıya beyaz ekran gösterir; hata
    // izlemeye GİTMEZSE kimse görmez (2026-09-12 boşluğu).
    reportClientError(error, { kind: "boundary", digest: error.digest });
  }, [error]);

  return (
    <html lang={locale}>
      <head>
        <meta name="robots" content="noindex" />
      </head>
      <body className="antialiased">
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
          <div
            role="alert"
            className="flex max-w-md flex-col items-center gap-3 rounded-xl border border-zinc-950/10 bg-white px-6 py-12 text-center"
          >
            <p className="text-base font-semibold text-zinc-900">{text.title}</p>
            <p className="text-sm text-zinc-500">{text.body}</p>
            <button
              type="button"
              onClick={reset}
              className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {text.retry}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
