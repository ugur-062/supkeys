import { ProductCard } from "./product-card";
import { fetchCompanyProducts } from "@/lib/public/marketplace-api";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

/**
 * Firma profilindeki ÜRÜN PORTFÖYÜ — sunucu bileşeni.
 *
 * Ürünü olmayan firmada HİÇ BASILMAZ (boş başlık göstermek profili yarım
 * gösterir). Pazar yeri anahtarı kapalıyken de basılmaz: ürünler yeni ve
 * anahtar açılmadan görünmemeli.
 *
 * Kendi verisini kendi çeker (sayfanın profil isteğine bağlanmaz) — böylece
 * ürün ucu düşse bile profil sayfası çalışmaya devam eder.
 */
export async function CompanyProducts({
  companySlug,
}: {
  companySlug: string;
}) {
  // Görünürlük pazar yeri anahtarına BAĞLI DEĞİL (2026-09-03): ürünler
  // firmanın zaten açık olan profilinin parçası. İndekslenme ayrı kapı
  // (sayfa `noindex` + sitemap anahtara bağlı).
  const page = await fetchCompanyProducts(companySlug);
  if (page.items.length === 0) return null;

  return (
    <section id="urunler" className="mt-12 scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
          Ürünler ve hizmetler
          <span className="ml-2 text-base font-normal text-zinc-400">
            {page.total.toLocaleString("tr-TR")}
          </span>
        </h2>
        {page.total > 8 ? (
          <Link
            href={`/firma/${companySlug}#urunler`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600"
          >
            Tümünü gör
            <ArrowRightIcon aria-hidden className="size-4" />
          </Link>
        ) : null}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {page.items.map((p) => (
          <ProductCard key={p.slug} companySlug={companySlug} product={p} priceGated />
        ))}
      </div>
    </section>
  );
}
