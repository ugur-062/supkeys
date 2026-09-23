import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useActivityLabel, useClosingUrgency, useDeliveryTermLabel, usePaymentCategoryLabel, useScopeLabel, useSeoT } from "@/i18n/domain";
import { PublicLayout } from "./public-layout";
import { GatedField } from "./gated-field";
import { Heading } from "@/components/catalyst/heading";
import { formatDate } from "@/lib/format-date";
import { JsonLd } from "@/components/seo/json-ld";
import { AutoTranslatedNote } from "./auto-translated-note";
import { listingSeo, listingSeoInput } from "@/lib/seo/entities";
import { MARKETPLACE_ROUTES, listingPath, publicState } from "@/lib/public/marketplace";
import type { PublicListingCard, PublicListingDetail } from "@/lib/public/marketplace-api";
import { PANEL_TARGET, loginHref, signupHref } from "@/lib/public/visibility";
import { ListingTeaserRow } from "./listing-teaser-row";
import { resolveSiteUrl } from "@/lib/site-url";
import { currencySymbol } from "@/lib/tenders/labels";
import {
  ArrowRightIcon,
  BanknotesIcon,
  BuildingOffice2Icon,
  CheckBadgeIcon,
  GlobeAltIcon,
  LockClosedIcon,
  MapPinIcon,
} from "@heroicons/react/20/solid";
import { Link } from "@/i18n/navigation";
import { AccentLink } from "@/components/ui/accent-fill";
import { daysUntil } from "@/lib/tenders/seller-state";
import { cn } from "@/lib/utils";

/**
 * Tekil alım talebi sayfası — SUNUCU bileşeni. (Satış ilanı 2026-09-04'te
 * kaldırıldı; tek tip ALIM.)
 */
