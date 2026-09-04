import { PublicLayout } from "@/components/marketplace/public-layout";
import {
  ProductIndex,
  type ProductSearchParams,
} from "@/components/marketplace/product-index";
import {
  MARKETPLACE_LABELS,
  categoryPath,
  parseCategoryCode,
} from "@/lib/public/marketplace";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { fetchProductFacets } from "@/lib/public/marketplace-api";
import { segmentPhotoSrc } from "@/lib/public/category-photos";
import { resolveSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

/**
 * KATEGORİ SAYFASI — long-tail'in taşıyıcısı.
 *
 * Süzgeç sorgu parametresi değil YOL parçası olduğu için sayfa statik
 * üretilebiliyor (Next 15'te `searchParams` okuyan sayfa dinamiktir) ve her
 * kategori kendi indekslenebilir adresini alıyor.
 *
 * `generateStaticParams` facet listesinden beslenir: yalnız ÜRÜNÜ OLAN
 * kategoriler önceden üretilir. 158 bin kategorinin tamamını üretmek hem
 * build'i şişirir hem de boş sayfa yığını üretirdi — "ince içerik" cezası
 * tam olarak budur. Listede olmayan kategori istenirse sayfa yine çalışır
 * (`dynamicParams` varsayılan açık), yalnız ilk istekte üretilir.
 */
export const revalidate = 600;

export async function generateStaticParams() {
  if (!MARKETPLACE_LIVE) return [];
  const facets = await fetchProductFacets();
  return facets.categories.map((c) => ({
    slug: categoryPath(c.id, c.name).split("/").pop() as string,
  }));
}

/** Koddan kategori adını çözer (facet listesi = ürünü olan kategoriler). */
async function resolveCategory(code: string) {
  const facets = await fetchProductFacets();
  return facets.categories.find((c) => c.id === code) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const code = parseCategoryCode(slug);
  const cat = code ? await resolveCategory(code) : null;
  const name = cat?.name ?? "Ürünler";
  const url = cat
    ? `${resolveSiteUrl()}${categoryPath(cat.id, cat.name)}`
    : `${resolveSiteUrl()}/urunler`;
  return {
    title: `${name} — tedarikçi firmaların ürünleri`,
    description: `${name} kategorisindeki ürünler: teknik özellik, minimum sipariş ve fiyat bilgisiyle tedarikçi firmaların vitrininden.`,
    alternates: { canonical: url },
    openGraph: { title: `${name} — ${MARKETPLACE_LABELS.products}`, url, type: "website" },
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<ProductSearchParams>;
}) {
  if (!MARKETPLACE_LIVE) notFound();
  const { slug } = await params;
  const code = parseCategoryCode(slug);
  if (!code) notFound();

  const cat = await resolveCategory(code);
  // Ürünü olmayan/bilinmeyen kod: sayfa üretmek yerine dizine dönmek doğru —
  // boş kategori sayfası hem ziyaretçiye hem indekse değersiz.
  if (!cat) notFound();

  // Kanonik yola 308: aynı içerik iki adreste yaşarsa (çıplak kod, eski ad)
  // Google ikisini de güvensiz sayar. Yönlendirme sitemap'in ürettiği dizeyle
  // AYNI fonksiyondan gelir — ayrışamazlar.
  const canonical = categoryPath(cat.id, cat.name);
  if (canonical.split("/").pop() !== slug) permanentRedirect(canonical);

  const sp = await searchParams;
  return (
    <PublicLayout>
        <ProductIndex
          title={cat.name}
          lead={`${cat.name} kategorisinde ${cat.count.toLocaleString("tr-TR")} ürün. Firmaların vitrinlerinden; teklif için doğrudan iletişime geçin.`}
          searchParams={sp}
          category={{ id: cat.id, name: cat.name }}
          image={segmentPhotoSrc([cat.id])}
        />
    </PublicLayout>
  );
}
