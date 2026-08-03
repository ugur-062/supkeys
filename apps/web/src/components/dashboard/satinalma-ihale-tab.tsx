"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import {
  ChartCard,
  DashboardEmptyState,
  FunnelChart,
  KpiCard,
} from "@/components/dashboard/analytics-primitives";
import type {
  SatinalmaAnalytics,
  SatinalmaDashboard,
} from "@/hooks/use-company-dashboard";
import { formatCompactMoney, formatMoney } from "@/components/ui/money";
import { cn } from "@/lib/utils";
import { FileX2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type SubTab = "own" | "company";

/** Faz 5 — huni aşaması → filtreli liste (birebir filtre yoksa düz liste;
 *  yanlış filtre vermekten iyidir). */
const FUNNEL_STAGE_HREF: Record<string, string> = {
  listings: "/company/satinalma/ihalelerim",
  bids: "/company/satinalma/ihalelerim",
  awarded: "/company/satinalma/ihalelerim?status=AWARDED",
  orders: "/company/satinalma/siparisler",
  delivered: "/company/satinalma/siparisler?status=DELIVERED",
};

/** Satınalma panosu — İhale sekmesi (eski ihale-tab markup'ı, yeni veri). */
export function SatinalmaIhaleTab({
  data,
  analytics,
  compare = false,
}: {
  data: SatinalmaDashboard;
  analytics?: SatinalmaAnalytics;
  /** Faz 3: deltalar yalnız "önceki dönemle karşılaştır" açıkken çizilir. */
  compare?: boolean;
}) {
  const [subTab, setSubTab] = useState<SubTab>("own");
  const rows =
    subTab === "own" ? data.openTendersOwn : data.openTendersCompany;

  return (
    <div className="space-y-6">
      {/* Faz 4.1 — birincil satır TUTAR (TRY-only, etiketle söylenir);
          adet kartları ikinci satıra indi. */}
      {analytics ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Dönem Harcaması"
            value={formatCompactMoney(analytics.money.periodSpend)}
            valueTitle={formatMoney(analytics.money.periodSpend)}
            href="/company/satinalma/siparisler"
            accent="blue"
            deltaPct={compare ? analytics.money.deltas.periodSpend : undefined}
            hint="dönem içi siparişler · yalnız TRY"
          />
          <KpiCard
            label="Açık Sipariş Taahhüdü"
            value={formatCompactMoney(analytics.money.openCommitment)}
            valueTitle={formatMoney(analytics.money.openCommitment)}
            href="/company/satinalma/siparisler"
            accent="blue"
            hint="ödenmemiş sipariş bakiyesi · yalnız TRY"
          />
          <KpiCard
            label="30 Günde Vadesi Gelen"
            value={formatCompactMoney(analytics.money.dueIn30d)}
            valueTitle={formatMoney(analytics.money.dueIn30d)}
            href="/company/satinalma/siparisler?status=DELIVERED"
            accent="blue"
            attention={analytics.money.dueIn30d > 0}
            hint={
              analytics.money.dueIn30d > 0
                ? "ödeme planla — vade 30 gün içinde"
                : "vadesi yaklaşan ödeme yok"
            }
          />
          <KpiCard
            label="Gerçekleşen Tasarruf"
            value={formatCompactMoney(analytics.money.realizedSavings)}
            valueTitle={formatMoney(analytics.money.realizedSavings)}
            href="/company/satinalma/raporlar/tasarruf"
            accent="blue"
            deltaPct={
              compare ? analytics.money.deltas.realizedSavings : undefined
            }
            spark={analytics.savingsTrend}
            sparkLabels={{ valueSuffix: " ₺" }}
            hint="hedef fiyata göre · yalnız TRY"
          />
        </div>
      ) : null}

      {/* Adet KPI satırı — gerçek 12 aylık seri + (compare açıkken) delta.
          Vurgu kuralı (Faz 4.4): yalnız aksiyon bekleyen > 0 + neden metni. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Açık İhalelerim"
          value={data.openCount}
          href="/company/satinalma/ihalelerim?status=OPEN"
          accent="blue"
          spark={analytics?.kpiSeries.listings}
        />
        <KpiCard
          label="Gelen Teklifler"
          value={data.bidsReceived}
          href="/company/satinalma/ihalelerim?status=IN_AWARD"
          accent="blue"
          attention={(analytics?.actions.awaitingDecision ?? 0) > 0}
          hint={
            (analytics?.actions.awaitingDecision ?? 0) > 0
              ? `${analytics!.actions.awaitingDecision} ihale karar bekliyor`
              : undefined
          }
          deltaPct={compare ? analytics?.deltas.bids : undefined}
          spark={analytics?.kpiSeries.bids}
        />
        <KpiCard
          label="Kazandırılan İhaleler"
          value={data.awarded}
          href="/company/satinalma/ihalelerim?status=AWARDED"
          accent="blue"
          deltaPct={compare ? analytics?.deltas.awarded : undefined}
          spark={analytics?.kpiSeries.awarded}
        />
        <KpiCard
          label="Devam Eden Siparişler"
          value={data.ongoingOrders}
          href="/company/satinalma/siparisler"
          accent="blue"
          deltaPct={compare ? analytics?.deltas.orders : undefined}
          spark={analytics?.kpiSeries.orders}
        />
      </div>

      {/* Ana grafik: süreç hunisi + döngü süresi trendi. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Süreç Hunisi"
          subtitle="Dönemde açılan ihalelerin bugünkü aşaması (kohort — her aşama öncekinin alt kümesi)"
          ariaLabel="Satınalma süreç hunisi"
          href="/company/satinalma/ihalelerim"
        >
          {analytics && analytics.funnel[0]!.count > 0 ? (
            <FunnelChart
              stages={analytics.funnel.map((f) => ({
                ...f,
                href: FUNNEL_STAGE_HREF[f.key],
              }))}
              accent="blue"
            />
          ) : (
            <DashboardEmptyState
              title="Henüz huni verisi yok"
              body="İlk ihaleni açıp teklif topladığında süreç dönüşümü burada görünecek."
              ctaLabel="İhale Aç"
              ctaHref="/company/satinalma/ihalelerim/yeni"
            />
          )}
        </ChartCard>
        <ChartCard
          title="Döngü Süresi"
          subtitle="İhale açılışından siparişe geçen ortalama gün (aylık)"
          ariaLabel="Döngü süresi trendi"
          rangeBadge="son 12 ay"
        >
          <CycleTrendChart points={analytics?.cycleTrend} />
        </ChartCard>
      </div>

      {/* Teklife Açık İhaleler paneli */}
      <section className="card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-950/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-2 w-2 rounded-full bg-success-500" />
            <h2 className="text-base font-semibold text-zinc-950">
              Teklife Açık İhaleler
            </h2>
          </div>
          <Link
            href="/company/satinalma/ihalelerim"
            className="text-sm font-semibold text-zinc-900 hover:text-zinc-600"
          >
            Tümünü İncele →
          </Link>
        </header>

        {/* Alt sekmeler */}
        <div className="flex gap-6 border-b border-zinc-950/5 px-5">
          <button
            type="button"
            onClick={() => setSubTab("own")}
            className={cn(
              "-mb-px border-b-2 py-2.5 text-sm font-medium transition-colors",
              subTab === "own"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700",
            )}
          >
            Oluşturduğun İhaleler ({data.openTendersOwn.length} İhale)
          </button>
          <button
            type="button"
            onClick={() => setSubTab("company")}
            className={cn(
              "-mb-px border-b-2 py-2.5 text-sm font-medium transition-colors",
              subTab === "company"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700",
            )}
          >
            Firmanın İhaleleri ({data.openTendersCompany.length} İhale)
          </button>
        </div>

        {/* Tablo / boş durum */}
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-5 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100">
              <FileX2 className="h-7 w-7 text-zinc-400" />
            </div>
            <p className="text-sm text-zinc-500">
              Görüntülenecek bir ihale bulunmamaktadır.
            </p>
          </div>
        ) : (
          <div className="px-3 [--gutter:--spacing(5)]">
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>İhale No</TableHeader>
                  <TableHeader>İhale Adı</TableHeader>
                  <TableHeader>Açılış Tarihi</TableHeader>
                  <TableHeader>Kapanış</TableHeader>
                  <TableHeader className="text-right">Gelen Teklif</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums text-xs text-zinc-600">
                      {r.tenderNumber}
                    </TableCell>
                    <TableCell className="text-zinc-900">
                      <Link
                        href={`/company/ilan/${r.id}`}
                        className="font-medium hover:text-zinc-600"
                      >
                        {r.title}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums text-zinc-600">
                      {formatDate(r.openedAt)}
                    </TableCell>
                    <TableCell>
                      <DaysLeftBadge closesAt={r.closesAt} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-700">
                      {r.bidCount ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

/** Kapanışa kalan gün rozeti: ≤3 kırmızı, ≤7 amber, aksi nötr. */
function DaysLeftBadge({ closesAt }: { closesAt: string }) {
  const days = Math.ceil(
    (new Date(closesAt).getTime() - Date.now()) / 86_400_000,
  );
  if (days < 0)
    return <span className="text-xs text-zinc-400">Kapandı</span>;
  const cls =
    days <= 3
      ? "bg-rose-50 text-rose-700"
      : days <= 7
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${cls}`}
    >
      {days === 0 ? "Bugün" : `${days} gün kaldı`}
    </span>
  );
}

/** Döngü süresi — dürüstlük kuralları (Faz 5.2):
 *  - < 3 dolu ay: grafik YOK — tek büyük sayı + "en az 3 ay" notu (tek
 *    noktayı çizgi/dikey alan olarak çizmek yanıltıcıydı),
 *  - eksen tam sayı tick (ondalık gün yok); tüm değerler < 1 günse saate
 *    çevrilir,
 *  - null aylar çizgiyle BAĞLANMAZ (connectNulls yok) — izole ay dot kalır.
 *  Hedef verisi platformda YOK (TODO: firma hedefi girilirse ReferenceLine). */
function CycleTrendChart({
  points,
}: {
  points?: { key: string; label: string; value: number | null }[];
}) {
  const filled = (points ?? []).filter(
    (p): p is { key: string; label: string; value: number } => p.value != null,
  );
  if (filled.length === 0) {
    return (
      <DashboardEmptyState
        title="Henüz döngü verisi yok"
        body="Kazandırdığın ihale siparişe dönüştüğünde açılış→sipariş süresi burada görünecek."
      />
    );
  }

  const avgDays =
    filled.reduce((s, p) => s + p.value, 0) / filled.length;

  if (filled.length < 3) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-1">
        <p className="text-4xl font-semibold tracking-tight tabular-nums text-slate-950">
          {formatDaysOrHours(avgDays)}
        </p>
        <p className="text-sm text-slate-500">
          ortalama · önceki dönem —
        </p>
        <p className="text-xs text-slate-400">
          Trend için en az 3 ay veri gerekli.
        </p>
      </div>
    );
  }

  // Tüm değerler < 1 gün → saat ekseni (0,4 gün gibi tick'ler okunmuyordu).
  const useHours = filled.every((p) => p.value < 1);
  const data = useHours
    ? (points ?? []).map((p) =>
        p.value == null ? p : { ...p, value: Math.round(p.value * 24) },
      )
    : points;
  const unit = useHours ? "saat" : "gün";

  return (
    <div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={30}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              allowDecimals={false}
            />
            <Tooltip formatter={(v) => [`${Number(v ?? 0)} ${unit}`, "Ortalama"]} />
            <Line
              type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={1.5}
              dot={{ r: 3 }} isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-right text-[11px] text-slate-400">{unit}</p>
    </div>
  );
}

/** < 1 gün ortalamayı saate çevirerek yazar ("14 saat" / "1,4 gün"). */
function formatDaysOrHours(days: number): string {
  if (days < 1) return `${Math.round(days * 24)} saat`;
  return `${days.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} gün`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
