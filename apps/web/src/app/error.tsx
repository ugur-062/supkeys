"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useEffect } from "react";

/**
 * Segment hata sınırı — root layout altındaki herhangi bir sayfa render/veri
 * hatası bunu tetikler (kök layout'un kendi hatası → global-error.tsx).
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Prod'da Sentry client SDK (kuruluysa) burada yakalar; en azından logla.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <ErrorState onRetry={reset} className="max-w-md" />
    </div>
  );
}
