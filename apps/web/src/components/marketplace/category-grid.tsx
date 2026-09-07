import { CategoryTile } from "./category-tile";
import { categoryPath } from "@/lib/public/marketplace";
import type { ShowcaseCategory } from "@/lib/public/category-showcase";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

/**
 * "KATEGORİYE GÖRE KEŞFET" — fotoğraf kartları (2026-09-04, akşam).
 *
 * 12 kart, 4 sütun: üstte segment FOTOĞRAFI (16:10; yoksa tonlu ikon),
 * altta ad + o daldaki ürün sayısı. Önce ikon+ad listesi denendi; 58
 * fotoğraf gelince 48 px küçük resim fotoğrafı boşa harcıyordu. Foto ızgarası 11
 * kutuya bir ekran harcıyordu ve fotoğraf kategoriyi adından iyi anlatmıyordu;
 * liste 12 kategoriyi yarım ekranda okutur, sayı hangi dalın dolu olduğunu
 * söyler. Her zaman görünür — sıfır envanterde de katalog gezilebilir; sayı
 * yalnız > 0 ise basılır. Tıklama kategori kırılım sayfasına
 * (`/urunler/kategori/<kod>-<ad>`, SSG) — süzgeç sorgu parametresi değil yol
 * parçası, gerekçe CLAUDE.md § Ürün dizini.
 */
export function CategoryGrid({ categories }: { categories: ShowcaseCategory[] }) {
  if (categories.length === 0) return null;

  return (
    <section id="kategoriler" className="mx-auto max-w-7xl scroll-mt-24 px-6 py-16 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
            Kategoriye göre keşfet
          </h2>
          <p className="mt-2 max-w-2xl text-base/7 text-zinc-500">
            Ürünler ve alım talepleri 58 üst kategori altında sınıflandırılır.
            Aradığınız dalı seçin.
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

      <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {categories.slice(0, 12).map((c) => (
          <li key={c.id}>
            <CategoryTile
              category={c}
              href={categoryPath(c.id, c.name)}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

