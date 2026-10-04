"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Building2, Globe2, Lock } from "lucide-react";
import {
  useActivityLabel,
  useClosingUrgency,
  useDeliveryTermLabel,
  useFormatDate,
  usePaymentCategoryLabel,
  useQuantityLabel,
  useScopeLabel,
} from "@/i18n/domain";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/catalyst/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ListSkeleton } from "@/components/list";
import { AutoTranslatedNote } from "@/components/marketplace/auto-translated-note";
import { PRICING_HREF, useUpgradeHref, useVerifyFirst } from "@/components/company/silver-lock-card";
import { useMaskedTender, type MaskedTenderResponse } from "@/hooks/use-seller-tenders";
import { cn } from "@/lib/utils";
import { CountryLabel } from "@/components/ui/country-flag";

/** Satış anasayfasındaki Açık Talepler bölümü (geri bağlantı). */
const BACK_HREF = "/company/satis#acik-talepler";

type MaskedDetail = Extract<MaskedTenderResponse, { masked: true }>;

/**
 * MASKELİ TALEP GÖRÜNÜMÜ — panel içi (2026-10-03, ücretsiz üye).
 *
 * Açık Talepler'deki alıcı gizli satıra tıklayan ücretsiz üye buraya gelir;
 * tam talep detayı (`/company/ilan/[id]`) AÇILMAZ. Veri herkese açık
 * `/talep/<slug>` sayfasıyla AYNI serileştiriciden (`toPublicListingDetail`):
 * başlık, numara, kategori, kalem adı + miktar, şehir, kapanış, görünürlük,
 * usul, kapalı zarf notu. Alıcı adı, şartname, ek, iletişim YOK. Tek eylem
 * "Teklif ver · Silver" — doğrulama önce kuralı (`useUpgradeHref`).
 *
 * Talep izleyene maskesiz açıksa (paket alındı, davet geldi, bağlantı kuruldu)
 * API `{ masked:false, id }` döner → tam detaya geçilir.
 */
export function MaskedRequestView({ number }: { number: string }) {
  const t = useTranslations("web.panel.trade.maskedRequestView");
  const router = useRouter();
  const q = useMaskedTender(number);
  const unmaskedId = q.data && !q.data.masked ? q.data.id : null;

  useEffect(() => {
    if (unmaskedId) router.replace(`/company/ilan/${unmaskedId}`);
  }, [unmaskedId, router]);

  const status = (q.error as { response?: { status?: number } } | null)?.response?.status;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href={BACK_HREF}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-950"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t("geriAcikTalepler")}
      </Link>

      {q.isLoading || unmaskedId ? (
        <div>
          {unmaskedId ? <p className="mb-3 text-sm text-zinc-500">{t("yonlendiriliyor")}</p> : null}
          <ListSkeleton rows={4} />
        </div>
      ) : q.isError ? (
        <div className="space-y-3">
          <EmptyState
            icon={Lock}
            title={status === 404 ? t("bulunamadi") : t("yuklenemedi")}
            description={status === 404 ? t("bulunamadiAciklama") : undefined}
            variant="no-results"
            action={
              status === 404 ? (
                <Button href={BACK_HREF} outline>
                  {t("geriAcikTalepler")}
                </Button>
              ) : (
                <Button outline onClick={() => void q.refetch()}>
                  {t("tekrarDene")}
                </Button>
              )
            }
          />
        </div>
      ) : q.data && q.data.masked ? (
        <MaskedDetailBody listing={q.data} />
      ) : null}
    </div>
  );
}

