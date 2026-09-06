import { PublicLayout } from "./public-layout";
import { CategoryImage } from "./category-image";
import { Badge } from "@/components/catalyst/badge";
import { Heading } from "@/components/catalyst/heading";
import { serializeJsonLd } from "@/lib/json-ld";
import { productPrice } from "@/lib/public/product-price";
import type {
  ProductIndexCard,
  ProductPriceFields,
  PublicProduct,
  PublicProductCompany,
  RelatedProducts,
} from "@/lib/public/marketplace-api";
import { categoryPath } from "@/lib/public/marketplace";
import { CompanyLogo } from "@/components/company/company-logo";
import { GatedField } from "./gated-field";
import { RfqBanner } from "./rfq-banner";
import { ProductCard } from "./product-card";
import { companyActivityLabel } from "@rothern/shared";
import { PANEL_TARGET, loginHref, signupHref } from "@/lib/public/visibility";
import { resolveSiteUrl } from "@/lib/site-url";
import {
  ArrowRightIcon,
  CheckBadgeIcon,
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
  related = { fromCompany: { items: [], total: 0 }, similar: [], popular: [] },
}: {
  product: PublicProduct;
  company: PublicProductCompany;
  companySlug: string;
  related?: RelatedProducts;
}) {
  const site = resolveSiteUrl();
  const url = `${site}/firma/${companySlug}/urun/${product.slug}`;
  // Etiketlenmiş liste — ham anahtarlar değil (bkz. marketplace-api.ts).
  const attrs = product.attributeList ?? [];

  const price = productPrice(product);
  /**
   * `offers` yalnız GERÇEK fiyat varken fiyat taşır (v2: fiyat herkese açık).
   * "Teklif isteyin"de uydurma fiyat yazılmaz — yapısal veri sayfayı söyler.
   */
  const offer: Record<string, unknown> = {
    "@type": "Offer",
    url,
    availability: "https://schema.org/InStock",
    priceCurrency: product.priceCurrency,
    ...(price.hasPrice && product.priceMode === "FIXED" && product.priceAmount
      ? { price: product.priceAmount }
      : {}),
    ...(price.hasPrice && product.priceMode === "TIERED" && product.priceTiers
      ? {
          priceSpecification: product.priceTiers.map((t) => ({
            "@type": "UnitPriceSpecification",
            price: t.unitPrice,
            priceCurrency: product.priceCurrency,
            eligibleQuantity: { "@type": "QuantitativeValue", minValue: t.minQty, unitText: product.unit },
          })),
        }
      : {}),
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
            ...(product.category
              ? [{ label: product.category.name, href: categoryPath(product.category.id, product.category.name) }]
              : []),
            { label: company.name, href: `/firma/${companySlug}` },
          ]}
          current={product.name}
        />

        <ProductDetailBody
          product={product}
          company={company}
          companyHref={`/firma/${companySlug}`}
          sellerSite={
            <GatedField label="Firmanın web sitesi" redirect={PANEL_TARGET.product(companySlug, product.slug)} />
          }
          cta={
            <>
              {/* "Bilgi iste" ÜYEYE (görünürlük v2): giriş sonrası panelin
                  ürün sayfasına döner, oradaki form kimlik sormaz. Misafir
                  formu kalktı — kimlik zaten oturumdan geliyor. */}
              {company.freeMember ? (
                <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs/5 text-amber-900 ring-1 ring-amber-600/20">
                  Bu tedarikçi ücretsiz üye: sorunuzu görür, yanıt için Silver paketine
                  geçmesi gerekir. Doğrulanmış tedarikçilerin benzer ürünleri aşağıda.
                </p>
              ) : null}
              <Link
                href={loginHref(PANEL_TARGET.product(companySlug, product.slug))}
                className="block w-full rounded-full bg-zinc-950 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                Bilgi iste
              </Link>
              <p className="mt-2 text-center text-xs text-zinc-500">
                Hesabınız yok mu?{" "}
                <Link
                  href={signupHref("teklif", PANEL_TARGET.product(companySlug, product.slug))}
                  className="font-medium text-zinc-700 hover:underline"
                >
                  Ücretsiz kaydolun
                </Link>{" "}
                · 2 dakika, kredi kartı yok
              </p>
            </>
          }
        />

        {/* İLİŞKİLİ BLOKLAR (Europages) — panel aynı bileşeni panel adresleriyle kullanır. */}
        <RelatedRows
          related={related}
          categoryName={product.category?.name ?? null}
          companyHref={`/firma/${companySlug}#urunler`}
          hrefFor={(c) => `/firma/${c.company.slug}/urun/${c.slug}`}
        />
      </div>
      <RfqBanner prefill={product.name} />
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
  sellerSite,
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
  /** "Firmanın web sitesi" satırı — public sayfada kapılı, panelde gerçek bağlantı. */
  sellerSite?: React.ReactNode;
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
              {price.hasPrice ? <p className="mt-1 text-xs text-zinc-500">KDV hariç</p> : null}

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
                <CompanyLogo
                  src={company.logoUrl}
                  alt=""
                  className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-zinc-950/5"
                  fallback={
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-zinc-950/5">
                      <BuildingOffice2Icon aria-hidden className="size-5 text-zinc-400" />
                    </span>
                  }
                />
                <div className="min-w-0">
                  <Link
                    href={companyHref}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-950 hover:text-zinc-600"
                  >
                    {company.name}
                    {company.verified ? (
                      <CheckBadgeIcon aria-label="Doğrulanmış firma" className="size-4 text-emerald-600" />
                    ) : null}
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
                  {company.activities.length > 0 ? (
                    <p className="mt-2 flex flex-wrap gap-1">
                      {company.activities.slice(0, 3).map((a) => (
                        <span key={a} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600 ring-1 ring-zinc-950/5">
                          {companyActivityLabel(a)}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </div>
              </div>
              {/* Web sitesi / dış bağlantı ÜYEYE (görünürlük v2) — varlığı
                  söylenir, tıklaması giriş ister. */}
              {product.externalUrl || sellerSite ? (
                <div className="mt-4">{sellerSite ?? null}</div>
              ) : null}
            </div>
          </aside>
    </div>
  );
}


/**
 * İLİŞKİLİ BLOKLAR — firmanın diğerleri · benzer ürünler · kategoride yeni.
 * Public sayfa ve PANEL aynı bileşen; yalnız bağlantı hedefi (`hrefFor`)
 * değişir. Görüntülenme verisi yok → "popüler" değil "kategoride yeni".
 */
export function RelatedRows({
  related,
  categoryName,
  companyHref,
  hrefFor,
}: {
  related: RelatedProducts;
  categoryName: string | null;
  companyHref: string;
  hrefFor: (c: ProductIndexCard) => string;
}) {
  return (
    <>
      <RelatedRow
        heading={`Bu firmanın diğer ürünleri${related.fromCompany.total > 0 ? ` (${related.fromCompany.total})` : ""}`}
        items={related.fromCompany.items}
        href={companyHref}
        hrefLabel="Tümünü gör"
        hrefFor={hrefFor}
      />
      <RelatedRow heading="Benzer ürünler" items={related.similar} hrefFor={hrefFor} />
      <RelatedRow heading={categoryName ? `${categoryName} içinde yeni` : "Kategoride yeni"} items={related.popular} hrefFor={hrefFor} />
    </>
  );
}

/** Yatay ilişkili ürün satırı — boşsa çizilmez. */
function RelatedRow({
  heading,
  items,
  href,
  hrefLabel,
  hrefFor,
}: {
  heading: string;
  items: ProductIndexCard[];
  href?: string;
  hrefLabel?: string;
  hrefFor: (c: ProductIndexCard) => string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-14">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-950">{heading}</h2>
        {href ? (
          <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600">
            {hrefLabel}
            <ArrowRightIcon aria-hidden className="size-4" />
          </Link>
        ) : null}
      </div>
      <ul className="-mx-6 mt-5 flex snap-x gap-4 overflow-x-auto px-6 pb-2 lg:-mx-8 lg:px-8 [scrollbar-width:thin]">
        {items.map((p) => (
          <li key={`${p.company.slug}/${p.slug}`} className="w-60 shrink-0 snap-start">
            <ProductCard
              product={p}
              href={hrefFor(p)}
              company={{ name: p.company.name, city: p.company.city, verified: p.company.verified, activities: p.company.activities }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
