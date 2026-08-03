"use client";

import {
  Bar,
  BarChart,
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
  // Faz 6.2 — varsayılan sıralama KAPANIŞA göre artan (ihale no değil);
  // kolon başlıkları tıklanınca yön/kolon değişir.
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "closes",
    dir: 1,
  });
  const baseRows =
    subTab === "own" ? data.openTendersOwn : data.openTendersCompany;
  const rows = [...baseRows].sort((a, b) => sort.dir * compareRows(a, b, sort.key));
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

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

      {/* Nakit Takvimi — tedarikçi sekmesinden anasayfa gövdesine taşındı
          (Faz 6.3): ödeme yükü üçüncü sekmede saklı kalmasın. */}
      <ChartCard
        title="Nakit Takvimi"
        subtitle="Önümüzdeki 30 günün ödeme yükü (haftalık, TRY siparişler)"
        ariaLabel="30 günlük ödeme takvimi"
        href="/company/satinalma/siparisler?status=DELIVERED"
      >
        {analytics && analytics.cashCalendar.some((w) => w.amount > 0) ? (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.cashCalendar}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <Tooltip formatter={(v) => [formatMoney(Number(v ?? 0), "TRY"), "Ödeme"]} />
                <Bar dataKey="amount" fill="#2563eb" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <DashboardEmptyState
            title="Önümüzdeki 30 günde vadesi gelen ödeme yok"
            body="Teslim alınan siparişlerin vadeleri yaklaştıkça haftalık ödeme yükün burada görünecek."
          />
        )}
      </ChartCard>

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
                  <SortableHeader label="İhale No" k="number" sort={sort} onSort={toggleSort} />
                  <TableHeader>İhale Adı</TableHeader>
                  <SortableHeader label="Açılış Tarihi" k="opened" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Kapanış" k="closes" sort={sort} onSort={toggleSort} />
                  <SortableHeader
                    label="Gelen Teklif" k="bids" sort={sort} onSort={toggleSort}
                    className="text-right"
                  />
                  <TableHeader>Rekabet</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums text-xs text-zinc-600">
                      {r.tenderNumber}
                    </TableCell>
                    <TableCell className="max-w-64 text-zinc-900">
                      <Link
                        href={`/company/ilan/${r.id}`}
                        className="block truncate font-medium hover:text-zinc-600"
                        title={r.title}
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
                    <TableCell>
                      <CompetitionCell row={r} />
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

type SortKey = "number" | "opened" | "closes" | "bids";

function compareRows(
  a: { tenderNumber: string; openedAt: string; closesAt: string; bidCount?: number },
  b: { tenderNumber: string; openedAt: string; closesAt: string; bidCount?: number },
  key: SortKey,
): number {
  switch (key) {
    case "number":
      return a.tenderNumber.localeCompare(b.tenderNumber, "tr");
    case "opened":
      return Date.parse(a.openedAt) - Date.parse(b.openedAt);
    case "closes":
      return Date.parse(a.closesAt) - Date.parse(b.closesAt);
    case "bids":
      return (a.bidCount ?? 0) - (b.bidCount ?? 0);
  }
}

/** Sıralanabilir kolon başlığı — aria-sort + yön oku. */
function SortableHeader({
  label,
  k,
  sort,
  onSort,
  className,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <TableHeader
      className={className}
      aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-zinc-900",
          active && "text-zinc-900",
        )}
      >
        {label}
        <span aria-hidden className={cn("text-[10px]", !active && "opacity-30")}>
          {active ? (sort.dir === 1 ? "▲" : "▼") : "▲"}
        </span>
      </button>
    </TableHeader>
  );
}

/** Faz 6.1 — Rekabet kolonu: <2 teklif = düşük rekabet + satır içi aksiyon
 *  ("Davetli Ekle" → ihale detayı; süre uzatma da detaydadır). */
function CompetitionCell({
  row,
}: {
  row: { id: string; closesAt: string; bidCount?: number };
}) {
  const bids = row.bidCount ?? 0;
  if (bids >= 2) {
    return <span className="text-xs text-zinc-400">Sağlıklı</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 whitespace-nowrap">
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
        {bids === 0 ? "0 teklif" : "1 teklif"}
      </span>
      <Link
        href={`/company/ilan/${row.id}`}
        className="text-xs font-semibold text-zinc-700 underline hover:text-zinc-950"
      >
        Davetli Ekle
      </Link>
    </span>
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
