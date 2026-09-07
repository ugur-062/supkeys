import { ProductCard } from "./product-card";
import { Pagination } from "@/components/ui/pagination";
import { fetchCompanyProducts, type PublicProductPage } from "@/lib/public/marketplace-api";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
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
  page: given,
  query,
}: {
  companySlug: string;
  /** Sayfa profil ile paralel çektiyse verir; yoksa bileşen kendi çeker. */
  page?: PublicProductPage;
  /** `?urun=` — firma içi arama terimi (spec §7). */
  query?: string;
}) {
  // Görünürlük pazar yeri anahtarına BAĞLI DEĞİL (2026-09-03): ürünler
  // firmanın zaten açık olan profilinin parçası. İndekslenme ayrı kapı
  // (sayfa `noindex` + sitemap anahtara bağlı).
  const page = given ?? (await fetchCompanyProducts(companySlug, { q: query }));
  // Arama VARKEN boş sonuç da çizilir: kutuyu yazan kullanıcı "sonuç yok"
  // görmeli. Aramasız boş portföy hâlâ hiç basılmaz (yarım profil hissi).
  if (page.items.length === 0 && !query) return null;

  return (
    <section id="urunler" className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {/* Başlık sayıyı PARANTEZDE taşır (kaynak kalıp): "kaç ürünü var"
            kartları saymadan okunur. */}
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
          Tüm Ürünler ve Hizmetler ({page.total.toLocaleString("tr-TR")})
        </h2>
        {/* FİRMA İÇİ ARAMA (spec §7): derin kataloglu firmada ziyaretçi
            aradığını 40 kartın içinde gözle bulmak zorunda kalmasın. Düz
            GET formu — JS'siz de çalışır, sonuç aynı sayfada. */}
        <form method="get" action={`/firma/${companySlug}`} className="flex items-center gap-2">
          <label htmlFor="firma-urun-ara" className="sr-only">
            Bu firmanın ürünlerinde ara
          </label>
          <input
            id="firma-urun-ara"
            type="search"
            name="urun"
            defaultValue={query ?? ""}
            placeholder="Ürün arama"
            className="h-11 w-52 rounded-full border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-900 sm:w-72"
          />
          <button
            type="submit"
            aria-label="Ürünlerde ara"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-white transition hover:bg-zinc-800"
          >
            <MagnifyingGlassIcon aria-hidden className="size-5" />
          </button>
        </form>
      </div>

      {query ? (
        <p className="mt-3 text-sm text-zinc-500">
          “{query}” için {page.total.toLocaleString("tr-TR")} sonuç ·{" "}
          <Link href={`/firma/${companySlug}#urunler`} className="font-medium text-zinc-900 underline underline-offset-2">
            aramayı kaldır
          </Link>
        </p>
      ) : null}

      {page.items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-600">
          Bu firmanın ürünlerinde “{query}” bulunamadı.
        </p>
      ) : (
        <>
          {/* TAM GENİŞLİK, DÖRT SÜTUN (2026-09-07, kullanıcı kararı): ürünler
              artık sağdaki künye sütunuyla yer paylaşmıyor. */}
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {page.items.map((p) => (
              <ProductCard key={p.slug} companySlug={companySlug} product={p} cta="Bilgi iste" />
            ))}
          </div>
          {/* Sayfalama `urunSayfa` ile (sayfanın kendi şeması) — arama terimi
              korunur, yoksa ikinci sayfada süzgeç düşerdi. */}
          <Pagination
            className="mt-8"
            page={page.page}
            total={page.total}
            pageSize={page.pageSize}
            hrefBuilder={(n) => {
              const sp = new URLSearchParams();
              if (query) sp.set("urun", query);
              if (n > 1) sp.set("urunSayfa", String(n));
              const qs = sp.toString();
              return `/firma/${companySlug}${qs ? `?${qs}` : ""}#urunler`;
            }}
          />
        </>
      )}
    </section>
  );
}
