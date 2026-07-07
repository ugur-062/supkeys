"use client";

import { useEffect } from "react";
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
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="tr">
      <body className="antialiased">
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
          <div
            role="alert"
            className="flex max-w-md flex-col items-center gap-3 rounded-xl border border-zinc-950/10 bg-white px-6 py-12 text-center"
          >
            <p className="text-base font-semibold text-zinc-900">
              Bir şeyler ters gitti
            </p>
            <p className="text-sm text-zinc-500">
              Beklenmeyen bir hata oluştu. Lütfen sayfayı yenileyin.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Tekrar dene
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
