"use client";

import { CategoryImage } from "./category-image";
import { cn } from "@/lib/utils";
import { useState } from "react";

/**
 * ÜRÜN GALERİSİ (PROMPT 7) — kare ana görsel + altında küçük resim şeridi.
 *
 * Eskiden ilk görsel 16:10 basılıyor, kalanlar TIKLANAMAYAN bir şerit olarak
 * altına diziliyordu: ziyaretçi ikinci fotoğrafı büyük göremiyordu. Şerit
 * artık seçicidir (seçili olan koyu çerçeveli); tek görselli üründe hiç
 * çizilmez. Kare oran Europages kalıbı — ürün fotoğrafları çoğunlukla kare
 * çekilmiş stüdyo/atölye kareleri, 16:10 onları kırpıyordu.
 *
 * Görsel yoksa `CategoryImage` kategori ikonuna düşer (nötr gri) — ürün
 * görseli yayın kapısında zorunlu, yokluğu bir EKSİKLİK; tonlu kutu saklardı.
 */
export function ProductGallery({
  images,
  alt,
  categoryIds,
}: {
  images: string[];
  alt: string;
  categoryIds: string[];
}) {
  const [active, setActive] = useState(0);
  const list = images.slice(0, 6);
  const current = list[active] ?? list[0];

  return (
    <div>
      <CategoryImage
        src={current}
        categoryIds={categoryIds}
        alt={alt}
        ratio="aspect-square"
        className="rounded-2xl bg-zinc-100 ring-1 ring-zinc-950/5"
        priority
        fallback="neutral"
      />
      {list.length > 1 ? (
        <ul className="mt-3 grid grid-cols-5 gap-3 sm:grid-cols-6">
          {list.map((src, i) => (
            <li key={src}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`${i + 1}. görseli göster`}
                aria-current={i === active}
                className={cn(
                  "block w-full overflow-hidden rounded-lg ring-1 transition",
                  i === active ? "ring-2 ring-zinc-950" : "ring-zinc-950/10 hover:ring-zinc-400",
                )}
              >
                <CategoryImage src={src} alt="" ratio="aspect-square" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
