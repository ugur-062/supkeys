"use client";

import { segmentPhotoSrc } from "@/lib/public/category-photos";
import { TONE_CLASS, categoryVisual } from "@/lib/public/category-visual";
import { optimizable } from "@/lib/public/image-host";
import { ImageOff } from "lucide-react";
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
  fallback = "category",
  label,
}: {
  /** `Category.imageUrl` — doluysa üretilmiş görselin yerine geçer. */
  src?: string | null;
  categoryIds?: string[];
  alt?: string;
  className?: string;
  ratio?: string;
  /** LCP adayı — lazy değil, öncelikli. */
  priority?: boolean;
  /**
   * Görsel yoksa ne çizilir: `category` = tonlu segment ikonu (ilan/talep —
   * kategori görseli meşru içerik); `neutral` = nötr gri + görsel-yok ikonu
   * (ÜRÜN — görsel zorunlu, yokluğu bir eksikliktir; tonlu kutu onu saklardı).
   */
  fallback?: "category" | "neutral";
  /** Görselin köşesine küçük etiket — "Temsili görsel" (stok fotoğraf). */
  label?: string;
}) {
  // Yükleme hatası → üretilmiş görsele düş. `src` değişirse (aynı kartın
  // yeniden kullanımı) hata durumu sıfırlanmalı; anahtar olarak src kullanılır.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  // Kaydın kendi görseli yoksa (ya da yüklenemediyse) SEGMENT fotoğrafı —
  // 58 üst kategorinin hepsinin fotoğrafı var (`category-photos.ts`). Yerel
  // dosya olduğu için `next/image` optimize eder. Ürün (`neutral`) bu
  // kademeyi ATLAR: ürün görseli zorunlu, yokluğu kategori fotoğrafıyla
  // saklanmamalı.
  const photo = fallback === "category" && (!src || failedSrc === src) ? segmentPhotoSrc(categoryIds) : null;
  if (photo && failedSrc !== photo) {
    return (
      <div className={`relative overflow-hidden ${ratio} ${className}`}>
        <Image
          src={photo}
          alt={alt}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover"
          priority={priority}
          onError={() => setFailedSrc(photo)}
        />
        {label ? (
          <span className="absolute bottom-1.5 left-1.5 rounded-md bg-zinc-950/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            {label}
          </span>
        ) : null}
      </div>
    );
  }

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
        {label ? (
          <span className="absolute bottom-1.5 left-1.5 rounded-md bg-zinc-950/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            {label}
          </span>
        ) : null}
      </div>
    );
  }

  if (fallback === "neutral") {
    return (
      <div
        aria-hidden={alt === "" ? true : undefined}
        role={alt === "" ? undefined : "img"}
        aria-label={alt || undefined}
        className={`relative flex items-center justify-center overflow-hidden bg-neutral-100 ${ratio} ${className}`}
      >
        <ImageOff aria-hidden strokeWidth={1.25} className="size-8 text-neutral-400" />
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
