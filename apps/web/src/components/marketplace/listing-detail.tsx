import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketplaceFooter } from "./marketplace-footer";
import { formatDate } from "@/lib/format-date";
import { serializeJsonLd } from "@/lib/json-ld";
import {
  MARKETPLACE_LABELS,
  MARKETPLACE_ROUTES,
  STATE_LABEL,
  listingPath,
  publicState,
} from "@/lib/public/marketplace";
import type { PublicListingDetail } from "@/lib/public/marketplace-api";
import { resolveSiteUrl } from "@/lib/site-url";
import {
  DELIVERY_TERM_LABELS,
  PAYMENT_CATEGORY_LABELS,
  currencySymbol,
} from "@/lib/tenders/labels";
import type { DeliveryTerm, PaymentCategory } from "@/lib/tenders/types";
import {
  ArrowRightIcon,
  BuildingOffice2Icon,
  GlobeAltIcon,
  LockClosedIcon,
  MapPinIcon,
} from "@heroicons/react/20/solid";
import Link from "next/link";

const STATE_CLASS: Record<string, string> = {
  open: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  evaluating: "bg-amber-50 text-amber-700 ring-amber-600/20",
  closed: "bg-zinc-100 text-zinc-600 ring-zinc-500/20",
};

/**
 * Tekil ilan sayfası — SUNUCU bileşeni, ALIM ve SATIS ortak.
 *
 * İki tip aynı gövdeyi paylaşır çünkü ziyaretçi için fark yalnız yön (kim
 * alıyor / kim satıyor) ve JSON-LD tipi. Ayrı iki bileşen yazmak, aynı
 * alanları iki yerde güncelleme borcu üretirdi.
 */
