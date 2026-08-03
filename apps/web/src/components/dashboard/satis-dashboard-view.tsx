"use client";

import { cn } from "@/lib/utils";
import { ActionCenter } from "@/components/dashboard/action-center";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import {
  ChartCard,
  DashboardEmptyState,
  FunnelChart,
  KpiCard,
} from "@/components/dashboard/analytics-primitives";
import { useSatisAnalytics } from "@/hooks/use-company-dashboard";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { useDashboardParams } from "@/hooks/use-dashboard-params";
import {
  Area,
  AreaChart,
  Bar as RBar,
  BarChart as RBarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer as RContainer,
  Tooltip as RTooltip,
  XAxis as RXAxis,
  YAxis as RYAxis,
} from "recharts";
import { TcmbRatesChip } from "@/components/tcmb-rates-widget";
import { ErrorState } from "@/components/ui/error-state";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useSatisStats } from "@/hooks/use-company-dashboard";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { ArrowRight } from "lucide-react";
import { formatCompactMoney, formatMoney } from "@/components/ui/money";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Satış panosu — karşılama + CTA, aksiyon merkezi, adet KPI satırı + tutar
 * KPI satırı (eski "Performans" kartı — aralığı kart üstünde açıkça yazar);
 * tek kolon. ("Son Aktiviteler" akışı kullanıcı isteğiyle kaldırıldı,
 * 2026-08-03.) Blok sırası satınalma paneliyle hizalı (Faz 7.6);
 * satınalmanın İhale/Tasarruf/Tedarikçi sekmeleri veri örgütü gereği
 * korunur — bilinçli sapma. Görsel dil: zinc/Catalyst.
 */
