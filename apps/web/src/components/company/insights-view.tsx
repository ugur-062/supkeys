"use client";

import { PeriodSelect } from "@/components/company/period-select";
import { RatioBar } from "@/components/company/ui/mini-bars";
import { SectionHead } from "@/components/company/ui/stat-tile";
import { KpiCard } from "@/components/dashboard/analytics-primitives";
import { useInsights, type ViewDays } from "@/hooks/use-company-views";
import { pctChange } from "@/lib/dashboard/delta";
import { ArrowLongRightIcon, ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useState } from "react";

/**
 * İŞ ANALİZİ (2026-09-05, Europages "Business Insights"): görünürlük
 * (sparkline'lı KPI'lar), alıcı hunisi (görüntülenme → bilgi talebi → teklif →
 * kazanılan), en çok bakılan ürünler ve ziyaretçi şehirleri (oran çubuklu),
 * alıcı bağlantıları. Silver+ (Raporlar kapısıyla aynı).
 */
export function InsightsView() {
  const [days, setDays] = useState<ViewDays>(30);
  const q = useInsights(days);
  const d = q.data;
  const periodLabel = `Önceki ${days} güne göre`;
  const spark = (key: "profile" | "product") =>
    d?.series.map((s) => ({ key: s.date, value: s[key], label: fmtDay(s.date) })) ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">İş Analizi</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Ne kadar görünüyorsunuz, kim ilgileniyor, alıcılar size nasıl ulaşıyor. Sayılar seçili dönem için, rozet önceki dönemle kıyas.
          </p>
        </div>
        <PeriodSelect value={days} onChange={setDays} />
      </div>

      {q.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-zinc-100" />)}
        </div>
      ) : q.isError || !d ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">İş Analizi verisi alınamadı — tekrar deneyin.</p>
      ) : (
        <>
          <section aria-labelledby="gorunurluk" className="space-y-3">
            <SectionHead id="gorunurluk" title="Görünürlük" lead="Profil ve ürün sayfalarınız kaç kez açıldı, kaç firma kimliğiyle baktı." href="/company/sirketim/ziyaretciler" cta="Ziyaret Edenler" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <KpiCard label="Profil görüntülenmesi" value={d.views.profile.current} deltaPct={pctChange(d.views.profile.current, d.views.profile.previous)} deltaPeriodLabel={periodLabel} accent="blue" href="/company/sirketim/ziyaretciler" spark={spark("profile")} />
              <KpiCard label="Ürün görüntülenmesi" value={d.views.product.current} deltaPct={pctChange(d.views.product.current, d.views.product.previous)} deltaPeriodLabel={periodLabel} accent="emerald" href="/company/sirketim/ziyaretciler" spark={spark("product")} />
              <KpiCard label="Kimliği bilinen ziyaretçi" value={d.views.identifiedVisitors.current} deltaPct={pctChange(d.views.identifiedVisitors.current, d.views.identifiedVisitors.previous)} deltaPeriodLabel={periodLabel} accent="blue" href="/company/sirketim/ziyaretciler" hint="Ziyaret Edenler'de adlarıyla" />
            </div>
          </section>

          {/* Alıcı hunisi */}
          <section aria-label="Alıcı hunisi" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 sm:p-6">
            <p className="text-sm font-medium text-zinc-600">Alıcı hunisi</p>
            <ol className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { l: "Görüntülenme", v: d.views.profile.current + d.views.product.current, tone: "text-blue-600" },
                { l: "Bilgi talebi", v: d.inquiries.received, tone: "text-emerald-600" },
                { l: "Verilen teklif", v: d.bids.submitted, tone: "text-violet-600" },
                { l: "Kazanılan", v: d.bids.won, tone: "text-amber-600" },
              ].map((s, i, arr) => (
                <li key={s.l} className="relative rounded-xl bg-zinc-50 p-4">
                  <p className="text-xs font-medium text-zinc-500">{s.l}</p>
                  <p className={`mt-1 text-2xl font-semibold tabular-nums ${s.tone}`}>{s.v.toLocaleString("tr-TR")}</p>
                  {i < arr.length - 1 ? (
                    <ArrowLongRightIcon aria-hidden className="absolute top-1/2 -right-3.5 hidden size-5 -translate-y-1/2 text-zinc-300 md:block" />
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <RankCard
              title="En çok bakılan ürünler"
              empty="Bu dönemde ürün görüntülenmesi yok."
              rows={d.topProducts.map((p) => ({ key: p.id, label: p.name, value: p.views, unit: "görüntülenme" }))}
              accent="emerald"
              footer={{ href: "/company/satis/urunlerim", label: "Ürünlerim" }}
            />
            <RankCard
              title="Ziyaretçi şehirleri"
              empty="Ziyaretçilerin şehir bilgisi yok."
              rows={d.viewerCities.map((c) => ({ key: c.city, label: c.city, value: c.count, unit: "firma" }))}
              accent="blue"
              footer={{ href: "/company/sirketim/ziyaretciler", label: "Ziyaret Edenler" }}
            />
          </div>

          <section aria-labelledby="alici-baglantilari" className="space-y-3">
            <SectionHead id="alici-baglantilari" title="Alıcı bağlantıları" lead="Alıcılar size nasıl ulaşıyor, ne kadar hızlı yanıt veriyorsunuz." />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Gelen bilgi talebi" value={d.inquiries.received} accent="emerald" href="/company/satis/bilgi-talepleri" hint={d.inquiries.received > 0 ? `${d.inquiries.replied} yanıtlandı` : "Ürün sayfalarından gelen sorular"} />
              <KpiCard label="İlk yanıt süresi" value={d.inquiries.medianFirstReplyHours != null ? `${d.inquiries.medianFirstReplyHours} sa` : "—"} accent="emerald" hint="ortanca" href="/company/satis/bilgi-talepleri" />
              <KpiCard label="Gelen bağlantı daveti" value={d.connections.invitesReceived} accent="emerald" href="/company/satis/musterilerim" hint={d.connections.invitesReceived > 0 ? `${d.connections.accepted} kabul edildi` : "Bağlantı ağınızı büyütün"} />
              <KpiCard label="Talep daveti" value={d.listingInvitations} accent="emerald" href="/company/satis#acik-talepler" hint="Alıcılar sizi teklife çağırdı" />
            </div>
          </section>

          <section aria-labelledby="teklifler" className="space-y-3">
            <SectionHead id="teklifler" title="Teklifler" lead="Dönemde verdiğiniz teklifler ve kazanma oranı." href="/company/satis/tekliflerim" cta="Satış Tekliflerim" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Verilen teklif" value={d.bids.submitted} accent="slate" href="/company/satis/tekliflerim" />
              <KpiCard label="Kazanılan" value={d.bids.won} accent="slate" href="/company/satis/tekliflerim?status=WON" hint={d.bids.submitted > 0 ? `%${Math.round((d.bids.won / d.bids.submitted) * 100)} kazanma oranı` : undefined} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function fmtDay(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
}

function RankCard({
  title,
  rows,
  empty,
  accent,
  footer,
}: {
  title: string;
  rows: { key: string; label: string; value: number; unit: string }[];
  empty: string;
  accent: "blue" | "emerald";
  footer: { href: string; label: string };
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
                <span className="shrink-0 text-xs text-zinc-500">
                  <span className="font-semibold text-zinc-900">{r.value}</span> {r.unit}
                </span>
              </div>
              <div className="mt-1.5 pl-8">
                <RatioBar value={r.value} max={max} accent={accent} />
              </div>
            </li>
          ))}
        </ol>
      )}
      <Link href={footer.href} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 hover:text-zinc-600">
        {footer.label}
        <ArrowRightIcon aria-hidden className="size-3.5" />
      </Link>
    </section>
  );
}
