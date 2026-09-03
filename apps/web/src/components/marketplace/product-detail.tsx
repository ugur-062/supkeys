import { PublicLayout } from "./public-layout";
import { CategoryImage } from "./category-image";
import { GatedField } from "./gated-field";
import { InquiryButton } from "./inquiry-button";
import { Badge } from "@/components/catalyst/badge";
import { Heading } from "@/components/catalyst/heading";
import { serializeJsonLd } from "@/lib/json-ld";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { productPrice } from "@/lib/public/product-price";
import type {
  ProductPriceFields,
  PublicProduct,
  PublicProductCompany,
} from "@/lib/public/marketplace-api";
import { PANEL_TARGET } from "@/lib/public/visibility";
import { resolveSiteUrl } from "@/lib/site-url";
import {
  ArrowTopRightOnSquareIcon,
  BuildingOffice2Icon,
  DocumentTextIcon,
  MapPinIcon,
} from "@heroicons/react/20/solid";
import Link from "next/link";
import { Fragment } from "react";

/**
 * Ürün sayfası — SUNUCU bileşeni.
 *
 * İlan sayfasından İKİ temel farkı var ve ikisi de bilinçli:
 *  1. Firma ADIYLA görünür. Ürün, firmanın kendi opt-in vitrini; ilan ise
 *     işlem ve orada sahip anonim.
 *  2. `Product` + `Offer` JSON-LD var. Europages'in ürün sayfalarında
 *     yapısal veri YOK — zengin sonuçta doğrudan avantaj.
 */
export function ProductDetail({
  product,
  company,
  companySlug,
}: {
  product: PublicProduct;
  company: PublicProductCompany;
  companySlug: string;
}) {
  const site = resolveSiteUrl();
  const url = `${site}/firma/${companySlug}/urun/${product.slug}`;
  // Etiketlenmiş liste — ham anahtarlar değil (bkz. marketplace-api.ts).
  const attrs = product.attributeList ?? [];

  /**
   * `Offer` FİYATSIZ (görünürlük katmanı, 2026-09-04): fiyat anonim
   * ziyaretçiye gösterilmiyor, dolayısıyla yapısal veriye de yazılmaz —
   * sayfada görünmeyen bir fiyatı makine-okunur vermek hem gizlemeyi boşa
   * çıkarır hem "sayfa ile veri uyuşmuyor" cezasına girer.
   */
  const offer: Record<string, unknown> = {
    "@type": "Offer",
    url,
    availability: "https://schema.org/InStock",
    seller: {
      "@type": "Organization",
      name: company.name,
      ...(company.slug ? { url: `${site}/firma/${company.slug}` } : {}),
    },
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    url,
    ...(product.description ? { description: product.description } : {}),
    ...(product.images.length > 0 ? { image: product.images } : {}),
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
    ...(product.mpn ? { mpn: product.mpn } : {}),
    ...(attrs.length > 0
      ? {
          additionalProperty: attrs.map((a) => ({
            "@type": "PropertyValue",
            name: a.label,
            value: a.unit ? `${a.value} ${a.unit}` : a.value,
          })),
        }
      : {}),
    offers: offer,
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Anasayfa", item: `${site}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: company.name,
        item: `${site}/firma/${companySlug}`,
      },
      { "@type": "ListItem", position: 3, name: product.name, item: url },
    ],
  };

  return (
    <PublicLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }}
      />

      <div className="mx-auto max-w-6xl px-6 pt-28 pb-20 lg:px-8">
        <ProductBreadcrumb
          trail={[
            { label: "Anasayfa", href: "/" },
            { label: company.name, href: `/firma/${companySlug}` },
          ]}
          current={product.name}
        />

        <ProductDetailBody
          product={product}
          company={company}
          companyHref={`/firma/${companySlug}`}
          priceBox={
            product.priceMode === "ON_REQUEST" ? (
              <p className="text-2xl font-semibold tracking-tight text-zinc-600">
                Fiyat için teklif isteyin
              </p>
            ) : (
              <GatedField
                label="Fiyat ve minimum sipariş"
                size="box"
                hint="Birim fiyat, kademeli fiyat tablosu ve MOQ kayıtlı firmalara açıktır."
                redirect={PANEL_TARGET.product(companySlug, product.slug)}
              />
            )
          }
          cta={
            MARKETPLACE_LIVE ? (
              <>
                {/* Hesap SORMUYOR — misafir talebi. Kayıt yanıtı okumak için
                    gerekiyor; kullanıcı o noktada zaten emek vermiş olur. */}
                <InquiryButton
                  companySlug={companySlug}
                  productSlug={product.slug}
                  productName={product.name}
                  companyName={company.name}
                />
                <p className="mt-2 text-center text-xs text-zinc-500">
                  Hesabınız var mı?{" "}
                  <Link
                    href="/company/login"
                    className="font-medium text-zinc-700 hover:underline"
                  >
                    Giriş yapın
                  </Link>
                </p>
              </>
            ) : (
              <>
                {/* Pazar yeri anahtarı KAPALIYKEN misafir talebi ucu 404 döner
                    (`MarketplaceLiveGuard`). Ürün sayfası ise açık — görünürlük
                    ≠ indekslenme. Düğmeyi bırakmak, tıklayınca hata veren bir
                    kutu göstermek olurdu: kullanıcı mesajını yazıyor,
                    "gönder"de patlıyor. Anahtar açılınca üstteki dal döner. */}
                <Link
                  href="/company/login"
                  className="block w-full rounded-full bg-zinc-950 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-zinc-800"
                >
                  Giriş yapıp talep gönderin
                </Link>
                <p className="mt-2 text-center text-xs text-zinc-500">
                  Hesabınız yok mu?{" "}
                  <Link
                    href="/company/kayit"
                    className="font-medium text-zinc-700 hover:underline"
                  >
                    Ücretsiz kaydolun
                  </Link>
                </p>
              </>
            )
          }
        />
      </div>
    </PublicLayout>
  );
}