export function SatisDashboardView() {
  const { company } = useCompanyAuth();
  const stats = useSatisStats();

  // Hydration-safe tarih (sunucu/istemci farkı olmasın).
  const [todayLabel, setTodayLabel] = useState("");
  useEffect(() => {
    setTodayLabel(format(new Date(), "d MMMM yyyy, EEEE", { locale: tr }));
  }, []);

  const s = stats.data;
  const loading = stats.isLoading;
  // Faz 3 — dönem + sekme + karşılaştır + özel aralık URL'de (satınalma ile
  // ortak useDashboardParams; geri tuşu çalışır, sayfa paylaşılabilir).
  const { period, from, to, compare, tab, setParams } = useDashboardParams(
    "teklif",
    ["teklif", "gelir", "musteri"],
  );
  const analytics = useSatisAnalytics({ period, from, to });
  // Faz 7.3: yükleme artık iskeletle çözülür (aşağıda) — kartlara gelindiyse
  // veri var; "—" yalnız "değer gerçekten yok" anlamında kalır.
  const val = (n: number | undefined) => n ?? 0;

  return (
    <div className="space-y-8">
      {/* Karşılama başlığı — satınalma paneliyle aynı biçim */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="mb-1.5 text-2xl font-semibold leading-tight tracking-tight text-zinc-950">
            Satış paneli
          </h1>
          <p className="text-[15px] text-zinc-500">
            {company?.name ?? "Rothern"}
            {todayLabel ? (
              <>
                <span className="mx-2 text-zinc-300">·</span>
                <span>{todayLabel}</span>
              </>
            ) : null}
          </p>
        </div>
        {/* Kur çipi başlıkta; kazanma-oranı şeridi raporlar hub'ına taşındı. */}
        <div className="flex flex-wrap items-center gap-3">
          <TcmbRatesChip />
          <PeriodControls
            period={period}
            from={from}
            to={to}
            compare={compare}
            onChange={setParams}
          />
          <Link
            href="/company/satis/acik-ihaleler"
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            İhaleleri Görüntüle
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      {/* Faz 8.3 — yeni satıcı: boş kart yığını yerine ilk-çalıştırma listesi
          (satınalma ile aynı bileşen; tamamlanınca kendiliğinden kaybolur). */}
      {s &&
      s.invitations.active === 0 &&
      s.bids.active === 0 &&
      s.wonTenders === 0 &&
      s.orders.pending === 0 &&
      s.revenue.total === 0 ? (
        <OnboardingChecklist
          steps={[
            {
              key: "profile",
              label: "Firma profilini tamamla",
              done: !!company?.publicEnabled,
              href: "/company/satis/profilim",
            },
            {
              key: "discover",
              label: "Açık ihaleleri keşfet",
              done: false,
              href: "/company/satis/acik-ihaleler",
            },
            {
              key: "bid",
              label: "İlk teklifini ver",
              done: false,
              href: "/company/satis/acik-ihaleler",
            },
          ]}
        />
      ) : null}

      {/* Aksiyon merkezi — "bugün ne yapmalıyım" (Faz 2: veri + sıralama
          backend'de, metin haritası ACTION_ROWS'ta). */}
      <ActionCenter portal="satis" />


      {/* Hata → retry: aksi halde tüm KPI'lar sessizce 0 görünüp yanıltır. */}
      {stats.isError && !s ? (
        <ErrorState
          title="Veri alınamadı"
          onRetry={() => void stats.refetch()}
        />
      ) : null}

      {/* Sekmeler: Teklif / Gelir / Müşteri — segmentli kontrol (düz zemin
          üzerindeki alt-çizgi sekmeler kaybolyordu; aktif = beyaz pill +
          panel rengi, satınalma ile aynı dil). */}
      <div
        role="tablist"
        aria-label="Satış panosu bölümleri"
        className="inline-flex w-fit gap-1 rounded-xl bg-zinc-200/60 p-1 ring-1 ring-zinc-950/5"
      >
        {(
          [
            ["teklif", "Teklif"],
            ["gelir", "Gelir"],
            ["musteri", "Müşteri"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams({ tab: key })}
            className={cn(
              "rounded-lg px-5 py-2 text-sm font-semibold whitespace-nowrap transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40",
              tab === key
                ? "bg-white text-emerald-700 shadow-sm ring-1 ring-zinc-950/5"
                : "text-zinc-500 hover:text-zinc-900",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "gelir" ? (
        <SatisGelirTab analytics={analytics.data} loading={analytics.isLoading} />
      ) : tab === "musteri" ? (
        <SatisMusteriTab analytics={analytics.data} loading={analytics.isLoading} />
      ) : loading && !s ? (
        /* Faz 7.3: '—'/'…' karışımı yerine gerçek boyutlu iskelet. */
        <div className="space-y-4" aria-hidden>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-zinc-200/60" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-zinc-200/60" />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-xl bg-zinc-200/60" />
        </div>
      ) : (
      <>
      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Vurgu kuralı (Faz 4.4): davet VARLIĞI değil, yanıt BEKLEYEN davet
            vurgular — nedeni alt metinde. */}
        <KpiCard
          label="Aktif Davetler"
          value={val(s?.invitations.active)}
          href="/company/satis/acik-ihaleler"
          accent="emerald"
          attention={(analytics.data?.actions.unansweredInvites ?? 0) > 0}
          hint={
            (analytics.data?.actions.unansweredInvites ?? 0) > 0
              ? `${analytics.data!.actions.unansweredInvites} davet teklifini bekliyor`
              : undefined
          }
        />
        <KpiCard
          label="Aktif Tekliflerim"
          value={val(s?.bids.active)}
          href="/company/satis/tekliflerim"
          accent="emerald"
          deltaPct={compare ? analytics.data?.deltas.bidsSubmitted : undefined}
          spark={analytics.data?.kpiSeries.bidsSubmitted}
        />
        <KpiCard
          label="Kazanılan İhale"
          value={val(s?.wonTenders)}
          href="/company/satis/tekliflerim"
          accent="emerald"
          spark={analytics.data?.kpiSeries.won}
        />
        <KpiCard
          label="Aktif Sipariş"
          value={val(s?.orders.pending)}
          href="/company/satis/siparisler?status=PENDING"
          accent="emerald"
          deltaPct={compare ? analytics.data?.deltas.orders : undefined}
          spark={analytics.data?.kpiSeries.orders}
        />
      </div>

      {/* Faz 7.4: "Performans" kartı kaldırıldı — global dönem seçicisiyle
          çelişen "son 30 gün ve toplam" özeti, aralığını AÇIKÇA söyleyen
          KPI kartlarına taşındı (tutar satırı — satınalma ile hizalı). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Son 30 Gün Teklif"
          value={s?.last30Days.bidsSubmitted ?? 0}
          href="/company/satis/tekliflerim"
          accent="emerald"
          deltaPct={
            compare && s && s.last30Days.prevBidsSubmitted > 0
              ? Math.round(
                  ((s.last30Days.bidsSubmitted - s.last30Days.prevBidsSubmitted) /
                    s.last30Days.prevBidsSubmitted) *
                    100,
                )
              : undefined
          }
          hint="son 30 gün · önceki 30 güne göre"
        />
        <KpiCard
          label="Toplam Gelir"
          value={formatCompactMoney(s?.revenue.total ?? 0)}
          valueTitle={formatMoney(s?.revenue.total ?? 0)}
          href="/company/satis/siparisler"
          accent="emerald"
          deltaPct={
            compare && s && s.revenue.prev30 > 0
              ? Math.round(
                  ((s.revenue.last30 - s.revenue.prev30) / s.revenue.prev30) * 100,
                )
              : undefined
          }
          hint="tüm zamanlar · yalnız TRY"
        />
        <KpiCard
          label="Bağlı Müşteri"
          value={s?.buyers.active ?? 0}
          href="/company/satis/musterilerim"
          accent="emerald"
          hint="aktif bağlantı"
        />
      </div>

      {/* "Son Aktiviteler" akışı anasayfadan KALDIRILDI (kullanıcı isteği,
          2026-08-03) — olay geçmişi bildirim zilinde zaten mevcut. */}
      </>
      )}
    </div>
  );
}

/** Gelir sekmesi — trend + kazanma yığını + TL pipeline. */
function SatisGelirTab({
  analytics,
  loading,
}: {
  analytics?: import("@/hooks/use-company-dashboard").SatisAnalytics;
  loading: boolean;
}) {
  if (loading || !analytics) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-xl bg-zinc-200/60" />
        ))}
      </div>
    );
  }
  const AXIS = { fontSize: 11, fill: "#94a3b8" };
  const hasRevenue = analytics.revenueTrend.some((p) => p.value > 0);
  const hasWinLoss = analytics.winLoss.some(
    (w) => w.won + w.lost + w.pending > 0,
  );
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard
        title="Gelir Trendi"
        rangeBadge="son 12 ay"
        subtitle="Aylık gelir (alan) + yılbaşından beri kümülatif (çizgi) — TRY satışlar"
        ariaLabel="Aylık gelir trendi"
        href="/company/satis/siparisler"
        className="lg:col-span-2"
      >
        {hasRevenue ? (
          <div className="h-56">
            <RContainer width="100%" height="100%">
              <ComposedChart data={analytics.revenueTrend}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <RXAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
                <RYAxis tickLine={false} axisLine={false} width={56} tick={AXIS} />
                <RTooltip
                  formatter={(v, n) => [
                    formatMoney(Number(v ?? 0), "TRY"),
                    n === "value" ? "Aylık" : "Kümülatif",
                  ]}
                />
                <Area type="monotone" dataKey="value" stroke="#059669" strokeWidth={1.5} fill="#059669" fillOpacity={0.12} isAnimationActive={false} />
                <Line type="monotone" dataKey="cumulative" stroke="#065f46" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </RContainer>
          </div>
        ) : (
          <DashboardEmptyState
            title="Henüz gelir verisi yok"
            body="İlk satışın siparişe dönüştüğünde aylık gelir burada birikecek."
            ctaLabel="Açık İhalelere Göz At"
            ctaHref="/company/satis/acik-ihaleler"
          />
        )}
      </ChartCard>

      <ChartCard
        title="Kazanma / Kaybetme Dağılımı"
        rangeBadge="son 12 ay"
        subtitle="Aylık karara bağlanan teklifler (kazanıldı · kaybedildi · beklemede)"
        ariaLabel="Aylık kazanma kaybetme dağılımı"
        href="/company/satis/tekliflerim"
      >
        {hasWinLoss ? (
          <div className="h-52">
            <RContainer width="100%" height="100%">
              <RBarChart data={analytics.winLoss}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <RXAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
                <RYAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} tick={AXIS} />
                <RTooltip
                  formatter={(v, n) => [
                    Number(v ?? 0),
                    n === "won" ? "Kazanıldı" : n === "lost" ? "Kaybedildi" : "Beklemede",
                  ]}
                />
                <RBar dataKey="won" stackId="w" fill="#059669" />
                <RBar dataKey="lost" stackId="w" fill="#e11d48" />
                <RBar dataKey="pending" stackId="w" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
              </RBarChart>
            </RContainer>
          </div>
        ) : (
          <DashboardEmptyState
            title="Henüz karar verisi yok"
            body="Tekliflerin karara bağlandıkça aylık kazanma/kaybetme dağılımı burada görünecek."
          />
        )}
      </ChartCard>

      {/* Faz 7.2: "Pipeline" → Satış Hunisi (tek dil). */}
      <ChartCard
        title="Satış Hunisi"
        subtitle="Davet adet; sonraki aşamalar TL (teklifsiz davetin tutarı bilinemez)"
        ariaLabel="Satış hunisi"
      >
        {analytics.pipeline.some((p) => p.count > 0) ? (
          <FunnelChart
            accent="emerald"
            stages={analytics.pipeline.map((p) => ({
              key: p.key,
              label:
                p.amountTry != null
                  ? `${p.label} (${formatMoney(p.amountTry, "TRY")})`
                  : p.label,
              count: p.count,
              // Davet → teklif farklı evren (kohort değil) — oran yanıltır
              // (%900 gibi); yalnız karşılaştırılabilir adımlarda oran çıkar.
              noConversion: p.key === "submitted",
            }))}
          />
        ) : (
          <DashboardEmptyState
            title="Satış hunisi boş"
            body="Davet alıp teklif verdikçe aşamalar burada dolacak."
            ctaLabel="Açık İhalelere Göz At"
            ctaHref="/company/satis/acik-ihaleler"
          />
        )}
      </ChartCard>
    </div>
  );
}

