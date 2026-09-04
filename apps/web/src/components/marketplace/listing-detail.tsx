import { PublicLayout } from "./public-layout";
import { Badge } from "@/components/catalyst/badge";
import { CategoryImage } from "./category-image";
import { GatedField } from "./gated-field";
import { Heading } from "@/components/catalyst/heading";
import { formatDate } from "@/lib/format-date";
import { serializeJsonLd } from "@/lib/json-ld";
import {
  MARKETPLACE_LABELS,
  MARKETPLACE_ROUTES,
  STATE_LABEL,
  listingPath,
  publicState,
} from "@/lib/public/marketplace";
import type { PublicListingCard, PublicListingDetail } from "@/lib/public/marketplace-api";
import { PANEL_TARGET, loginHref, signupHref } from "@/lib/public/visibility";
import { ListingTeaserCard } from "./listing-teaser-card";
import { companyActivityLabel } from "@rothern/shared";
import { resolveSiteUrl } from "@/lib/site-url";
import {
  DELIVERY_TERM_LABELS,
  PAYMENT_CATEGORY_LABELS,
  currencySymbol,
} from "@/lib/tenders/labels";
import type { DeliveryTerm, PaymentCategory } from "@/lib/tenders/types";
import {
  ArrowRightIcon,
  BanknotesIcon,
  BuildingOffice2Icon,
  CheckBadgeIcon,
  GlobeAltIcon,
  LockClosedIcon,
  MapPinIcon,
} from "@heroicons/react/20/solid";
import Link from "next/link";

const STATE_COLOR: Record<string, "emerald" | "amber" | "zinc"> = {
  open: "emerald",
  evaluating: "amber",
  closed: "zinc",
};

/**
 * Tekil ilan sayfası — SUNUCU bileşeni, ALIM ve SATIS ortak.
 *
 * İki tip aynı gövdeyi paylaşır çünkü ziyaretçi için fark yalnız yön (kim
 * alıyor / kim satıyor) ve JSON-LD tipi. Ayrı iki bileşen yazmak, aynı
 * alanları iki yerde güncelleme borcu üretirdi.
 */