/* ------------------------------------------------------------------ */

/**
 * Yol (breadcrumb) — public sayfada `Anasayfa > Firma > Ürün`, panelde
 * `Ürün Ara > Firma > Ürün`. Tek bileşen: iki yüzeyde iki ayrı işaretleme
 * yazsaydık biri güncellenir diğeri unutulurdu.
 */
export function ProductBreadcrumb({
  trail,
  current,
}: {
  trail: { label: string; href: string }[];
  current: string;
}) {
  return (
    <nav aria-label="Yol" className="text-sm text-zinc-500">
      <ol className="flex flex-wrap items-center gap-1">
        {trail.map((t) => (
          <Fragment key={t.href}>
            <li>
              <Link href={t.href} className="hover:text-zinc-900">
                {t.label}
              </Link>
            </li>
            <li aria-hidden>/</li>
          </Fragment>
        ))}
        <li className="line-clamp-1 text-zinc-900">{current}</li>
      </ol>
    </nav>
  );
}

/**
 * Ürün sayfasının GÖVDESİ — herkese açık pazar yeri sayfası ve PANEL içi ürün
 * sayfası bunu paylaşır.
 *
 * Neden paylaşılıyor: panel kartı eskiden doğrudan `/firma/<slug>/urun/<slug>`
 * adresine gidiyordu; o layout oturumu okumadığı için giriş yapmış kullanıcı
 * sol menüyü kaybedip "Giriş Yap / Kaydol" duvarına çarpıyordu. İçeriği
 * kopyalamak yerine kabuk (header/footer/JSON-LD) ve eylem (CTA) dışarıdan
 * veriliyor — ürün gövdesi tek yerde kalıyor.
 *
 * SUNUCU bileşeni: `cta` bir slot olduğu için panel tarafı oraya istemci
 * bileşeni geçebilir.
 */
