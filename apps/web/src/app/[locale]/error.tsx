"use client";

import { reportClientError } from "@/lib/client-error";
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
    console.error(error);
    // 2026-09-12: "Sentry kuruluysa yakalar" varsayımı YANLIŞTI — ön yüzde SDK
    // HİÇ kurulu değildi. Artık açıkça bildiriyoruz (DSN yoksa no-op).
    reportClientError(error, { kind: "boundary", digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <ErrorState onRetry={reset} className="max-w-md" />
    </div>
  );
}