function MaskedDetailBody({ listing }: { listing: MaskedDetail }) {
  const t = useTranslations("web.panel.trade.maskedRequestView");
  const fmtDate = useFormatDate();
  const scopeLabel = useScopeLabel();
  const quantity = useQuantityLabel();
  const activityLabel = useActivityLabel();
  const deliveryTermLabel = useDeliveryTermLabel();
  const paymentCategoryLabel = usePaymentCategoryLabel();
  const closingUrgency = useClosingUrgency();
  const upgradeHref = useUpgradeHref();
  const verifyFirst = useVerifyFirst();
  const open = listing.status === "OPEN";
  const urgency = closingUrgency(listing.status, listing.closesAt);
  // Alıcının ŞEHRİ değil, talebin açıldığı ÜLKE (2026-10-04, kullanıcı kararı).
  const buyerCountry = listing.company.country;

  const facts: { label: string; value: string }[] = [
    { label: t("talepNo"), value: listing.number },
    ...(listing.closesAt ? [{ label: t("sonTeklifTarihi"), value: fmtDate(listing.closesAt, "datetime") }] : []),
    ...(listing.publishedAt ? [{ label: t("yayin"), value: fmtDate(listing.publishedAt, "short") }] : []),
    { label: t("gorunurluk"), value: scopeLabel(listing.targetCountries ?? []) },
    { label: t("paraBirimi"), value: listing.primaryCurrency },
    ...(listing.deliveryTerm ? [{ label: t("teslimSekli"), value: deliveryTermLabel(listing.deliveryTerm) }] : []),
    { label: t("odeme"), value: paymentCategoryLabel(listing.paymentCategory) },
    ...(listing.paymentDays ? [{ label: t("vade"), value: t("vadeGun", { n: listing.paymentDays }) }] : []),
  ];

  return (
    <article className="space-y-6" aria-labelledby="maskeli-talep-baslik">
      <header className="overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-950/5">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-700">
              <Lock aria-hidden className="size-3" />
              {t("maskeliEtiket")}
            </span>
            <span className="tabular-nums font-medium tracking-wide text-zinc-500">{listing.number}</span>
          </div>
          <h1 id="maskeli-talep-baslik" className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">
            {listing.title}
          </h1>
          <AutoTranslatedNote from={listing.translatedFrom} className="mt-2" />
          {listing.categories.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label={t("kategori")}>
              {listing.categories.map((c) => (
                <li key={c.id} className="rounded-full bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200">
                  {c.name}
                </li>
              ))}
            </ul>
          ) : null}
          {listing.preferredActivities.length > 0 ? (
            <p className="mt-3 text-sm text-zinc-600">
              <span className="font-medium text-zinc-900">{t("arananTedarikciTipi")}</span>{" "}
              {listing.preferredActivities.map((a) => activityLabel(a)).join(" · ")}
            </p>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-px border-t border-zinc-950/5 bg-zinc-950/5 sm:grid-cols-4">
          {[
            {
              label: t("kapanis"),
              value: (
                <>
                  <span className="block">{listing.closesAt ? fmtDate(listing.closesAt, "short") : "—"}</span>
                  {urgency ? (
                    <span className={cn("mt-1 inline-flex text-[11px] font-semibold", urgency.className)}>{urgency.text}</span>
                  ) : null}
                </>
              ),
            },
            {
              label: t("kalem"),
              value: (
                <>
                  <span className="block">{t("kalemSayisi", { count: listing.itemCount })}</span>
                  {listing.itemSummary.totalQuantity && listing.itemSummary.unit ? (
                    <span className="mt-0.5 block text-xs font-medium text-zinc-500">
                      {t("toplam", { qty: quantity(listing.itemSummary.totalQuantity, listing.itemSummary.unit) })}
                    </span>
                  ) : null}
                </>
              ),
            },
            { label: t("gorunurluk"), value: scopeLabel(listing.targetCountries ?? []) },
            { label: t("usul"), value: listing.format === "ENGLISH_AUCTION" ? t("usulPazarlik") : t("usulTeklif") },
          ].map((f) => (
            <div key={f.label} className="bg-white px-4 py-3">
              <dt className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">{f.label}</dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-900">{f.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_17rem]">
        <div className="space-y-6">
          {listing.description ? (
            <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-950/5">
              <h2 className="text-base font-semibold text-zinc-950">{t("aciklama")}</h2>
              <p className="mt-2 text-sm/6 whitespace-pre-line text-zinc-700">{listing.description}</p>
            </section>
          ) : null}

          {listing.items.length > 0 ? (
            <section>
              <h2 className="text-base font-semibold text-zinc-950">{t("kalemler", { count: listing.itemCount })}</h2>
              <ul className="mt-3 divide-y divide-zinc-950/5 overflow-hidden rounded-2xl ring-1 ring-zinc-950/5">
                {listing.items.map((row) => (
                  <li key={row.lineNo} className="flex items-center gap-3 bg-white px-4 py-2.5 text-sm">
                    <span className="w-8 shrink-0 tabular-nums text-zinc-400">{row.lineNo}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">
                      {row.name || t("kalemYedek", { n: row.lineNo })}
                    </span>
                    <span className="ml-auto shrink-0 tabular-nums text-zinc-700">{quantity(row.quantity, row.unit)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-2xl bg-white ring-1 ring-zinc-950/5">
            <h2 className="px-5 pt-4 text-base font-semibold text-zinc-950">{t("talepBilgileri")}</h2>
            <dl className="mt-2 divide-y divide-zinc-950/5">
              {facts.map((f) => (
                <div key={f.label} className="px-5 py-3 sm:grid sm:grid-cols-3 sm:gap-4">
                  <dt className="text-sm font-medium text-zinc-900">{f.label}</dt>
                  <dd className="mt-1 text-sm text-zinc-600 sm:col-span-2 sm:mt-0">{f.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <p className="flex items-start gap-2 rounded-xl bg-zinc-50 p-4 text-sm/6 text-zinc-600 ring-1 ring-zinc-950/5">
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-400" />
            <span>{t("kapaliZarfNotu")}</span>
          </p>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
            <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{t("alici")}</h2>
            <div className="mt-3 flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
                <Building2 aria-hidden className="size-5 text-zinc-400" />
              </span>
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-zinc-950">{t("aliciGizli")}</p>
                {listing.company.verified ? (
                  <Badge tone="verified" size="sm" icon={false}>
                    {t("dogrulanmisAlici")}
                  </Badge>
                ) : null}
                {listing.company.industry ? <p className="text-xs text-zinc-500">{listing.company.industry}</p> : null}
                {buyerCountry ? (
                  <p className="flex items-center text-xs text-zinc-500">
                    <CountryLabel code={buyerCountry} />
                  </p>
                ) : null}
                <p className="flex items-center gap-1 text-xs text-zinc-500">
                  <Globe2 aria-hidden className="size-3.5" />
                  {scopeLabel(listing.targetCountries ?? [])}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
            {open ? (
              <>
                <Button href={upgradeHref} className="w-full">
                  {t("teklifVerSilver")}
                </Button>
                <p className="mt-3 text-xs/5 text-zinc-600">{verifyFirst ? t("ctaNotDogrulama") : t("ctaNot")}</p>
                {verifyFirst ? (
                  <Link
                    href={PRICING_HREF}
                    className="mt-2 inline-block text-xs font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-950"
                  >
                    {t("paketleriGor")}
                  </Link>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-zinc-600">{t("kapandi")}</p>
            )}
          </div>
        </aside>
      </div>
    </article>
  );
}