export function ListingDetail({
  listing,
  similar = [],
}: {
  listing: PublicListingDetail;
  /** "Benzer açık talepler" — kayıt sonrası ne bulacağını gösterir (3 kart). */
  similar?: PublicListingCard[];
}) {
  const t = useTranslations("web.marketplace.listing");
  const tl = useTranslations("web.marketplace.labels");
  const tstate = useTranslations("web.marketplace.state");
  const locale = useLocale();
  const seoT = useSeoT();
  const fmt = useFormatter();
  const scopeLabel = useScopeLabel();
  const activityLabel = useActivityLabel();
  const deliveryTermLabel = useDeliveryTermLabel();
  const paymentCategoryLabel = usePaymentCategoryLabel();
  const closingUrgency = useClosingUrgency();
  const state = publicState(listing.status);
  const urgency = closingUrgency(listing.status, listing.closesAt);
  const days = daysUntil(listing.closesAt) ?? 99;
  const site = resolveSiteUrl();
  const canonical = `${site}${listingPath(listing.number, listing.title)}`;
  const indexBase = MARKETPLACE_ROUTES.demands;
  const indexLabel = tl("demands");

  /* YAPILANDIRILMIŞ VERİ TEK KAYNAKTAN (2026-09-09, Parça 2):
     `listingSeo` hem sayfanın metasını hem bu grafiği üretir. Sahibin adı
     fonksiyona PARAMETRE OLARAK BİLE geçmez (`ListingSeoInput.buyer` yalnız
     şehir/ülke taşır) — sayfada gizlediğimiz kimliği yapılandırılmış veride
     vermek onu makine-okunur biçimde geri vermek olurdu. */
  const seo = listingSeo(listingSeoInput(listing), { locale, t: seoT });

  const facts: { label: string; value: string }[] = [
    { label: t("number"), value: listing.number },
    ...(listing.closesAt
      ? [
          {
            label: t("closesAtLabel"),
            value: formatDate(listing.closesAt, "datetime", locale),
          },
        ]
      : []),
    ...(listing.publishedAt
      ? [{ label: t("published"), value: formatDate(listing.publishedAt, "long", locale) }]
      : []),
    {
      label: t("visibility"),
      value: scopeLabel(listing.targetCountries ?? []),
    },
    { label: t("currency"), value: listing.primaryCurrency },
    ...(listing.deliveryTerm
      ? [
          {
            label: t("deliveryTerm"),
            value: deliveryTermLabel(listing.deliveryTerm),
          },
        ]
      : []),
    {
      label: t("payment"),
      value: paymentCategoryLabel(listing.paymentCategory),
    },
    ...(listing.paymentDays
      ? [{ label: t("paymentDays"), value: t("days", { n: listing.paymentDays }) }]
      : []),
  ];

  return (
    <PublicLayout>
      <JsonLd data={seo.jsonLd} />

      <div className="mx-auto max-w-6xl px-6 pt-28 pb-20 lg:px-8">
        <nav aria-label={t("breadcrumb")} className="text-sm text-zinc-500">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/" className="hover:text-zinc-900">
                {t("home")}
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

        {/* Kategori bandı KALDIRILDI (2026-09-18, kullanıcı: "en yukarıdaki
            dikdörtgen ikonu kaldır"). */}
        {/* BAŞLIK KARTI (2026-09-18, kullanıcı: "çok düz ve kötü duruyor"):
            açık gri zeminli kart — üstte durum/tür/numara, büyük başlık,
            kategori çipleri, aranan tedarikçi tipi; altta Kapanış · Kalem ·
            Kapsam · Format şeridi (panel meta şeridiyle aynı dil). Renk
            eklenmez, monokrom kalır. */}
        <header className="mt-6 overflow-hidden rounded-3xl bg-zinc-50 ring-1 ring-zinc-950/5">
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                  state === "open"
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : state === "evaluating"
                      ? "bg-amber-50 text-amber-700 ring-amber-200"
                      : "bg-white text-zinc-600 ring-zinc-200",
                )}
              >
                {state === "open" ? <span className="size-1.5 rounded-full bg-emerald-500" /> : null}
                {tstate(state)}
              </span>
              <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200">
                {tl("demandOne")}
              </span>
              <span className="tabular-nums text-xs font-medium tracking-wide text-zinc-500">
                {listing.number}
              </span>
            </div>
            <Heading
              level={1}
              className="mt-4 text-3xl font-bold tracking-tight text-balance !text-zinc-950 sm:text-4xl"
            >
              {listing.title}
            </Heading>
            <AutoTranslatedNote from={listing.translatedFrom} className="mt-2" />
            {listing.categories.length > 0 ? (
              <ul className="mt-4 flex flex-wrap gap-2">
                {listing.categories.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`${indexBase}?kategori=${c.id.slice(0, 2)}000000`}
                      className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:text-zinc-950 hover:ring-zinc-900/30"
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            {/* ARANAN TEDARİKÇİ TİPİ — talebin niteliği, sahibinin kimliği
                DEĞİL. "Üretici aranıyor" yazan talebe bayi boşuna hazırlık
                yapmasın diye burada, kategorinin hemen yanında. */}
            {(listing.preferredActivities?.length ?? 0) > 0 ? (
              <p className="mt-3 text-sm text-zinc-600">
                <span className="font-medium text-zinc-900">{t("preferredActivities")}</span>{" "}
                {listing.preferredActivities.map((a) => activityLabel(a)).join(" · ")}
              </p>
            ) : null}
          </div>
          <dl className="grid grid-cols-2 gap-px border-t border-zinc-950/5 bg-zinc-950/5 sm:grid-cols-4">
            {[
              {
                label: t("closing"),
                value: (
                  <>
                    <span className="block">{listing.closesAt ? formatDate(listing.closesAt, "short", locale) : "—"}</span>
                    {urgency ? (
                      <span
                        className={cn(
                          "mt-1 inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1",
                          days <= 1
                            ? "bg-rose-50 text-rose-700 ring-rose-200"
                            : days <= 3
                              ? "bg-amber-50 text-amber-700 ring-amber-200"
                              : "bg-zinc-50 text-zinc-600 ring-zinc-200",
                        )}
                      >
                        {urgency.text}
                      </span>
                    ) : null}
                  </>
                ),
              },
              {
                label: t("items"),
                value: (
                  <>
                    <span className="block">{t("itemsCount", { count: listing.itemCount })}</span>
                    {listing.itemSummary.totalQuantity && listing.itemSummary.unit ? (
                      <span className="mt-0.5 block text-xs font-medium text-zinc-500">
                        {t("totalQty", { qty: fmt.number(Number(listing.itemSummary.totalQuantity)), unit: listing.itemSummary.unit })}
                      </span>
                    ) : null}
                  </>
                ),
              },
              { label: t("visibility"), value: scopeLabel(listing.targetCountries ?? []) },
              {
                label: t("format"),
                value: listing.format === "ENGLISH_AUCTION" ? t("formatAuction") : t("formatRfq"),
              },
            ].map((f) => (
              <div key={f.label} className="bg-white px-5 py-4">
                <dt className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">{f.label}</dt>
                <dd className="mt-1 text-sm font-semibold text-zinc-900">{f.value}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_18rem]">
          <div>
            {listing.description ? (
              <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-950/5">
                <h2 className="text-lg font-semibold text-zinc-950">{t("description")}</h2>
                <p className="mt-3 text-base/7 whitespace-pre-line text-zinc-700">
                  {listing.description}
                </p>
              </section>
            ) : null}

            {/* KALEMLER — AD ve MİKTAR AÇIK (2026-09-18, kullanıcı kararı:
                "kalemlerin neler olduğu gözüksün, firma bilgisi zaten
                gizli"). Marka/açıklama/şartname ve alıcı kimliği üyeye. */}
            {listing.itemCount > 0 ? (
              <section className="mt-12">
                <h2 className="text-lg font-semibold text-zinc-950">
                  {t("itemsHeading", { count: listing.itemCount })}
                  {listing.itemSummary.totalQuantity ? (
                    <span className="ml-2 text-base font-normal text-zinc-500">
                      {t("totalQty", { qty: fmt.number(Number(listing.itemSummary.totalQuantity)), unit: listing.itemSummary.unit ?? "" })}
                    </span>
                  ) : null}
                </h2>
                <ul className="mt-4 divide-y divide-zinc-950/5 overflow-hidden rounded-2xl ring-1 ring-zinc-950/5">
                  {listing.items.map((row) => (
                    <li key={row.lineNo} className="flex items-center gap-3 bg-white px-5 py-3 text-sm">
                      <span className="w-8 shrink-0 tabular-nums text-zinc-400">{row.lineNo}</span>
                      <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">{row.name || t("itemFallback", { n: row.lineNo })}</span>
                      <span className="ml-auto shrink-0 tabular-nums text-zinc-700">
                        {fmt.number(Number(row.quantity))} {row.unit}
                      </span>
                    </li>
                  ))}
                </ul>
                <GatedField
                  className="mt-4"
                  size="box"
                  label={t("gateLabel")}
                  hint={t("gateHint")}
                  redirect={PANEL_TARGET.listing(listing.number)}
                />
              </section>
            ) : null}

            <section className="mt-12">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                {t("infoHeading")}
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
                <span>{t("membersNote")}</span>
              </p>
            </section>
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
              <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                {t("buyer")}
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
                    {listing.company.verified ? t("verifiedBuyer") : t("buyerCompany")}
                  </p>
                  {listing.company.activities.length > 0 ? (
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {listing.company.activities.slice(0, 2).map((a) => activityLabel(a)).join(" · ")}
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
                  <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                    <GlobeAltIcon aria-hidden className="size-3.5" />
                    {scopeLabel(listing.targetCountries ?? [])}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs/5 text-zinc-500">
                {t("identityNote")}
              </p>

              <div className="mt-5 border-t border-zinc-950/5 pt-5">
                {state === "open" ? (
                  <>
                    {/* Kayıt sonrası AYNI talebe döner (intent=teklif + redirect). */}
                    <AccentLink
                      href={signupHref("teklif", listingPath(listing.number, listing.title))}
                      className="block rounded-full px-4 py-2.5 text-center text-sm font-semibold text-white transition"
                    >
                      {t("signupCta")}
                    </AccentLink>
                    <p className="mt-2 text-center text-xs text-zinc-500">{t("twoMinutes")}</p>
                    <ul className="mt-4 space-y-1.5 text-xs/5 text-zinc-600">
                      {[t("perk1"), t("perk2"), t("perk3")].map((perk) => (
                        <li key={perk} className="flex gap-2">
                          <CheckBadgeIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                          {perk}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-center text-xs text-zinc-500">
                      {t("haveAccount")}{" "}
                      <Link
                        href={loginHref(PANEL_TARGET.listing(listing.number))}
                        className="font-medium text-zinc-700 hover:underline"
                      >
                        {t("login")}
                      </Link>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-zinc-600">
                      {t("closed")}
                    </p>
                    <Link
                      href={indexBase}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 underline underline-offset-2 hover:text-zinc-600"
                    >
                      {t("seeOpen")}
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
                  title: t("trust1Title"),
                  body: t("trust1Body"),
                },
                {
                  icon: CheckBadgeIcon,
                  title: t("trust2Title"),
                  body: t("trust2Body"),
                },
                {
                  icon: BanknotesIcon,
                  title: t("trust3Title"),
                  body: t("trust3Body"),
                },
              ].map((item) => (
                <li key={item.title} className="flex gap-3">
                  <item.icon
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-zinc-400"
                  />
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs/5 text-zinc-500">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        {/* Benzer açık talepler — kayıt sonrası ne bulacağını gösterir. */}
        {similar.length > 0 ? (
          <section className="mt-16">
            <h2 className="text-xl font-semibold tracking-tight text-zinc-950">{t("similar")}</h2>
            {/* SATIR düzeni (2026-09-18, kullanıcı: "kategori fotoğrafı olmasın,
                farklı göster"): anasayfa/dizinle aynı `ListingTeaserRow` —
                görselsiz, sütunlu, alt alta. */}
            <ul className="mt-5 space-y-2">
              {similar.slice(0, 3).map((l) => (
                <li key={l.number}>
                  <ListingTeaserRow listing={l} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </PublicLayout>
  );
}
