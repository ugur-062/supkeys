"use client";

import { reportClientError } from "@/lib/client-error";
import { isPublicApiUnavailable } from "@/lib/public/unavailable";
import { ErrorState } from "@/components/ui/error-state";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect } from "react";

/**
 * Segment hata sınırı — root layout altındaki herhangi bir sayfa render/veri
 * hatası bunu tetikler (kök layout'un kendi hatası → global-error.tsx).
 *
 * İKİ EKRAN (2026-10-08, staging kesintisi):
 *  - API'ye ulaşılamadı (`PublicApiUnavailableError`, `digest` işaretiyle
 *    tanınır — üretimde hata mesajı istemciye gelmez): sakin "şu anda
 *    yüklenemiyor" ekranı; birkaç kez kendiliğinden yeniden dener, sonra durur.
 *  - Diğer her hata: genel "Bir şeyler ters gitti".
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("web.shared.unavailable");
  const unavailable = isPublicApiUnavailable(error);
  useEffect(() => {
    console.error(error);
    // Kesinti sunucuda zaten günlüğe/Sentry'e yazıldı; her ziyaretçinin
    // tarayıcısından ayrıca bildirmek kesinti boyunca yalnız gürültü üretir.
    if (unavailable) return;
    // 2026-09-12: "Sentry kuruluysa yakalar" varsayımı YANLIŞTI — ön yüzde SDK
    // HİÇ kurulu değildi. Artık açıkça bildiriyoruz (DSN yoksa no-op).
    reportClientError(error, { kind: "boundary", digest: error.digest });
  }, [error, unavailable]);

  /* "Tekrar dene" (arayüz testi O-112): yalnız `reset()` sunucu bileşeni
     hatasında önbellekteki BAŞARISIZ yükü yeniden çekmiyordu — API geri
     gelse de kart kalıyor, yalnız tarayıcı yenilemesi kurtarıyordu.
     `router.refresh()` rotayı sunucudan yeniden ister; ikisi aynı
     geçişte (Next hata sınırı kalıbı). Otomatik deneme de AYNI yoldan. */
  const retry = useCallback(() => {
    router.refresh();
    reset();
  }, [router, reset]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      {/* Akış başladıktan sonra atılan hata (ör. API kesintisi, B1-1) 200
          durum koduyla gelir — hata sayfası indekslenmesin (React 19 <meta>'yı
          <head>'e taşır). */}
      <meta name="robots" content="noindex" />
      {/* Sunucu 500 döndüğünde belge BAŞLIKSIZ gelir (sekmede çıplak adres
          görünür). React 19 <title>'ı <head>'e taşır ve ekran kalkınca
          kaldırır — sayfa toparlanınca kendi başlığı geçerli olur. Akışı
          başlamış sayfada (200) sayfanın kendi başlığı önce gelir, o kalır. */}
      {unavailable ? <title>{`${t("title")} · Rothern`}</title> : null}
      {unavailable ? (
        <UnavailableState error={error} onRetry={retry} className="max-w-md" />
      ) : (
        <ErrorState onRetry={() => startTransition(retry)} className="max-w-md" />
      )}
    </div>
  );
}
