import { setRequestLocale, getTranslations } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import { MARKET_GROUND, PublicLayout } from "@/components/marketplace/public-layout";
import {
  ProductIndex,
  type ProductSearchParams,
} from "@/components/marketplace/product-index";
import {
  MARKETPLACE_ROUTES,
  categoryHref,
  parseCategoryCode,
} from "@/lib/public/marketplace";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { segmentPhotoSrc } from "@/lib/public/category-photos";
import { clampTitle } from "@/lib/seo/entities";
import { canonicalProductListPage, queryStringOf } from "@/lib/seo/landing";
import { buildMetadata } from "@/lib/seo/meta";
import { resolveSegmentLanding } from "./category-data";
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
 * `generateStaticParams` YOK (2026-09-26): sayfa `searchParams` okuduğu için
 * zaten her istekte dinamik üretiliyor; önceden üretim hiçbir şey kazandırmıyor,
 * üstelik KIRILGANDI — derleme anında facet çağrısı geçici hata verince sayfa
 * `searchParams`'a ulaşmadan 404'e düşüp STATİK 404 olarak kaydediliyor, sonraki
 * her yenileme `DYNAMIC_SERVER_USAGE` ile 500 verip sayfayı bir sonraki
 * dağıtıma dek 404'te bırakıyordu (yerel denetimde EN 31000000 böyle kaldı).
 * Veri önbelleği (`fetch` `revalidate` + etiket) aynen çalışır.
 */
export const revalidate = 600;

/* Çözüm `resolveSegmentLanding` (segment listesi + liste ucu `total`ı) —
   facet taraması DEĞİL (5.000 kayıt tavanı; bkz. category-data.ts). Gizli
   segment (katalog sadeleştirme 2026-09-19) meta ve gövdede aynı: "bulunamadı". */

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<ProductSearchParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await localeFromParams(params);
  const code = parseCategoryCode(slug);
  const cat = code ? await resolveSegmentLanding(code) : null;
  // Bilinmeyen/boş kategori: sayfa 404 verir; meta yine şablondan ve noindex.
  const t = await getTranslations({ locale, namespace: "web.marketplace.pages" });
  if (!cat) {
    return buildMetadata({
      title: t("categoryNotFoundTitle"),
      description: t("categoryNotFoundDesc"),
      path: MARKETPLACE_ROUTES.products,
      noindex: true,
      locale,
    });
  }
  const count = cat.count;
  const page = canonicalProductListPage(await searchParams);
  const tui = await getTranslations({ locale, namespace: "web.shared.ui" });
  return buildMetadata({
    // 75 karakter tavanı (canlı denetim 2026-09-11: uzun kategori adı 86'ya
    // taşıyordu) — kuyruk düşer, ad kelime sınırında kısalır.
    title: clampTitle(cat.name, t("categoryTitleTail", { count })),
    description: t("categoryMetaDesc", { name: cat.name, count }),
    path: categoryHref(cat),
    // Sayfalanmış sayfa KENDİ kanoniği (`?sayfa=N`); başka süzgeç → taban.
    page,
    // 2+ sayfa kendi başlık/açıklamasını taşır (arayüz testi D-084).
    pageLabel: tui("pageN", { n: page }),
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
  if (!code) notFound();

  const cat = await resolveSegmentLanding(code);
  // Ürünü olmayan/bilinmeyen kod: sayfa üretmek yerine dizine dönmek doğru —
  // boş kategori sayfası hem ziyaretçiye hem indekse değersiz.
  if (!cat) notFound();

  // Kanonik yola 308: aynı içerik iki adreste yaşarsa (çıplak kod, eski ad)
  // Google ikisini de güvensiz sayar. Yönlendirme sitemap'in ürettiği dizeyle
  // AYNI fonksiyondan gelir — ayrışamazlar.
  const canonical = categoryHref(cat);
  const sp = await searchParams;
  // Bu segmentte `loading.tsx` YOK (2026-09-22 yayın taraması): iskelet
  // akışı başladıktan sonra çağrılan permanentRedirect 308 yerine 200 +
  // boş gövde üretiyordu (kanonik-olmayan slug arama motoruna kopya sayfa).
  // Sorgu KORUNUR (2026-09-27): `?sayfa=2` düşünce 2. sayfa 1. sayfayı açıyordu.
  if (canonical.split("/").pop() !== slug) permanentRedirect({ href: `${canonical}${queryStringOf(sp)}`, locale });

  const tp = await getTranslations("web.marketplace.pages");
  return (
    <PublicLayout className={MARKET_GROUND}>
        <ProductIndex
          title={cat.name}
          lead={tp("categoryLead", { name: cat.name, count: cat.count })}
          searchParams={sp}
          category={{ id: cat.id, name: cat.name, slug: cat.slug }}
          image={segmentPhotoSrc([cat.id])}
        />
    </PublicLayout>
  );
}
