"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { formatNumber, intlLocale } from "@/i18n/format";
import { useCityLabel } from "@/i18n/domain";
import { PeriodSelect } from "@/components/company/period-select";
import { RatioBar } from "@/components/company/ui/mini-bars";
import { SectionHead } from "@/components/company/ui/stat-tile";
import { KpiCard } from "@/components/dashboard/analytics-primitives";
import { ErrorState } from "@/components/ui/error-state";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useInsights, type ViewDays } from "@/hooks/use-company-views";
import { userHasPermission } from "@/lib/company/permissions";
import { pctChange } from "@/lib/dashboard/delta";
import { MY_BIDS_WON_KPI_HREF } from "@/lib/company/my-bids-links";
import { ArrowLongRightIcon, ArrowRightIcon } from "@heroicons/react/20/solid";
import { Link } from "@/i18n/navigation";
import { useState } from "react";

/**
 * İŞ ANALİZİ (2026-09-05, Europages "Business Insights"): görünürlük
 * (sparkline'lı KPI'lar), alıcı hunisi (görüntülenme → bilgi talebi → teklif →
 * kazanılan), en çok bakılan ürünler ve ziyaretçi şehirleri (oran çubuklu),
 * alıcı bağlantıları. Silver+ (Raporlar kapısıyla aynı).
 */
