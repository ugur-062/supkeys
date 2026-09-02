import { CategoryImage } from "./category-image";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import type { PublicFacets } from "@/lib/public/marketplace-api";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

/**
 * Sektör (L1 segment) ızgarası — long-tail'in giriş kapısı.
 *
 * Sayacı OLMAYAN segment gösterilmez: içi boş bir kategori sayfasına bağlantı
 * vermek hem ziyaretçiyi çıkmaza sokar hem tarayıcı botuna "ince içerik"
 * sinyali verir. Kapsam veriden gelir, elle yazılmış listeden değil.
 *
 * ÜÇTEN AZ sektör varsa bölüm HİÇ basılmaz. Tek başına duran bir sektör
 * kutucuğu "gezinilecek bir şey var" izlenimi vermez, tersine katalogun boş
 * olduğunu duyurur; o durumda katalog ÖLÇEĞİNİ anlatan bant daha dürüst.
 */
export function SectorGrid({ facets }: { facets: PublicFacets }) {
  const sectors = facets.categories.slice(0, 12);
  if (sectors.length < 3) return <CatalogBand />;

  return (
    <section className="border-y border-zinc-950/5 bg-zinc-50">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
          Sektöre göre gezin
        </h2>
        <p className="mt-2 max-w-2xl text-base/7 text-zinc-500">
          Açık talepler ve ilanlar, Ariba/UNSPSC uyumlu 58 sektör başlığı
          altında sınıflandırılır.
        </p>
        <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {sectors.map((s) => (
            <li key={s.id}>
              <Link
                href={`${MARKETPLACE_ROUTES.demands}?kategori=${s.id}`}
                className="group block overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-zinc-950/10"
              >
                <CategoryImage categoryIds={[s.id]} ratio="aspect-[3/2]" />
                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <span className="line-clamp-2 text-sm font-medium text-zinc-900">
                    {s.name}
                  </span>
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                    {s.count}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Sektör kırılımı anlamlı olacak kadar kayıt yokken görünen bant.
 *
 * Rakam ızgarası KALDIRILDI (kullanıcı kararı): "158.018 kategori" ziyaretçi
 * için bir vaat değil, kurum içi bir istatistik. Kalan metin aynı şeyi
 * rakamla övünmeden söylüyor.
 */
function CatalogBand() {
  return (
    <section className="border-y border-zinc-950/5 bg-zinc-50">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
              Aradığınız kalem kataloğun içinde
            </h2>
            <p className="mt-2 text-base/7 text-zinc-500">
              Talepler ve ilanlar dört seviyeli, Ariba/UNSPSC uyumlu bir
              kategori ağacına bağlanır — çelik borudan laboratuvar
              sarf malzemesine kadar. Eşleşme bu ağaç üzerinden çalışır.
            </p>
          </div>
          <Link
            href="/company/kayit"
            className="inline-flex items-center gap-1 rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Ücretsiz kaydol
            <ArrowRightIcon aria-hidden className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
