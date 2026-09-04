import { TONE_CLASS, categoryVisual } from "@/lib/public/category-visual";

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
