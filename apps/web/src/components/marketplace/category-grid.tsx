import { CategoryImage } from "./category-image";
import { categoryPath } from "@/lib/public/marketplace";
import type { ShowcaseCategory } from "@/lib/public/category-showcase";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

/**
 * "KATEGORİYE GÖRE KEŞFET" — anasayfanın görsel ağırlığı (2026-09-04).
 *
 * "Aradığınız kalem kataloğun içinde" metin bandının YERİNE: ziyaretçiye
 * ağacı anlatmak yerine ağacı GÖSTERİYORUZ. Solda bir büyük kart, sağda 5×2
 * ızgara = 11 üst kategori. Her zaman görünür — sıfır envanterde de katalog
 * gerçek ve gezilebilir; sayı yalnız > 0 ise basılır.
 *
 * Görsel kademesi `category-showcase.ts` + `category-photos.ts`: fotoğraf →
 * o kategorideki ilk ürün kapağı → üretilmiş ikon+ton. Tıklama kategori
 * kırılım sayfasına (`/urunler/kategori/<kod>-<ad>`, SSG) — süzgeç sorgu
 * parametresi değil yol parçası, gerekçe CLAUDE.md § Ürün dizini.
 */
export function CategoryGrid({ categories }: { categories: ShowcaseCategory[] }) {
  if (categories.length === 0) return null;
  const [lead, ...rest] = categories;

  return (
    <section id="kategoriler" className="mx-auto max-w-7xl scroll-mt-24 px-6 py-16 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
            Kategoriye göre keşfet
          </h2>
          <p className="mt-2 max-w-2xl text-base/7 text-zinc-500">
            Ürünler, alım talepleri ve satılık ilanlar 58 üst kategori altında
            sınıflandırılır. Aradığınız dalı seçin.
          </p>
        </div>
        <Link
          href="/urunler"
          className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 transition hover:text-zinc-600"
        >
          Tüm kategoriler
          <ArrowRightIcon aria-hidden className="size-4" />
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 lg:grid-rows-2">
        <Tile category={lead} large />
        {rest.slice(0, 10).map((c) => (
          <Tile key={c.id} category={c} />
        ))}
      </div>
    </section>
  );
}

function Tile({ category: c, large = false }: { category: ShowcaseCategory; large?: boolean }) {
  return (
    <Link
      href={categoryPath(c.id, c.name)}
      className={`group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-zinc-950/10 ${
        large ? "col-span-2 row-span-2 sm:col-span-3 lg:col-span-2" : ""
      }`}
    >
      <CategoryImage
        src={c.imageSrc}
        categoryIds={[c.id]}
        ratio={large ? "aspect-[4/3] lg:aspect-auto lg:flex-1" : "aspect-[3/2]"}
        className="border-b border-zinc-950/5"
      />
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span
          className={`line-clamp-2 font-medium text-zinc-900 ${large ? "text-base" : "text-sm"}`}
        >
          {c.name}
        </span>
        {c.count > 0 ? (
          <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
            {c.count.toLocaleString("tr-TR")}
          </span>
        ) : (
          <ArrowRightIcon
            aria-hidden
            className="size-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500"
          />
        )}
      </div>
    </Link>
  );
}