export function ListingDetail({
  listing,
  similar = [],
}: {
  listing: PublicListingDetail;
  /** "Benzer açık talepler" — kayıt sonrası ne bulacağını gösterir (3 kart). */
  similar?: PublicListingCard[];
}) {
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
            name: listing.title,
          },
        }
      : {}),
    // İlan sahibi ANONİM: `Organization` düğümüne ad/URL YAZILMAZ. Yapısal
    // veri sayfada görünmeyen bir şeyi söyleyemez — hem yanlış olur hem de
    // gizlemeye çalıştığımız kimliği makine-okunur biçimde geri verirdi.
    // Yalnız konum kalır (sayfada da görünüyor, lojistik için anlamlı).
    ...(listing.company.city
      ? {
          areaServed: {
            "@type": "Place",
            address: {
              "@type": "PostalAddress",
              addressLocality: listing.company.city,
              addressCountry: listing.company.country ?? "TR",
            },
          },
        }
      : {}),
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
    <PublicLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(offerOrDemand) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }}
      />

      <div className="mx-auto max-w-6xl px-6 pt-28 pb-20 lg:px-8">
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

        {/* Gerçek kapak varsa daha geniş oran (görsel içeriktir); yoksa
            kategori görseli dar bir bant olarak durur ve metni bastırmaz. */}
        <CategoryImage
          src={listing.coverImageUrl}
          alt={listing.title}
          categoryIds={listing.categoryIds}
          ratio={
            listing.coverImageUrl
              ? "aspect-[16/6] sm:aspect-[16/5]"
              : "aspect-[6/1] sm:aspect-[8/1]"
          }
          className="mt-6 rounded-2xl ring-1 ring-zinc-950/5"
        />

        <header className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge color={STATE_COLOR[state]}>{STATE_LABEL[state]}</Badge>
            <Badge color="zinc">
              {isDemand
                ? MARKETPLACE_LABELS.demandOne
                : MARKETPLACE_LABELS.offerOne}
            </Badge>
            <span className="font-mono text-xs text-zinc-500">
              {listing.number}
            </span>
          </div>
          <Heading
            level={1}
            className="mt-4 text-3xl font-semibold tracking-tight text-balance !text-zinc-950 sm:text-4xl"
          >
            {listing.title}
          </Heading>
          {listing.categories.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {listing.categories.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`${indexBase}?kategori=${c.id.slice(0, 2)}000000`}
                    className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:border-zinc-900/20 hover:text-zinc-950"
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

            {/* KALEMLER — MİKTAR AÇIK, AD GİZLİ (görünürlük v2): ziyaretçi
                ölçeği görür ("Kalem 1 · 500 adet"), ne istendiğini üye görür.
                Bulanıklaştırma yok; ad HTML'e hiç yazılmaz. */}
            {listing.itemCount > 0 ? (
              <section className="mt-12">
                <h2 className="text-lg font-semibold text-zinc-950">
                  Kalemler ({listing.itemCount})
                  {listing.itemSummary.totalQuantity ? (
                    <span className="ml-2 text-base font-normal text-zinc-500">
                      toplam {Number(listing.itemSummary.totalQuantity).toLocaleString("tr-TR")}{" "}
                      {listing.itemSummary.unit}
                    </span>
                  ) : null}
                </h2>
                <ul className="mt-4 divide-y divide-zinc-950/5 overflow-hidden rounded-2xl ring-1 ring-zinc-950/5">
                  {listing.items.map((row) => (
                    <li key={row.lineNo} className="flex items-center gap-3 bg-white px-5 py-3 text-sm">
                      <span className="w-16 shrink-0 font-medium text-zinc-900">Kalem {row.lineNo}</span>
                      <span className="inline-block h-3 w-40 max-w-[40%] rounded bg-zinc-100" aria-hidden />
                      <span className="ml-auto shrink-0 tabular-nums text-zinc-700">
                        {Number(row.quantity).toLocaleString("tr-TR")} {row.unit}
                      </span>
                    </li>
                  ))}
                </ul>
                <GatedField
                  className="mt-4"
                  size="box"
                  label="Kalem adları, alıcı firma ve şartname"
                  hint="Alıcı adını, kalem adlarını, teknik şartnameyi ve ekli belgeleri görmek ve teklif vermek için ücretsiz hesap — 2 dakika, kredi kartı yok."
                  redirect={PANEL_TARGET.listing(listing.type, listing.number)}
                />
              </section>
            ) : null}

            <section className="mt-12">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                İlan bilgileri
              </h2>
              {/* Application UI — Data display / Description lists /
                  "left-aligned striped". Zebra satır, uzun değerlerde (teslim
                  şekli cümlesi) hizayı bozmaz ve tek/çift alan sayısında boş
                  hücre bırakmaz — önceki ızgara düzeninin iki kusuru da bu
                  desende yapısal olarak yok. */}
              <dl className="mt-4 divide-y divide-zinc-950/5 overflow-hidden rounded-2xl ring-1 ring-zinc-950/5">
                {facts.map((f, i) => (
                  <div
                    key={f.label}
                    className={`px-5 py-4 sm:grid sm:grid-cols-3 sm:gap-4 ${
                      i % 2 === 0 ? "bg-zinc-50" : "bg-white"
                    }`}
                  >
                    <dt className="text-sm/6 font-medium text-zinc-900">
                      {f.label}
                    </dt>
                    <dd className="mt-1 text-sm/6 text-zinc-600 sm:col-span-2 sm:mt-0">
                      {f.value}
                    </dd>
                  </div>
                ))}
              </dl>
              {/* Şartname ve ödeme notu bilinçli olarak public yanıtta YOK
                  (serbest metin, iletişim bilgisi taşıyabiliyor). Ziyaretçiye
                  bunun eksik değil KURAL olduğunu söylüyoruz. */}
              <p className="mt-6 flex items-start gap-2 rounded-xl bg-zinc-50 p-4 text-sm/6 text-zinc-600 ring-1 ring-zinc-950/5">
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
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
              <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                {isDemand ? "Alıcı" : "Satıcı"}
              </h2>
              {/* Firma ADI ve LOGOSU gösterilmez — ilan sahibi anonimdir.
                  Ziyaretçiye eksik bir şey değil, KURAL olduğunu söylüyoruz;
                  aksi hâlde "yüklenmedi mi?" diye okunur. */}
              <div className="mt-3 flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
                  <BuildingOffice2Icon
                    aria-hidden
                    className="size-5 text-zinc-400"
                  />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-950">
                    {listing.company.verified
                      ? isDemand ? "Doğrulanmış alıcı" : "Doğrulanmış tedarikçi"
                      : isDemand ? "Alıcı firma" : "Satıcı firma"}
                  </p>
                  {listing.company.activities.length > 0 ? (
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {listing.company.activities.slice(0, 2).map(companyActivityLabel).join(" · ")}
                    </p>
                  ) : null}
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
              <p className="mt-4 text-xs/5 text-zinc-500">
                Firma kimliği yalnız kayıtlı kullanıcılara açıktır.
              </p>

              <div className="mt-5 border-t border-zinc-950/5 pt-5">
                {state === "open" ? (
                  <>
                    {/* Kayıt sonrası AYNI talebe döner (intent=teklif + redirect). */}
                    <Link
                      href={signupHref("teklif", listingPath(listing.type, listing.number, listing.title))}
                      className="block rounded-full bg-zinc-950 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-zinc-800"
                    >
                      Bu talebe teklif vermek için ücretsiz kaydol
                    </Link>
                    <p className="mt-2 text-center text-xs text-zinc-500">2 dakika · kredi kartı yok</p>
                    <ul className="mt-4 space-y-1.5 text-xs/5 text-zinc-600">
                      {[
                        "Alıcı adı, kalem adları ve şartname",
                        "Kapalı zarf teklif — rakipler görmez",
                        "Kategorinle eşleşen yeni talepler e-postana",
                      ].map((t) => (
                        <li key={t} className="flex gap-2">
                          <CheckBadgeIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                          {t}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-center text-xs text-zinc-500">
                      Hesabınız var mı?{" "}
                      <Link
                        href={loginHref(PANEL_TARGET.listing(listing.type, listing.number))}
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
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 underline underline-offset-2 hover:text-zinc-600"
                    >
                      Açık olanları gör
                      <ArrowRightIcon aria-hidden className="size-4" />
                    </Link>
                  </>
                )}
              </div>
            </div>

            {/* Sağ sütun kartın altında boş kalıyordu. Buraya konan üç madde
                envanterden BAĞIMSIZ olarak doğru ve ziyaretçinin asıl merak
                ettiği şey: teklifimi kim görür, karşı taraf gerçek mi, ne
                ödeyeceğim. */}
            <ul className="mt-6 space-y-4 rounded-2xl bg-zinc-50 p-5 ring-1 ring-zinc-950/5">
              {[
                {
                  icon: LockClosedIcon,
                  title: "Kapalı zarf",
                  body: "Teklifinizi yalnız ilan sahibi görür; rakipler ne teklifinizi ne kimliğinizi görebilir.",
                },
                {
                  icon: CheckBadgeIcon,
                  title: "Doğrulanmış firmalar",
                  body: "Talep yayımlayan ve kazandıran firmalar kimlik doğrulamasından geçer.",
                },
                {
                  icon: BanknotesIcon,
                  title: "Komisyon yok",
                  body: "Platform alım-satım bedelinden pay almaz.",
                },
              ].map((t) => (
                <li key={t.title} className="flex gap-3">
                  <t.icon
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-zinc-400"
                  />
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      {t.title}
                    </p>
                    <p className="mt-0.5 text-xs/5 text-zinc-500">{t.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        {/* Benzer açık talepler — kayıt sonrası ne bulacağını gösterir. */}
        {isDemand && similar.length > 0 ? (
          <section className="mt-16">
            <h2 className="text-xl font-semibold tracking-tight text-zinc-950">Benzer açık talepler</h2>
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {similar.slice(0, 3).map((l) => (
                <ListingTeaserCard key={l.number} listing={l} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </PublicLayout>
  );
}
