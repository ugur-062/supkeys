import { categoryPath } from "@/lib/public/marketplace";
import type { ShowcaseCategory } from "@/lib/public/category-showcase";
import { TONE_CLASS, categoryVisual } from "@/lib/public/category-visual";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Image from "next/image";
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
            Ürünler, alım talepleri ve satış ilanları 58 üst kategori altında
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

      <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {categories.slice(0, 12).map((c) => (
          <li key={c.id}>
            <Row category={c} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ category: c }: { category: ShowcaseCategory }) {
  const { icon: Icon, tone } = categoryVisual([c.id]);
  const t = TONE_CLASS[tone];
  return (
    <Link
      href={categoryPath(c.id, c.name)}
      className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-zinc-950/10"
    >
      {/* Fotoğraf ÜSTTE, 16:10 — 48 px'lik yan küçük resim fotoğrafı
          okunmaz kılıyordu (kullanıcı: "yüksekliği çok düşük"). */}
      {c.imageSrc ? (
        <span className="relative block aspect-[16/10] overflow-hidden bg-zinc-100">
          <Image
            src={c.imageSrc}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        </span>
      ) : (
        <span className={`flex aspect-[16/10] items-center justify-center ${t.surface}`}>
          <Icon aria-hidden strokeWidth={1.25} className={`size-10 ${t.icon}`} />
        </span>
      )}
      <span className="flex items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-zinc-900">{c.name}</span>
          {c.count > 0 ? (
            <span className="block text-xs text-zinc-500 tabular-nums">{c.count.toLocaleString("tr-TR")} ürün</span>
          ) : (
            <span className="block text-xs text-zinc-500">Keşfet</span>
          )}
        </span>
        <ArrowRightIcon
          aria-hidden
          className="size-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500"
        />
      </span>
    </Link>
  );
}
