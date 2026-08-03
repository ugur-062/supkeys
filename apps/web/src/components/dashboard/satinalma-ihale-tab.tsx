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
import { cn } from "@/lib/utils";
import { FileX2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type SubTab = "own" | "company";

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
      {/* 4 KPI kartı — gerçek 12 aylık seri + önceki dönem deltası
          (stok metriği olan "Açık İhalelerim"de delta anlamsız → yok). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Açık İhalelerim"
          value={data.openCount}
          href="/company/satinalma/ihalelerim"
          accent="blue"
          spark={analytics?.kpiSeries.listings}
        />
        <KpiCard
          label="Gelen Teklifler"
          value={data.bidsReceived}
          href="/company/satinalma/ihalelerim"
          accent="blue"
          attention={data.bidsReceived > 0}
          deltaPct={compare ? analytics?.deltas.bids : undefined}
          spark={analytics?.kpiSeries.bids}
        />
        <KpiCard
          label="Kazandırılan İhaleler"
          value={data.awarded}
          href="/company/satinalma/ihalelerim"
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
          subtitle="İhale → teklif → kazandırma → sipariş → teslim (seçili dönem)"
          ariaLabel="Satınalma süreç hunisi"
          href="/company/satinalma/ihalelerim"
        >
          {analytics && analytics.funnel[0]!.count > 0 ? (
            <FunnelChart stages={analytics.funnel} accent="blue" />
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

/** Döngü süresi çizgisi — null aylar atlanır; hedef verisi platformda YOK
 *  (TODO: firma hedefi girilebilir olursa ReferenceLine eklenecek). */
function CycleTrendChart({
  points,
}: {
  points?: { key: string; label: string; value: number | null }[];
}) {
  const filled = (points ?? []).filter((p) => p.value != null);
  if (filled.length === 0) {
    return (
      <DashboardEmptyState
        title="Henüz döngü verisi yok"
        body="Kazandırdığın ihale siparişe dönüştüğünde açılış→sipariş süresi burada görünecek."
      />
    );
  }
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
          <YAxis tickLine={false} axisLine={false} width={30} tick={{ fontSize: 11, fill: "#94a3b8" }} />
          <Tooltip formatter={(v) => [`${Number(v ?? 0)} gün`, "Ortalama"]} />
          <Line
            type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={1.5}
            connectNulls dot={{ r: 2 }} isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
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
