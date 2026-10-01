"use client";

import { reportClientError } from "@/lib/client-error";
import { ErrorState } from "@/components/ui/error-state";
import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";

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
  const router = useRouter();
  useEffect(() => {
    console.error(error);
    // 2026-09-12: "Sentry kuruluysa yakalar" varsayımı YANLIŞTI — ön yüzde SDK
    // HİÇ kurulu değildi. Artık açıkça bildiriyoruz (DSN yoksa no-op).
    reportClientError(error, { kind: "boundary", digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      {/* Akış başladıktan sonra atılan hata (ör. API kesintisi, B1-1) 200
          durum koduyla gelir — hata sayfası indekslenmesin (React 19 <meta>'yı
          <head>'e taşır). */}
      <meta name="robots" content="noindex" />
      {/* "Tekrar dene" (arayüz testi O-112): yalnız `reset()` sunucu bileşeni
          hatasında önbellekteki BAŞARISIZ yükü yeniden çekmiyordu — API geri
          gelse de kart kalıyor, yalnız tarayıcı yenilemesi kurtarıyordu.
          `router.refresh()` rotayı sunucudan yeniden ister; ikisi aynı
          geçişte (Next hata sınırı kalıbı). */}
      <ErrorState
        onRetry={() =>
          startTransition(() => {
            router.refresh();
            reset();
          })
        }
        className="max-w-md"
      />
    </div>
  );
}
