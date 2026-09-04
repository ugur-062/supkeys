"use client";

import { TONE_CLASS, categoryVisual } from "@/lib/public/category-visual";
import { optimizable } from "@/lib/public/image-host";
import Image from "next/image";
import { useState } from "react";

/**
 * Kart görseli — gerçek fotoğraf varsa o, yoksa ÜRETİLMİŞ kategori görseli.
 *
 * İSTEMCİ bileşeni olmasının TEK sebebi `onError`: görselin YOK olması ile
 * YÜKLENEMEMESİ ayrı hâller ve ikincisi canlıda gerçekleşti — `cdn.rothern.com`
 * altındaki eski anahtarlar 404, `pub-*.r2.dev` 503 döndü. `src` dolu olduğu
 * için yedek çizilmiyor, tarayıcı da kırık görselin yerine ÇIPLAK ALT METNİ
 * basıyordu ("Dağıtım Panosu 400A IP54" yazan gri kutu). Yükleme başarısız
 * olursa aynı üretilmiş kategori görseline düşülür.
 *
 * Gri boş kutu YOK: envanterin çoğu ALIM ve alıcı fotoğraf yüklemiyor
 * (satan gösterir, alan tarif eder). Kategori her kayıtta var, dolayısıyla
 * her kart bir şey gösterebilir.
 *
 * Üretilmiş görünüm: yumuşak tonlu zemin + o segmentin ikonu + ince degrade.
 * Ton ALAN AİLESİNİ anlatır (hammadde/makine/yapı/sağlık/bilgi/tüketici/
 * hizmet) — rastgele renk değil; gerekçe `category-visual.ts`de.
 */
export function CategoryImage({
  src,
  categoryIds,
  alt = "",
  className = "",
  ratio = "aspect-[16/9]",
  priority = false,
}: {
  /** `Category.imageUrl` — doluysa üretilmiş görselin yerine geçer. */
  src?: string | null;
  categoryIds?: string[];
  alt?: string;
  className?: string;
  ratio?: string;
  /** LCP adayı — lazy değil, öncelikli. */
  priority?: boolean;
}) {
  // Yükleme hatası → üretilmiş görsele düş. `src` değişirse (aynı kartın
  // yeniden kullanımı) hata durumu sıfırlanmalı; anahtar olarak src kullanılır.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src && failedSrc !== src) {
    return (
      <div className={`relative overflow-hidden ${ratio} ${className}`}>
        {optimizable(src) ? (
          // CDN host'u `next.config` `remotePatterns`te tanımlıysa optimize
          // edilmiş sürüm: responsive srcset + lazy + boyut dönüşümü.
          <Image
            src={src}
            alt={alt}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
            priority={priority}
            onError={() => setFailedSrc(src)}
          />
        ) : (
          // Tanımsız host (harici görsel, yapılandırılmamış ortam) →
          // `next/image` REDDEDER. Düz <img> ile göstermek, görselin hiç
          // görünmemesinden iyidir.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            className="size-full object-cover"
            onError={() => setFailedSrc(src)}
          />
        )}
      </div>
    );
  }

  const { icon: Icon, tone } = categoryVisual(categoryIds);
  const t = TONE_CLASS[tone];

  return (
    <div
      aria-hidden={alt === "" ? true : undefined}
      role={alt === "" ? undefined : "img"}
      aria-label={alt || undefined}
      className={`relative flex items-center justify-center overflow-hidden ${ratio} ${t.surface} ${className}`}
    >
      {/* İnce diyagonal doku — düz renk bir dikdörtgenden fazlası olsun ama
          ikonu bastırmasın. Palet sınıfı (ham renk yasağı). */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-white/60 via-transparent to-zinc-950/[0.04]"
      />
      <Icon
        aria-hidden
        strokeWidth={1.25}
        className={`relative size-1/3 max-h-20 min-h-9 ${t.icon}`}
      />
    </div>
  );
}
