import {
  TONE_CLASS,
  categoryVisual,
} from "@/lib/public/category-visual";

/**
 * Kart görseli — gerçek fotoğraf varsa o, yoksa ÜRETİLMİŞ kategori görseli.
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
}: {
  /** `Category.imageUrl` — doluysa üretilmiş görselin yerine geçer. */
  src?: string | null;
  categoryIds?: string[];
  alt?: string;
  className?: string;
  ratio?: string;
}) {
  if (src) {
    return (
      <div className={`relative overflow-hidden ${ratio} ${className}`}>
        {/* `next/image` DEĞİL: `images.remotePatterns` yapılandırılmamış
            (profil sayfası da aynı sebeple düz <img> kullanıyor). Faz 3c'de
            cdn.rothern.com için yapılandırılacak. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="size-full object-cover"
        />
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