/** Müşteri sekmesi — Pareto + kategori kazanma + yanıt süresi + kaçırılan. */
function SatisMusteriTab({
  analytics,
  loading,
}: {
  analytics?: import("@/hooks/use-company-dashboard").SatisAnalytics;
  loading: boolean;
}) {
  if (loading || !analytics) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-xl bg-zinc-200/60" />
        ))}
      </div>
    );
  }
  const AXIS = { fontSize: 11, fill: "#94a3b8" };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard
        title="Müşteri Konsantrasyonu"
        rangeBadge="son 12 ay"
        subtitle="En iyi 5 müşterinin gelir payı (son 12 ay, TRY)"
        ariaLabel="Müşteri konsantrasyonu Pareto"
        right={
          analytics.pareto.concentrationWarning ? (
            /* Faz 7.5: uyarı aksiyonsuz kalmasın — müşteri tabanını
               genişletmenin yolu yeni ihalelere teklif vermek. */
            <span className="flex flex-col items-end gap-1">
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                ⚠ Konsantrasyon riski
              </span>
              <Link
                href="/company/satis/acik-ihaleler"
                className="whitespace-nowrap text-xs font-semibold text-zinc-700 underline hover:text-zinc-950"
              >
                Açık ihalelere göz at
              </Link>
            </span>
          ) : undefined
        }
      >
        {analytics.pareto.rows.length > 0 ? (
          <ul className="space-y-2.5">
            {analytics.pareto.rows.map((r) => (
              <li key={r.name}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-slate-600" title={r.name}>
                    {r.name}
                  </span>
                  <span className="tabular-nums text-slate-900">
                    {formatMoney(r.amount, "TRY")}
                    <span
                      className={cn(
                        "ml-1.5 font-semibold",
                        r.sharePct > 40 ? "text-amber-600" : "text-slate-400",
                      )}
                    >
                      %{r.sharePct}
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      r.sharePct > 40 ? "bg-amber-500" : "bg-emerald-600",
                    )}
                    style={{ width: `${Math.max(2, r.sharePct)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <DashboardEmptyState
            title="Henüz müşteri geliri yok"
            body="Satışların tamamlandıkça müşteri dağılımı burada görünecek."
          />
        )}
      </ChartCard>

      <ChartCard
        title="Kategori Bazlı Kazanma Oranı"
        rangeBadge="son 12 ay"
        subtitle="Hangi kategorilerde güçlüyüz (karara bağlanan teklifler, son 12 ay)"
        ariaLabel="Kategori bazlı kazanma oranı"
      >
        {analytics.categoryWinRate.length > 0 ? (
          <ul className="space-y-2.5">
            {analytics.categoryWinRate.map((c) => (
              <li key={c.label}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-slate-600" title={c.label}>
                    {c.label}
                  </span>
                  <span className="tabular-nums text-slate-900">
                    <strong>%{c.winPct}</strong>
                    <span className="ml-1 text-slate-400">
                      ({c.decided} teklif)
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-600"
                    style={{ width: `${Math.max(2, c.winPct)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <DashboardEmptyState
            title="Henüz karar verisi yok"
            body="Tekliflerin sonuçlandıkça kategori bazlı gücün burada görünecek."
          />
        )}
      </ChartCard>

      <ChartCard
        title="Teklif Yanıt Süresi"
        rangeBadge="son 12 ay"
        subtitle="Davetten teklife geçen ortalama süre (saat, aylık)"
        ariaLabel="Teklif yanıt süresi trendi"
      >
        {analytics.responseTrend.some((p) => p.value != null) ? (
          <div className="h-48">
            <RContainer width="100%" height="100%">
              <AreaChart data={analytics.responseTrend}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <RXAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
                <RYAxis tickLine={false} axisLine={false} width={34} tick={AXIS} />
                <RTooltip formatter={(v) => [`${Number(v ?? 0)} sa`, "Ortalama"]} />
                <Area type="monotone" dataKey="value" stroke="#059669" strokeWidth={1.5} fill="#059669" fillOpacity={0.1} connectNulls isAnimationActive={false} />
              </AreaChart>
            </RContainer>
          </div>
        ) : (
          <DashboardEmptyState
            title="Henüz yanıt verisi yok"
            body="Davetlere teklif verdikçe ortalama yanıt süren burada görünecek."
          />
        )}
      </ChartCard>

      <ChartCard
        title="Kaçırılan Fırsatlar"
        rangeBadge="son 12 ay"
        subtitle="Teklif verilmeden süresi dolan davetler (son 12 ay)"
        ariaLabel="Kaçırılan fırsatlar"
        href="/company/satis/acik-ihaleler"
      >
        {analytics.missed.count > 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-1">
            <p className="text-4xl font-semibold tracking-tight tabular-nums text-rose-600">
              {analytics.missed.count}
            </p>
            <p className="text-sm text-slate-500">davet teklifsiz kapandı</p>
            {/* TODO: toplam tutar bilinemez — teklif verilmedi, ihale toplam
                değeri platformda tutulmuyor. */}
            <p className="text-xs text-slate-400">
              Tutar hesaplanamaz — teklif verilmeden kapanan ihalenin değeri
              bilinmez.
            </p>
          </div>
        ) : (
          <DashboardEmptyState
            title="Kaçırılan fırsat yok"
            body="Son 12 ayda teklifsiz kapanan davetli ihalen bulunmuyor."
          />
        )}
      </ChartCard>
    </div>
  );
}
