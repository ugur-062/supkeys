"use client";

import {
  RouteErrorFallback,
  useCanShowShell,
} from "@/components/layout/route-error-fallback";

/**
 * /admin/* sayfa hata sınırı — admin layout'unun (oturum kapısı) İÇİNDE
 * çizilir; oturum açıkken üst çubuk + menü korunur (arayüz testi D-219).
 * Kabuğun kendisi hata verirse yeniden çizim yine düşer ve kök
 * `app/error.tsx` kabuksuz gösterir.
 */
export default function AdminSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const withShell = useCanShowShell();
  return (
    <RouteErrorFallback error={error} reset={reset} withShell={withShell} />
  );
}
