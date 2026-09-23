import { setRequestLocale, getTranslations, getFormatter } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import { MARKET_GROUND, PublicLayout } from "@/components/marketplace/public-layout";
import { isHiddenCategory } from "@rothern/shared";
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
import { notFound } from "next/navigation";
import { permanentRedirect } from "@/i18n/navigation";

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
  // Gizli segment (katalog sadeleştirme 2026-09-19): meta ve gövde AYNI
  // kararı versin — facet'ten gelse bile "bulunamadı".
  if (isHiddenCategory(code)) return null;
  const facets = await fetchProductFacets();
  return facets.categories.find((c) => c.id === code) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await localeFromParams(params);
  const code = parseCategoryCode(slug);
  const cat = code ? await resolveCategory(code) : null;
  // Bilinmeyen/boş kategori: sayfa 404 verir; meta yine şablondan ve noindex.
  const t = await getTranslations({ locale, namespace: "web.marketplace.pages" });
  const fmt = await getFormatter({ locale });
  if (!cat) {
    return buildMetadata({
      title: t("categoryNotFoundTitle"),
      description: t("categoryNotFoundDesc"),
      path: MARKETPLACE_ROUTES.products,
      noindex: true,
      locale,
    });
  }
  const count = fmt.number(cat.count);
  return buildMetadata({
    // 75 karakter tavanı (canlı denetim 2026-09-11: uzun kategori adı 86'ya
    // taşıyordu) — kuyruk düşer, ad kelime sınırında kısalır.
    title: clampTitle(cat.name, t("categoryTitleTail", { count })),
    description: t("categoryMetaDesc", { name: cat.name, count }),
    path: categoryPath(cat.id, cat.name),
    images: segmentPhotoSrc([cat.id]) ? [segmentPhotoSrc([cat.id]) as string] : undefined,
    locale,
  });
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<ProductSearchParams>;
}) {
  setRequestLocale(await localeFromParams(params));
  if (!MARKETPLACE_LIVE) notFound();
  const { slug } = await params;
  const locale = await localeFromParams(params);
  const code = parseCategoryCode(slug);
  if (!code || isHiddenCategory(code)) notFound();

  const cat = await resolveCategory(code);
  // Ürünü olmayan/bilinmeyen kod: sayfa üretmek yerine dizine dönmek doğru —
  // boş kategori sayfası hem ziyaretçiye hem indekse değersiz.
  if (!cat) notFound();

  // Kanonik yola 308: aynı içerik iki adreste yaşarsa (çıplak kod, eski ad)
  // Google ikisini de güvensiz sayar. Yönlendirme sitemap'in ürettiği dizeyle
  // AYNI fonksiyondan gelir — ayrışamazlar.
  const canonical = categoryPath(cat.id, cat.name);
  // Bu segmentte `loading.tsx` YOK (2026-09-22 yayın taraması): iskelet
  // akışı başladıktan sonra çağrılan permanentRedirect 308 yerine 200 +
  // boş gövde üretiyordu (kanonik-olmayan slug arama motoruna kopya sayfa).
  if (canonical.split("/").pop() !== slug) permanentRedirect({ href: canonical, locale });

  const sp = await searchParams;
  const tp = await getTranslations("web.marketplace.pages");
  const fmtp = await getFormatter();
  return (
    <PublicLayout className={MARKET_GROUND}>
        <ProductIndex
          title={cat.name}
          lead={tp("categoryLead", { name: cat.name, count: fmtp.number(cat.count) })}
          searchParams={sp}
          category={{ id: cat.id, name: cat.name }}
          image={segmentPhotoSrc([cat.id])}
        />
    </PublicLayout>
  );
}
