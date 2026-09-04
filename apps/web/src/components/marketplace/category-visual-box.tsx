import { segmentPhotoSrc } from "@/lib/public/category-photos";
import { TONE_CLASS, categoryVisual } from "@/lib/public/category-visual";
import Image from "next/image";

/**
 * ÜRETİLMİŞ kategori görseli — SUNUCU bileşeni (hook yok, olay yok).
 *
 * `CategoryImage` istemci bileşenidir (yalnız `onError` için) ve gerçek
 * fotoğraf yokken de hydrate ediliyordu; anasayfa kategori ızgarasında 9
 * kart = 9 gereksiz istemci bileşeni. Fotoğrafsız kart bunu kullanır,
 * fotoğraflı kart `CategoryImage`e gider (bkz. `category-grid.tsx`).
 */
export function CategoryVisualBox({
  categoryIds,
  ratio = "aspect-[16/9]",
  className = "",
}: {
  categoryIds?: string[];
  ratio?: string;
  className?: string;
}) {
  const { icon: Icon, tone } = categoryVisual(categoryIds);
  const t = TONE_CLASS[tone];
  const photo = segmentPhotoSrc(categoryIds);
  if (photo) {
    // Fotoğraf bandı: alt kenara doğru koyulaşan degrade, üstüne binen
    // çipler (kategori adı, kalan gün) her fotoğrafta okunsun diye.
    return (
      <div aria-hidden className={`relative overflow-hidden ${ratio} ${className}`}>
        <Image src={photo} alt="" fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-zinc-950/45 via-zinc-950/10 to-transparent" />
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className={`relative flex items-center justify-center overflow-hidden ${ratio} ${t.surface} ${className}`}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-white/60 via-transparent to-zinc-950/[0.04]"
      />
      <Icon aria-hidden strokeWidth={1.25} className={`relative size-1/3 max-h-20 min-h-9 ${t.icon}`} />
    </div>
  );
}