export function ListingDetail({ listing }: { listing: PublicListingDetail }) {
  const state = publicState(listing.status);
  const isDemand = listing.type === "ALIM";
  const site = resolveSiteUrl();
  const canonical = `${site}${listingPath(listing.type, listing.number, listing.title)}`;
  const indexBase = isDemand
    ? MARKETPLACE_ROUTES.demands
    : MARKETPLACE_ROUTES.offers;
  const indexLabel = isDemand
    ? MARKETPLACE_LABELS.demands
    : MARKETPLACE_LABELS.offers;

  /**
   * JSON-LD — alım talebi `Demand`, satış ilanı `Offer` olarak işaretlenir.
   * `Offer`da fiyat YALNIZ `buyNowPrice` varsa yazılır: taban fiyat public
   * yanıtta yok (pazarlık tabanı, bkz. projeksiyon) ve olmayan bir fiyatı
   * uydurmak yapısal veriyi yalancı yapar — o da manuel cezaya götürür.
   *
   * `validThrough` = son teklif tarihi. Süresi geçmiş kayıtta sayfa zaten
   * `noindex` alıyor; yine de yazıyoruz ki bir şekilde indekslenirse arama
   * motoru süresinin dolduğunu VERİDEN görebilsin.
   */
  const offerOrDemand: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": isDemand ? "Demand" : "Offer",
    name: listing.title,
    url: canonical,
    identifier: listing.number,
    ...(listing.description ? { description: listing.description } : {}),
    ...(listing.closesAt ? { validThrough: listing.closesAt } : {}),
    availability:
      state === "open"
        ? "https://schema.org/InStock"
        : "https://schema.org/Discontinued",
    seller: undefined,
    ...(isDemand
      ? {
          seeks: {
            "@type": "Product",
            name: listing.items[0]?.name ?? listing.title,
          },
        }
      : {}),
    ...(!isDemand && listing.buyNowPrice
      ? {
          price: listing.buyNowPrice,
          priceCurrency: listing.primaryCurrency,
        }
      : {}),
    [isDemand ? "buyer" : "offeredBy"]: {
      "@type": "Organization",
      name: listing.company.name,
      ...(listing.company.slug
        ? { url: `${site}/firma/${listing.company.slug}` }
        : {}),
      ...(listing.company.city
        ? {
            address: {
              "@type": "PostalAddress",
              addressLocality: listing.company.city,
              addressCountry: listing.company.country ?? "TR",
            },
          }
        : {}),
    },
  };
  delete offerOrDemand.seller;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Anasayfa", item: `${site}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: indexLabel,
        item: `${site}${indexBase}`,
      },
      { "@type": "ListItem", position: 3, name: listing.title, item: canonical },
    ],
  };

  const facts: { label: string; value: string }[] = [
    { label: "İlan numarası", value: listing.number },
    ...(listing.closesAt
      ? [
          {
            label: "Son teklif tarihi",
            value: formatDate(listing.closesAt, "datetime"),
          },
        ]
      : []),
    ...(listing.publishedAt
      ? [{ label: "Yayın", value: formatDate(listing.publishedAt, "long") }]
      : []),
    {
      label: "Kapsam",
      value: listing.isInternational ? "Uluslararası" : "Yurtiçi",
    },
    { label: "Para birimi", value: listing.primaryCurrency },
    ...(listing.deliveryTerm
      ? [
          {
            label: "Teslim şekli",
            value:
              DELIVERY_TERM_LABELS[listing.deliveryTerm as DeliveryTerm] ??
              listing.deliveryTerm,
          },
        ]
      : []),
    {
      label: "Ödeme",
      value:
        PAYMENT_CATEGORY_LABELS[listing.paymentCategory as PaymentCategory] ??
        listing.paymentCategory,
    },
    ...(listing.paymentDays
      ? [{ label: "Vade", value: `${listing.paymentDays} gün` }]
      : []),
  ];

  return (
    <div className="min-h-dvh bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(offerOrDemand) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }}
      />
      <MarketingHeader />

      <main className="mx-auto max-w-5xl px-6 pt-28 pb-24 lg:px-8">
        <nav aria-label="Yol" className="text-sm text-zinc-500">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/" className="hover:text-zinc-900">
                Anasayfa
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href={indexBase} className="hover:text-zinc-900">
                {indexLabel}
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="line-clamp-1 text-zinc-900">{listing.title}</li>
          </ol>
        </nav>

        <header className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATE_CLASS[state]}`}
            >
              {STATE_LABEL[state]}
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
              {isDemand
                ? MARKETPLACE_LABELS.demandOne
                : MARKETPLACE_LABELS.offerOne}
            </span>
            <span className="font-mono text-xs text-zinc-400">
              {listing.number}
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-balance text-zinc-950 sm:text-4xl">
            {listing.title}
          </h1>
          {listing.categories.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {listing.categories.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`${indexBase}?kategori=${c.id.slice(0, 2)}000000`}
                    className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </header>

        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_18rem]">
          <div>
            {listing.description ? (
              <section>
                <h2 className="text-lg font-semibold text-zinc-950">Açıklama</h2>
                <p className="mt-3 text-base/7 whitespace-pre-line text-zinc-700">
                  {listing.description}
                </p>
              </section>
            ) : null}

            {listing.items.length > 0 ? (
              <section className="mt-10">
                <h2 className="text-lg font-semibold text-zinc-950">
                  Kalemler ({listing.items.length})
                </h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
                      <tr>
                        <th className="py-2 pr-3 font-medium">#</th>
                        <th className="py-2 pr-3 font-medium">Kalem</th>
                        <th className="py-2 pr-3 font-medium">Miktar</th>
                        <th className="py-2 pr-3 font-medium">Marka / MPN</th>
                        {!isDemand ? (
                          <th className="py-2 font-medium">Hemen al</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {listing.items.map((i) => (
                        <tr key={i.lineNo} className="align-top">
                          <td className="py-3 pr-3 text-zinc-400">{i.lineNo}</td>
                          <td className="py-3 pr-3">
                            <p className="font-medium text-zinc-900">{i.name}</p>
                            {i.description ? (
                              <p className="mt-1 text-xs text-zinc-500">
                                {i.description}
                              </p>
                            ) : null}
                            {i.specification ? (
                              <p className="mt-1 text-xs whitespace-pre-line text-zinc-500">
                                {i.specification}
                              </p>
                            ) : null}
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap text-zinc-700">
                            {Number(i.quantity).toLocaleString("tr-TR")}{" "}
                            {i.unitCode ?? i.unit}
                          </td>
                          <td className="py-3 pr-3 text-zinc-600">
                            {i.brand || i.mpn
                              ? [i.brand, i.mpn].filter(Boolean).join(" · ")
                              : "—"}
                          </td>
                          {!isDemand ? (
                            <td className="py-3 whitespace-nowrap text-zinc-900">
                              {i.buyNowUnitPrice
                                ? `${currencySymbol(listing.primaryCurrency)}${Number(
                                    i.buyNowUnitPrice,
                                  ).toLocaleString("tr-TR")}`
                                : "—"}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <section className="mt-10">
              <h2 className="text-lg font-semibold text-zinc-950">
                İlan bilgileri
              </h2>
              <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                {facts.map((f) => (
                  <div
                    key={f.label}
                    className="flex justify-between gap-4 border-b border-zinc-100 pb-2"
                  >
                    <dt className="text-sm text-zinc-500">{f.label}</dt>
                    <dd className="text-right text-sm font-medium text-zinc-900">
                      {f.value}
                    </dd>
                  </div>
                ))}
              </dl>
              {/* Şartname ve ödeme notu bilinçli olarak public yanıtta YOK
                  (serbest metin, iletişim bilgisi taşıyabiliyor). Ziyaretçiye
                  bunun eksik değil KURAL olduğunu söylüyoruz. */}
              <p className="mt-6 flex items-start gap-2 rounded-xl bg-zinc-50 p-4 text-sm/6 text-zinc-600">
                <LockClosedIcon
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-zinc-400"
                />
                <span>
                  Şartname metni, ödeme notu ve ekli belgeler yalnızca kayıtlı
                  firmalara açıktır. Teklifler kapalı zarf esasıyla toplanır —
                  gelen teklifleri yalnızca ilan sahibi görür.
                </span>
              </p>
            </section>
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-2xl border border-zinc-200 p-5">
              <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                {isDemand ? "Alıcı firma" : "Satıcı firma"}
              </h2>
              <div className="mt-3 flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
                  <BuildingOffice2Icon
                    aria-hidden
                    className="size-5 text-zinc-400"
                  />
                </span>
                <div className="min-w-0">
                  {listing.company.slug ? (
                    <Link
                      href={`/firma/${listing.company.slug}`}
                      className="text-sm font-semibold text-zinc-950 hover:text-blue-700"
                    >
                      {listing.company.name}
                    </Link>
                  ) : (
                    <p className="text-sm font-semibold text-zinc-950">
                      {listing.company.name}
                    </p>
                  )}
                  {listing.company.industry ? (
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {listing.company.industry}
                    </p>
                  ) : null}
                  {listing.company.city ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                      <MapPinIcon aria-hidden className="size-3.5" />
                      {listing.company.city}
                    </p>
                  ) : null}
                  {listing.isInternational ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                      <GlobeAltIcon aria-hidden className="size-3.5" />
                      Uluslararası ilan
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 border-t border-zinc-200 pt-5">
                {state === "open" ? (
                  <>
                    <Link
                      href="/company/kayit"
                      className="block rounded-full bg-zinc-950 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-zinc-800"
                    >
                      Teklif vermek için kaydol
                    </Link>
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
                    <p className="text-sm text-zinc-600">
                      Bu {isDemand ? "talep" : "ilan"} teklife kapalı.
                    </p>
                    <Link
                      href={indexBase}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900"
                    >
                      Açık olanları gör
                      <ArrowRightIcon aria-hidden className="size-4" />
                    </Link>
                  </>
                )}
              </div>
            </div>
          </aside>
        </div>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
