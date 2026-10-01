"use client";

import { RouteErrorFallback } from "@/components/layout/route-error-fallback";

/**
 * Kök segment hata sınırı — admin layout'unun kendisi (oturum kapısı) hata
 * verirse buraya düşer; kabuk çizilmez. Admin sayfalarının hataları
 * `app/admin/error.tsx`'te kabukla birlikte gösterilir.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorFallback error={error} reset={reset} withShell={false} />;
}
