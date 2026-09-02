"use client";

/**
 * Satış panosunun GRAFİK sekmeleri — ayrı modül (perf turu, denetim P10).
 *
 * `satis-dashboard-view.tsx` içindeyken recharts (~100 kB gz) statik olarak
 * rotanın ilk yüküne giriyordu; oysa kullanıcı panoyu açtığında varsayılan
 * sekme grafiksiz. Ayrı dosya + `next/dynamic` ile grafik kodu ancak ilgili
 * sekme açıldığında iniyor. Sadece TAŞINDI — mantık değişmedi.
 */
import {
  ChartCard,
  DashboardEmptyState,
  FunnelChart,
} from "@/components/dashboard/analytics-primitives";
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
import { formatMoney } from "@/components/ui/money";
import { cn } from "@/lib/utils";
import Link from "next/link";

/** Gelir sekmesi — trend + kazanma yığını + TL pipeline. */
export function SatisGelirTab({
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
            ctaLabel="Açık Taleplere Göz At"
            ctaHref="/company/satis/acik-talepler"
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
            ctaLabel="Açık Taleplere Göz At"
            ctaHref="/company/satis/acik-talepler"
          />
        )}
      </ChartCard>
    </div>
  );
}

/** Müşteri sekmesi — Pareto + kategori kazanma + yanıt süresi + kaçırılan. */
export function SatisMusteriTab({
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
                href="/company/satis/acik-talepler"
                className="whitespace-nowrap text-xs font-semibold text-zinc-700 underline hover:text-zinc-950"
              >
                Açık satın alma taleplerine göz at
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
        href="/company/satis/acik-talepler"
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
              Tutar hesaplanamaz — teklif verilmeden kapanan satın alma talebinin değeri
              bilinmez.
            </p>
          </div>
        ) : (
          <DashboardEmptyState
            title="Kaçırılan fırsat yok"
            body="Son 12 ayda teklifsiz kapanan davetli satın alma talebiniz bulunmuyor."
          />
        )}
      </ChartCard>
    </div>
  );
}