export function ProductDetailBody({
  product,
  company,
  companyHref,
  cta,
  priceBox,
}: {
  /** Panel fiyatlı (üye katmanı), public fiyatsız — ikisi de aynı gövde. */
  product: PublicProduct & Partial<ProductPriceFields>;
  company: PublicProductCompany;
  /** Satıcı kartındaki bağlantı — public profil ya da panel firma sayfası. */
  companyHref: string;
  cta: React.ReactNode;
  /**
   * Fiyat kutusunun YERİNE basılacak içerik (herkese açık sayfada
   * `GatedField`). Verilmezse fiyat/MOQ/kademe tablosu çizilir (panel).
   */
  priceBox?: React.ReactNode;
}) {
  const price = productPrice({
    priceMode: product.priceMode,
    priceAmount: product.priceAmount ?? null,
    priceTiers: product.priceTiers ?? null,
    priceCurrency: product.priceCurrency ?? "TRY",
    unit: product.unit,
  });
  // Etiketlenmiş liste — ham anahtarlar değil (bkz. marketplace-api.ts).
  const attrs = product.attributeList ?? [];

  return (
        <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_20rem]">
          <div>
            {/* Galeri: ilk görsel büyük, kalanlar şerit. Görsel yayın kapısında
                zorunlu, yine de kategori görseline düşen bir yedek var. */}
            <CategoryImage
              src={product.images[0]}
              categoryIds={product.categoryId ? [product.categoryId] : []}
              alt={product.name}
              ratio="aspect-[16/10]"
              className="rounded-2xl ring-1 ring-zinc-950/5"
            />
            {product.images.length > 1 ? (
              <ul className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-6">
                {product.images.slice(1, 7).map((src) => (
                  <li key={src}>
                    <CategoryImage
                      src={src}
                      alt=""
                      ratio="aspect-square"
                      className="rounded-lg ring-1 ring-zinc-950/5"
                    />
                  </li>
                ))}
              </ul>
            ) : null}

            <Heading
              level={1}
              className="mt-8 text-3xl font-semibold tracking-tight text-balance !text-zinc-950 sm:text-4xl"
            >
              {product.name}
            </Heading>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {product.brand ? <Badge color="zinc">{product.brand}</Badge> : null}
              {product.mpn ? <Badge color="zinc">MPN: {product.mpn}</Badge> : null}
            </div>

            {product.description ? (
              <section className="mt-8">
                <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                  Bu ürün hakkında
                </h2>
                <p className="mt-3 text-base/7 whitespace-pre-line text-zinc-700">
                  {product.description}
                </p>
              </section>
            ) : null}

            {attrs.length > 0 ? (
              <section className="mt-10">
                <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                  Ürün özellikleri
                </h2>
                {/* Application UI — Description lists / "left-aligned striped" */}
                <dl className="mt-4 divide-y divide-zinc-950/5 overflow-hidden rounded-2xl ring-1 ring-zinc-950/5">
                  {attrs.map((a, i) => (
                    <div
                      key={a.key}
                      className={`px-5 py-4 sm:grid sm:grid-cols-3 sm:gap-4 ${
                        i % 2 === 0 ? "bg-zinc-50" : "bg-white"
                      }`}
                    >
                      <dt className="text-sm/6 font-medium text-zinc-900">
                        {a.label}
                      </dt>
                      <dd className="mt-1 text-sm/6 text-zinc-600 sm:col-span-2 sm:mt-0">
                        {a.unit ? `${a.value} ${a.unit}` : a.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            {product.specification ? (
              <section className="mt-10">
                <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                  Teknik şartname
                </h2>
                <p className="mt-3 text-sm/7 whitespace-pre-line text-zinc-600">
                  {product.specification}
                </p>
              </section>
            ) : null}

            {product.documents && product.documents.length > 0 ? (
              <section className="mt-10">
                <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                  Belgeler
                </h2>
                <ul className="mt-4 space-y-2">
                  {product.documents.map((d) => (
                    <li key={d.url}>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-900 hover:text-zinc-600"
                      >
                        <DocumentTextIcon aria-hidden className="size-4 text-zinc-400" />
                        {d.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Anahtar kelimeler GÖRÜNÜR bir bölüm — hem uzun kuyruk SEO hem
                site içi arama. Europages'te de böyle. */}
            {product.keywords.length > 0 ? (
              <section className="mt-10 border-t border-zinc-950/5 pt-6">
                <h2 className="text-sm font-semibold text-zinc-900">
                  Anahtar kelimeler
                </h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {product.keywords.map((k) => (
                    <li
                      key={k}
                      className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600"
                    >
                      {k}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
              {priceBox ?? (
              <>
              <p
                className={`text-2xl font-semibold tracking-tight ${
                  price.hasPrice ? "text-zinc-950" : "text-zinc-600"
                }`}
              >
                {price.headline}
              </p>
              {price.note ? (
                <p className="mt-1 text-xs text-zinc-500">{price.note}</p>
              ) : null}
              {product.moq ? (
                <p className="mt-2 text-sm text-zinc-500">
                  Minimum sipariş:{" "}
                  {Number(product.moq).toLocaleString("tr-TR")} {product.unit}
                </p>
              ) : null}

              {price.tiers ? (
                <table className="mt-4 w-full text-left text-sm">
                  <thead className="text-xs text-zinc-500 uppercase">
                    <tr>
                      <th className="pb-1 font-medium">Miktar</th>
                      <th className="pb-1 text-right font-medium">Birim fiyat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-950/5">
                    {price.tiers.map((t) => (
                      <tr key={t.minQty}>
                        <td className="py-1.5 text-zinc-700">
                          {t.minQty.toLocaleString("tr-TR")}+ {product.unit}
                        </td>
                        <td className="py-1.5 text-right font-medium text-zinc-950">
                          {t.unitPrice.toLocaleString("tr-TR")} {product.priceCurrency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              </>
              )}

              <div className="mt-5 border-t border-zinc-950/5 pt-5">{cta}</div>
            </div>

            <div className="mt-6 rounded-2xl bg-zinc-50 p-5 ring-1 ring-zinc-950/5">
              <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                Satıcı
              </h2>
              <div className="mt-3 flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-zinc-950/5">
                  <BuildingOffice2Icon aria-hidden className="size-5 text-zinc-400" />
                </span>
                <div className="min-w-0">
                  <Link
                    href={companyHref}
                    className="text-sm font-semibold text-zinc-950 hover:text-zinc-600"
                  >
                    {company.name}
                  </Link>
                  {company.industry ? (
                    <p className="mt-0.5 text-xs text-zinc-500">{company.industry}</p>
                  ) : null}
                  {company.city ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                      <MapPinIcon aria-hidden className="size-3.5" />
                      {company.city}
                    </p>
                  ) : null}
                </div>
              </div>
              {product.externalUrl ? (
                <a
                  href={product.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-zinc-700 hover:text-zinc-950"
                >
                  Üreticinin ürün sayfası
                  <ArrowTopRightOnSquareIcon aria-hidden className="size-3.5" />
                </a>
              ) : null}
            </div>
          </aside>
    </div>
  );
}
