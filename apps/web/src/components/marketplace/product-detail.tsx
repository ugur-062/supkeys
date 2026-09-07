import { PublicLayout } from "./public-layout";
import { ProductGallery } from "./product-gallery";
import { Badge } from "@/components/catalyst/badge";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Tabs } from "@/components/ui/tabs";
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
import { GatedField } from "./gated-field";
import { RfqBanner } from "./rfq-banner";
import { ProductCard } from "./product-card";
import { companyActivityLabel } from "@rothern/shared";
import { PANEL_TARGET, loginHref, signupHref } from "@/lib/public/visibility";
import { resolveSiteUrl } from "@/lib/site-url";
import {
  ArrowRightIcon,
  CheckBadgeIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
  LockClosedIcon,
  MapPinIcon,
} from "@heroicons/react/20/solid";
import Link from "next/link";

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

      <div className="mx-auto max-w-6xl px-6 pt-28 pb-32 lg:px-8 lg:pb-20">
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
          related={related}
          hrefFor={(c) => `/firma/${c.company.slug}/urun/${c.slug}`}
          mobileCta={
            <Link
              href={loginHref(PANEL_TARGET.product(companySlug, product.slug))}
              className="inline-flex items-center rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Bilgi iste
            </Link>
          }
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
  return <Breadcrumb items={[...trail, { label: current }]} />;
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
  related,
  hrefFor,
  mobileCta,
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
  /** Firma ve Benzer sekmelerinin içeriği; yoksa o sekmeler çizilmez. */
  related?: RelatedProducts;
  /** İlişkili ürün kartının hedefi — public `/firma/…`, panel `/company/…`. */
  hrefFor?: (c: ProductIndexCard) => string;
  /**
   * Mobil alt şeridin eylemi (fiyatın yanında). Verilmezse şerit çizilmez —
   * `cta` slotunu ikinci kez basmak aynı bağlantıyı iki sekme durağı yapardı.
   */
  mobileCta?: React.ReactNode;
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
    <>
      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_23.75rem]">
        <div className="min-w-0">
          <ProductGallery
            images={product.images}
            alt={product.name}
            categoryIds={product.categoryId ? [product.categoryId] : []}
          />

          <Heading
            level={1}
            className="mt-8 text-3xl font-semibold tracking-tight text-balance !text-zinc-950 sm:text-4xl"
          >
            {product.name}
          </Heading>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {company.gold ? <UiBadge tone="gold" size="sm">Gold Üye</UiBadge> : null}
            {isNewProduct(product.publishedAt) ? <UiBadge tone="new" size="sm">Yeni</UiBadge> : null}
            {product.brand ? <Badge color="zinc">{product.brand}</Badge> : null}
            {product.mpn ? <Badge color="zinc">MPN: {product.mpn}</Badge> : null}
          </div>

          {/* Anahtar kelimeler başlığın ALTINDA (Europages): hem uzun kuyruk
              SEO hem "bu ürün ne" özeti. Eskiden sayfanın en altındaydı. */}
          {product.keywords.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {product.keywords.slice(0, 12).map((k) => (
                <li key={k} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600">
                  {k}
                </li>
              ))}
            </ul>
          ) : null}

          {/* SEKMELER — hash ile: #aciklama #ozellikler #firma #benzer.
              Boş sekme çizilmez (Tabs `hidden`). */}
          <Tabs
            className="mt-8"
            hashSync
            panelClassName="pt-6"
            items={[
              {
                id: "aciklama",
                label: "Açıklama",
                hidden: !product.description && !product.specification && !(product.documents ?? []).length,
                content: (
                  <div className="max-w-3xl">
                    {product.description ? (
                      <p className="text-base/7 whitespace-pre-line text-zinc-700">{product.description}</p>
                    ) : null}
                    {product.specification ? (
                      <section className="mt-8">
                        <h3 className="text-sm font-semibold text-zinc-900">Teknik şartname</h3>
                        <p className="mt-2 text-sm/7 whitespace-pre-line text-zinc-600">{product.specification}</p>
                      </section>
                    ) : null}
                    {product.documents && product.documents.length > 0 ? (
                      <section className="mt-8">
                        <h3 className="text-sm font-semibold text-zinc-900">Belgeler</h3>
                        <ul className="mt-3 space-y-2">
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
                  </div>
                ),
              },
              {
                id: "ozellikler",
                label: "Özellikler",
                hidden: attrs.length === 0,
                content: <SpecTable rows={attrs} />,
              },
              {
                id: "firma",
                label: "Firma",
                content: (
                  <div className="space-y-6">
                    {/* Web sitesi satırı YALNIZ sağ panelde — iki yerde
                        aynı kapılı bağlantı tekrar olurdu. */}
                    <SellerSummary company={company} companyHref={companyHref} />
                    {related && related.fromCompany.items.length > 0 && hrefFor ? (
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-900">
                          Bu firmanın diğer ürünleri
                          {related.fromCompany.total > 0 ? ` (${related.fromCompany.total})` : ""}
                        </h3>
                        <ul className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
                          {related.fromCompany.items.slice(0, 3).map((c) => (
                            <li key={`${c.company.slug}/${c.slug}`}>
                              <ProductCard product={c} href={hrefFor(c)} variant="compact" />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ),
              },
              {
                id: "benzer",
                label: "Benzer ürünler",
                hidden: !related || related.similar.length === 0 || !hrefFor,
                content: (
                  <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {(related?.similar ?? []).slice(0, 4).map((c) => (
                      <li key={`${c.company.slug}/${c.slug}`}>
                        <ProductCard
                          product={c}
                          href={hrefFor ? hrefFor(c) : "#"}
                          company={c.company}
                          variant="compact"
                        />
                      </li>
                    ))}
                  </ul>
                ),
              },
            ]}
          />
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
            {priceBox ?? (
              <>
                <p className={`tnum text-2xl font-semibold tracking-tight ${price.hasPrice ? "text-zinc-950" : "text-zinc-600"}`}>
                  {price.headline}
                </p>
                {price.note ? <p className="mt-1 text-xs text-zinc-500">{price.note}</p> : null}
                {price.hasPrice ? <p className="mt-1 text-xs text-zinc-500">KDV hariç</p> : null}
                {product.moq ? (
                  <p className="tnum mt-2 text-sm text-zinc-500">
                    Minimum sipariş: {Number(product.moq).toLocaleString("tr-TR")} {product.unit}
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
                          <td className="tnum py-1.5 text-zinc-700">
                            {t.minQty.toLocaleString("tr-TR")}+ {product.unit}
                          </td>
                          <td className="tnum py-1.5 text-right font-medium text-zinc-950">
                            {t.unitPrice.toLocaleString("tr-TR")} {product.priceCurrency}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </>
            )}

            {/* SATICI — panelin İÇİNDE (Europages): fiyatla eylem arasında
                "kimden alıyorum" sorusu duruyor. */}
            <div className="mt-5 border-t border-zinc-950/5 pt-5">
              <SellerSummary company={company} companyHref={companyHref} sellerSite={sellerSite} compact />
            </div>

            <div className="mt-5 border-t border-zinc-950/5 pt-5">{cta}</div>
          </div>

          {/* Güven şeridi — üç kural, tek satır. */}
          <ul className="mt-4 space-y-2 px-1 text-xs text-zinc-600">
            <li className="flex items-center gap-2">
              <CheckBadgeIcon aria-hidden className="size-4 shrink-0 text-emerald-600" />
              Firmalar vergi levhası ve sicil belgesiyle doğrulanır
            </li>
            <li className="flex items-center gap-2">
              <LockClosedIcon aria-hidden className="size-4 shrink-0 text-zinc-400" />
              Teklifler kapalı zarf — rakipler göremez
            </li>
            <li className="flex items-center gap-2">
              <CurrencyDollarIcon aria-hidden className="size-4 shrink-0 text-zinc-400" />
              Alım-satım bedelinden komisyon alınmaz
            </li>
          </ul>
        </aside>
      </div>

      {/* MOBİL ALT ŞERİT — fiyat + tek eylem. Panel `lg` altında sayfanın
          altına düştüğü için karar ekranı ekrandan çıkıyordu. */}
      {mobileCta ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-950/10 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className={`tnum truncate text-sm font-semibold ${price.hasPrice ? "text-zinc-950" : "text-zinc-600"}`}>
                {price.headline}
              </p>
              {product.moq ? (
                <p className="tnum truncate text-xs text-zinc-500">
                  Min. {Number(product.moq).toLocaleString("tr-TR")} {product.unit}
                </p>
              ) : null}
            </div>
            <div className="shrink-0">{mobileCta}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Yayın tarihi ≤ 7 gün → "Yeni" (kart ailesiyle aynı kural). */
function isNewProduct(publishedAt?: string | null): boolean {
  if (!publishedAt) return false;
  const t = new Date(publishedAt).getTime();
  return Number.isFinite(t) && Date.now() - t <= 7 * 86_400_000;
}

/**
 * NİTELİK TABLOSU — iki sütun, zebra. Kaynak ürünün `attributes` alanı
 * (etiketlenmiş liste); açıklamadan AYRIŞTIRILMAZ — uydurma veri üretirdi.
 */
export function SpecTable({ rows }: { rows: { key: string; label: string; value: string; unit: string | null }[] }) {
  return (
    <dl className="divide-y divide-zinc-950/5 overflow-hidden rounded-2xl ring-1 ring-zinc-950/5">
      {rows.map((a, i) => (
        <div
          key={a.key}
          className={`px-5 py-3.5 sm:grid sm:grid-cols-3 sm:gap-4 ${i % 2 === 0 ? "bg-zinc-50" : "bg-white"}`}
        >
          <dt className="text-sm/6 font-medium text-zinc-900">{a.label}</dt>
          <dd className="mt-1 text-sm/6 text-zinc-600 sm:col-span-2 sm:mt-0">
            {a.unit ? `${a.value} ${a.unit}` : a.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * SATICI ÖZETİ — panelde (compact) ve Firma sekmesinde (geniş) AYNI bileşen.
 * Kimlik değil NİTELİK gösterilir: paket rozeti, faaliyet, sertifika,
 * kuruluş yılı, çalışan aralığı. İletişim bilgisi üyeye (GatedField).
 */
function SellerSummary({
  company,
  companyHref,
  sellerSite,
  compact = false,
}: {
  company: PublicProductCompany;
  companyHref: string;
  sellerSite?: React.ReactNode;
  compact?: boolean;
}) {
  const certs = (company.certifications ?? []).slice(0, compact ? 2 : 4);
  const facts = [
    company.foundedYear ? `Kuruluş ${company.foundedYear}` : null,
    company.employeeCount ? `${company.employeeCount} çalışan` : null,
  ].filter(Boolean) as string[];

  return (
    <div>
      <div className="flex items-start gap-3">
        <Avatar name={company.name} src={company.logoUrl} size={48} />
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1.5">
            <Link href={companyHref} className="truncate text-sm font-semibold text-zinc-950 hover:text-zinc-600">
              {company.name}
            </Link>
            {company.verified ? (
              <UiBadge tone="verified" size="sm" className="px-1">
                <span className="sr-only">Doğrulanmış firma</span>
              </UiBadge>
            ) : null}
            {company.gold ? (
              <UiBadge tone="gold" size="sm" className="px-1">
                <span className="sr-only">Gold Üye</span>
              </UiBadge>
            ) : null}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
            {company.industry ? <span className="line-clamp-1">{company.industry}</span> : null}
            {company.city ? (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon aria-hidden className="size-3.5 text-zinc-300" />
                {company.city}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {company.activities.length > 0 || certs.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {company.activities.slice(0, 3).map((a) => (
            <UiBadge key={a} tone="neutral" size="sm">
              {companyActivityLabel(a)}
            </UiBadge>
          ))}
          {certs.map((c) => (
            <UiBadge key={c} tone="neutral" size="sm" className="bg-white ring-1 ring-inset ring-zinc-950/10">
              {c}
            </UiBadge>
          ))}
        </div>
      ) : null}

      {facts.length > 0 ? <p className="tnum mt-2 text-xs text-zinc-500">{facts.join(" · ")}</p> : null}

      {/* Web sitesi / dış bağlantı ÜYEYE (görünürlük v2). */}
      {sellerSite ? <div className="mt-3">{sellerSite}</div> : null}
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
  hrefFor,
}: {
  related: RelatedProducts;
  categoryName: string | null;
  hrefFor: (c: ProductIndexCard) => string;
}) {
  // "Firmanın diğerleri" ve "Benzer ürünler" PROMPT 7'de SEKMELERE taşındı
  // (Firma · Benzer ürünler); burada yalnız keşif satırı kalır — aynı listeyi
  // hem sekmede hem satırda basmak sayfayı iki kez uzatıyordu.
  return (
    <RelatedRow
      heading={categoryName ? `${categoryName} içinde yeni` : "Kategoride yeni"}
      items={related.popular}
      hrefFor={hrefFor}
    />
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
      <ul className="-mx-6 mt-5 flex snap-x scroll-pl-6 gap-4 overflow-x-auto px-6 pb-2 lg:-mx-8 lg:scroll-pl-8 lg:px-8 [scrollbar-width:thin]">
        {items.map((p) => (
          <li key={`${p.company.slug}/${p.slug}`} className="w-60 shrink-0 snap-start">
            <ProductCard
              product={p}
              href={hrefFor(p)}
              company={p.company}
              variant="compact"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