export function InsightsView() {
  const t = useTranslations("web.panel.trade.insightsView");
  const locale = useLocale() as Locale;
  const [days, setDays] = useState<ViewDays>(30);
  const q = useInsights(days);
  const d = q.data;
  const periodLabel = t("oncekiGuneGore", { days: days });
  const cityLabel = useCityLabel();
  // Satış paneline giden bağlantılar yalnız satış görüntüleme izninde
  // (rol kontrolü paket kontrolünün İÇİNDE): sayfa yalnız "Ziyaret edenler ve
  // iş analizi" tikli kişiye de açık; ona "Satış paneline erişim yetkiniz
  // yok" ekranına giden bağlantı çizilmez (arayüz testi webC-06 NEW-3).
  const { user } = useCompanyAuth();
  const canSell = userHasPermission(user, "sell:view");
  const sellHref = (href: string) => (canSell ? href : undefined);
  // 1 saatin altı "<1 sa" — yuvarlanmış "0 sa" yanıt verilmemiş gibi okunuyordu
  // (arayüz testi O-041).
  const formatReplyHours = (h: number | null) =>
    h == null ? "—" : h < 1 ? t("saatAlti") : t("saat", { n: formatNumber(h, locale, { maximumFractionDigits: 1 }) });
  const spark = (key: "profile" | "product") =>
    d?.series.map((s) => ({ key: s.date, value: s[key], label: fmtDay(s.date, locale) })) ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">{t("isAnalizi")}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {t("neKadarGorunuyorsunuzKimIlgileniyor")}
          </p>
        </div>
        <PeriodSelect value={days} onChange={setDays} />
      </div>

      {/* LİSTE DURUMLARI: iskelet `isPending`e bağlı; hata kartı yalnız hiç veri
          yokken — arka plan yenilemesi düşerse eldeki rakamlar kalır. */}
      {q.isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-zinc-100" />)}
        </div>
      ) : !d ? (
        <ErrorState message={t("isAnaliziVerisiAlinamadiTekrar")} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <section aria-labelledby="gorunurluk" className="space-y-3">
            <SectionHead id="gorunurluk" title={t("gorunurluk")} lead={t("profilVeUrunSayfalarinizKac")} href="/company/sirketim/ziyaretciler" cta={t("ziyaretEdenler")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <KpiCard label={t("profilGoruntulenmesi")} value={d.views.profile.current} deltaPct={pctChange(d.views.profile.current, d.views.profile.previous)} deltaPeriodLabel={periodLabel} accent="blue" href="/company/sirketim/ziyaretciler" spark={spark("profile")} />
              <KpiCard label={t("urunGoruntulenmesi")} value={d.views.product.current} deltaPct={pctChange(d.views.product.current, d.views.product.previous)} deltaPeriodLabel={periodLabel} accent="emerald" href="/company/sirketim/ziyaretciler" spark={spark("product")} />
              <KpiCard label={t("kimligiBilinenZiyaretci")} value={d.views.identifiedVisitors.current} deltaPct={pctChange(d.views.identifiedVisitors.current, d.views.identifiedVisitors.previous)} deltaPeriodLabel={periodLabel} accent="blue" href="/company/sirketim/ziyaretciler" hint={t("ziyaretEdenlerDeAdlariyla")} />
            </div>
          </section>

          {/* Alıcı hunisi */}
          <section aria-label={t("aliciHunisi")} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 sm:p-6">
            <p className="text-sm font-medium text-zinc-600">{t("aliciHunisi")}</p>
            <ol className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { l: t("goruntulenme"), v: d.views.profile.current + d.views.product.current, tone: "text-blue-600" },
                { l: t("bilgiTalebi"), v: d.inquiries.received, tone: "text-emerald-600" },
                { l: t("verilenTeklif"), v: d.bids.submitted, tone: "text-violet-600" },
                { l: t("kazanilan"), v: d.bids.won, tone: "text-amber-600" },
              ].map((s, i, arr) => (
                <li key={s.l} className="relative rounded-xl bg-zinc-50 p-4">
                  <p className="text-xs font-medium text-zinc-500">{s.l}</p>
                  <p className={`mt-1 text-2xl font-semibold tabular-nums ${s.tone}`}>{formatNumber(s.v, locale)}</p>
                  {i < arr.length - 1 ? (
                    <ArrowLongRightIcon aria-hidden className="absolute top-1/2 -right-3.5 hidden size-5 -translate-y-1/2 text-zinc-300 md:block" />
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <RankCard
              title={t("enCokBakilanUrunler")}
              empty={t("buDonemdeUrunGoruntulenmesiYok")}
              rows={d.topProducts.map((p) => ({ key: p.id, label: p.name, value: p.views, display: t.rich("goruntulenmeSayisi", { n: p.views, b: rankValue }) }))}
              accent="emerald"
              footer={canSell ? { href: "/company/satis/urunlerim", label: t("urunlerim") } : undefined}
            />
            <RankCard
              title={t("ziyaretciSehirleri")}
              empty={t("ziyaretcilerinSehirBilgisiYok")}
              rows={d.viewerCities.map((c) => ({ key: c.city, label: cityLabel(c.city), value: c.count, display: t.rich("firmaSayisi", { n: c.count, b: rankValue }) }))}
              accent="blue"
              footer={{ href: "/company/sirketim/ziyaretciler", label: t("ziyaretEdenler") }}
            />
          </div>

          <section aria-labelledby="alici-baglantilari" className="space-y-3">
            <SectionHead id="alici-baglantilari" title={t("aliciBaglantilari")} lead={t("alicilarSizeNasilUlasiyorNe")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label={t("gelenBilgiTalebi")} value={d.inquiries.received} accent="emerald" href={sellHref("/company/satis/bilgi-talepleri")} hint={d.inquiries.received > 0 ? t("yanitlandi", { replied: d.inquiries.replied }) : t("urunSayfalarindanGelenSorular")} />
              <KpiCard label={t("ilkYanitSuresi")} value={formatReplyHours(d.inquiries.medianFirstReplyHours)} accent="emerald" hint={d.inquiries.replyWindowDays ? t("ortancaSonGun", { days: d.inquiries.replyWindowDays }) : t("ortanca")} href={sellHref("/company/satis/bilgi-talepleri")} />
              <KpiCard label={t("gelenBaglantiDaveti")} value={d.connections.invitesReceived} accent="emerald" href={sellHref("/company/satis/musterilerim")} hint={d.connections.invitesReceived > 0 ? t("kabulEdildi", { n: d.connections.accepted }) : t("baglantiAginiziBuyutun")} />
              <KpiCard label={t("talepDaveti")} value={d.listingInvitations} accent="emerald" href={sellHref("/company/satis#acik-talepler")} hint={t("alicilarSiziTeklifeCagirdi")} />
            </div>
          </section>

          <section aria-labelledby="teklifler" className="space-y-3">
            <SectionHead id="teklifler" title={t("teklifler")} lead={t("donemdeVerdiginizTekliflerVeKazanma")} href={sellHref("/company/satis/tekliflerim")} cta={t("tekliflerim")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label={t("verilenTeklif")} value={d.bids.submitted} accent="slate" href={sellHref("/company/satis/tekliflerim")} />
              <KpiCard label={t("kazanilan")} value={d.bids.won} accent="slate" href={sellHref(MY_BIDS_WON_KPI_HREF)} hint={d.bids.submitted > 0 ? t("kazanmaOrani", { round: Math.round((d.bids.won / d.bids.submitted) * 100) }) : undefined} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function fmtDay(iso: string, locale: Locale) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Sıra kartında sayının vurgusu (`t.rich` etiketi `<b>`). */
const rankValue = (chunks: React.ReactNode) => <span className="font-semibold text-zinc-900">{chunks}</span>;

function RankCard({
  title,
  rows,
  empty,
  accent,
  footer,
}: {
  title: string;
  /** `display` = sayı + birim TEK çoğul mesajdan ("3 views" / "1 view"). */
  rows: { key: string; label: string; value: number; display: React.ReactNode }[];
  empty: string;
  accent: "blue" | "emerald";
  /** Yoksa alt bağlantı çizilmez (izinsiz hedef). */
  footer?: { href: string; label: string };
}) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <section aria-label={title} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 sm:p-6">
      <h3 className="text-sm font-semibold text-zinc-950">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{empty}</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {rows.map((r, i) => (
            <li key={r.key}>
              <div className="flex items-center gap-3 text-sm">
                <span className="w-5 shrink-0 text-xs tabular-nums text-zinc-400">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-900">{r.label}</span>
                <span className="shrink-0 text-xs text-zinc-500">{r.display}</span>
              </div>
              <div className="mt-1.5 pl-8">
                <RatioBar value={r.value} max={max} accent={accent} />
              </div>
            </li>
          ))}
        </ol>
      )}
      {footer ? (
        <Link href={footer.href} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 hover:text-zinc-600">
          {footer.label}
          <ArrowRightIcon aria-hidden className="size-3.5" />
        </Link>
      ) : null}
    </section>
  );
}
