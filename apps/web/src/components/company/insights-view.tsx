"use client";

import { PeriodSelect } from "@/components/company/period-select";
import { KpiCard } from "@/components/dashboard/analytics-primitives";
import { useInsights, type ViewDays } from "@/hooks/use-company-views";
import { pctChange } from "@/lib/dashboard/delta";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useState } from "react";

/**
 * İŞ ANALİZİ (2026-09-05, Europages "Business Insights"): görünürlük
 * (profil/ürün görüntülenmesi, kimliği bilinen ziyaretçi — önceki döneme
 * göre), en çok bakılan ürünler, ziyaretçi şehirleri, alıcı bağlantıları
 * (bilgi talebi + yanıt süresi, bağlantı ve talep davetleri), teklif/kazanma.
 * Silver+ (Raporlar kapısıyla aynı). Grafik yok — sayılar ve kısa listeler.
 */
export function InsightsView() {
  const [days, setDays] = useState<ViewDays>(30);
  const q = useInsights(days);
  const d = q.data;
  const periodLabel = `Önceki ${days} güne göre`;

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
            <h2 id="gorunurluk" className="text-lg font-semibold tracking-tight text-zinc-950">Görünürlük</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <KpiCard label="Profil görüntülenmesi" value={d.views.profile.current} deltaPct={pctChange(d.views.profile.current, d.views.profile.previous)} deltaPeriodLabel={periodLabel} accent="blue" href="/company/sirketim/ziyaretciler" />
              <KpiCard label="Ürün görüntülenmesi" value={d.views.product.current} deltaPct={pctChange(d.views.product.current, d.views.product.previous)} deltaPeriodLabel={periodLabel} accent="blue" href="/company/sirketim/ziyaretciler" />
              <KpiCard label="Kimliği bilinen ziyaretçi" value={d.views.identifiedVisitors.current} deltaPct={pctChange(d.views.identifiedVisitors.current, d.views.identifiedVisitors.previous)} deltaPeriodLabel={periodLabel} accent="blue" href="/company/sirketim/ziyaretciler" hint="Ziyaret Edenler'de adlarıyla" />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ListCard
              title="En çok bakılan ürünler"
              empty="Bu dönemde ürün görüntülenmesi yok."
              rows={d.topProducts.map((p) => ({ key: p.id, label: p.name, value: `${p.views} görüntülenme`, href: p.slug ? `/company/satis/urunlerim` : undefined }))}
              footer={{ href: "/company/satis/urunlerim", label: "Ürünlerim" }}
            />
            <ListCard
              title="Ziyaretçi şehirleri"
              empty="Ziyaretçilerin şehir bilgisi yok."
              rows={d.viewerCities.map((c) => ({ key: c.city, label: c.city, value: `${c.count} firma` }))}
              footer={{ href: "/company/sirketim/ziyaretciler", label: "Ziyaret Edenler" }}
            />
          </div>

          <section aria-labelledby="alici-baglantilari" className="space-y-3">
            <h2 id="alici-baglantilari" className="text-lg font-semibold tracking-tight text-zinc-950">Alıcı bağlantıları</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Gelen bilgi talebi" value={d.inquiries.received} accent="emerald" href="/company/satis/bilgi-talepleri" hint={d.inquiries.received > 0 ? `${d.inquiries.replied} yanıtlandı` : undefined} />
              <KpiCard label="İlk yanıt süresi" value={d.inquiries.medianFirstReplyHours != null ? `${d.inquiries.medianFirstReplyHours} sa` : "—"} accent="emerald" hint="ortanca" href="/company/satis/bilgi-talepleri" />
              <KpiCard label="Gelen bağlantı daveti" value={d.connections.invitesReceived} accent="emerald" href="/company/satis/musterilerim" hint={d.connections.invitesReceived > 0 ? `${d.connections.accepted} kabul edildi` : undefined} />
              <KpiCard label="Talep daveti" value={d.listingInvitations} accent="emerald" href="/company/satis#acik-talepler" hint="Alıcılar sizi teklife çağırdı" />
            </div>
          </section>

          <section aria-labelledby="teklifler" className="space-y-3">
            <h2 id="teklifler" className="text-lg font-semibold tracking-tight text-zinc-950">Teklifler</h2>
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

function ListCard({ title, rows, empty, footer }: { title: string; rows: { key: string; label: string; value: string; href?: string }[]; empty: string; footer: { href: string; label: string } }) {
  return (
    <section aria-label={title} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
      <h3 className="text-sm font-semibold text-zinc-950">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{empty}</p>
      ) : (
        <ol className="mt-3 divide-y divide-zinc-950/5">
          {rows.map((r, i) => (
            <li key={r.key} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-5 shrink-0 text-xs tabular-nums text-zinc-400">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-900">{r.href ? <Link href={r.href} className="hover:underline">{r.label}</Link> : r.label}</span>
              <span className="shrink-0 text-xs text-zinc-500">{r.value}</span>
            </li>
          ))}
        </ol>
      )}
      <Link href={footer.href} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 hover:text-zinc-600">
        {footer.label}
        <ArrowRightIcon aria-hidden className="size-3.5" />
      </Link>
    </section>
  );
}
