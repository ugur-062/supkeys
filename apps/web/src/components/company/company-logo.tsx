"use client";

import { useState } from "react";

/**
 * Firma logosu — YÜKLENEMEZSE yedeğe düşer.
 *
 * `SafeCoverImage` ile aynı gerekçe: logonun OLMAMASI ile YÜKLENEMEMESİ ayrı
 * hâller ve ikincisi canlıda gerçekleşti (`pub-*.r2.dev` 503 döndü, o bucket'ın
 * Public Development URL ayarı kapalı — kalıcı çözüm custom domain). `src`
 * dolu olduğu için yedek çizilmiyordu; tarayıcı kırık görselin yerine çıplak
 * alt metnini basıyordu ("İkinci Firma Ltd logosu" yazan kutu).
 *
 * Yedek DIŞARIDAN verilir: profil sayfası baş harfi, dizin kartı bina ikonu
 * gösteriyor — bileşen ikisini de dayatmamalı.
 */
export function CompanyLogo({
  src,
  alt,
  className,
  fallback,
}: {
  src: string | null | undefined;
  alt: string;
  className: string;
  fallback: React.ReactNode;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) return <>{fallback}</>;

  return (
    // `next/image` DEĞİL: logolar R2/CDN'den geliyor ve `images.remotePatterns`
    // her ortam için yapılandırılmış değil.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
}
