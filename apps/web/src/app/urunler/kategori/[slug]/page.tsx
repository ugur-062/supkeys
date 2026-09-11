import { MARKET_GROUND, PublicLayout } from "@/components/marketplace/public-layout";
import {
  ProductIndex,
  type ProductSearchParams,
} from "@/components/marketplace/product-index";
import {
  MARKETPLACE_ROUTES,
  categoryPath,
  parseCategoryCode,
} from "@/lib/public/marketplace";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { fetchProductFacets } from "@/lib/public/marketplace-api";
import { segmentPhotoSrc } from "@/lib/public/category-photos";
import { clampTitle } from "@/lib/seo/entities";
import { buildMetadata } from "@/lib/seo/meta";
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
  // Bilinmeyen/boş kategori: sayfa 404 verir; meta yine şablondan ve noindex.
  if (!cat) {
    return buildMetadata({
      title: "Kategori bulunamadı",
      description: "Bu kategoride yayımlanmış ürün yok. Ürün dizininden diğer kategorilere göz atın.",
      path: MARKETPLACE_ROUTES.products,
      noindex: true,
    });
  }
  const count = cat.count.toLocaleString("tr-TR");
  return buildMetadata({
    // 75 karakter tavanı (canlı denetim 2026-09-11: uzun kategori adı 86'ya
    // taşıyordu) — kuyruk düşer, ad kelime sınırında kısalır.
    title: clampTitle(cat.name, `${count} ürün`),
    description: `${cat.name} kategorisinde ${count} ürün: teknik özellik, minimum sipariş ve fiyat bilgisiyle tedarikçi firmaların vitrininden. Firmayı seçin, doğrudan bilgi isteyin.`,
    path: categoryPath(cat.id, cat.name),
    images: segmentPhotoSrc([cat.id]) ? [segmentPhotoSrc([cat.id]) as string] : undefined,
  });
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
    <PublicLayout className={MARKET_GROUND}>
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
