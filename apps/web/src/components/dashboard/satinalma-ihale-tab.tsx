"use client";

import { useLocale, useTranslations } from "next-intl";
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
import { Link } from "@/i18n/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/format-date";

type SubTab = "own" | "company";

/** Faz 5 — huni aşaması → filtreli liste (birebir filtre yoksa düz liste;
 *  yanlış filtre vermekten iyidir). */
const FUNNEL_STAGE_HREF: Record<string, string> = {
  listings: "/company/satinalma/taleplerim",
  bids: "/company/satinalma/taleplerim",
  awarded: "/company/satinalma/taleplerim?status=AWARDED",
  orders: "/company/satinalma/siparisler",
  delivered: "/company/satinalma/siparisler?status=DELIVERED",
};

/** Satınalma panosu — İhale sekmesi (eski ihale-tab markup'ı, yeni veri). */
export function SatinalmaIhaleTab({
  data,
  analytics,
  showKpis = true,
}: {
  data: SatinalmaDashboard;
  analytics?: SatinalmaAnalytics;
  /** Şirketim › Genel Bakış: sayılar ayrı bölümde — burada yalnız grafik/tablo. */
  showKpis?: boolean;
}) {
  const t = useTranslations("web.panel.shell.satinalmaIhaleTab");
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
      {showKpis ? (
        <>
      {/* Faz 4.1 — birincil satır TUTAR (TRY-only, etiketle söylenir);
          adet kartları ikinci satıra indi. */}
      {analytics ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label={t("donemHarcamasi")}
            value={formatCompactMoney(analytics.money.periodSpend)}
            valueTitle={formatMoney(analytics.money.periodSpend)}
            href="/company/satinalma/siparisler"
            accent="blue"
            deltaPct={analytics.money.deltas.periodSpend}
            hint={t("donemIciSiparislerYalnizTry")}
          />
          <KpiCard
            label={t("acikSiparisTaahhudu")}
            value={formatCompactMoney(analytics.money.openCommitment)}
            valueTitle={formatMoney(analytics.money.openCommitment)}
            href="/company/satinalma/siparisler"
            accent="blue"
            hint={t("odenmemisSiparisBakiyesiYalnizTry")}
          />
          <KpiCard
            label={t("n30GundeVadesiGelen")}
            value={formatCompactMoney(analytics.money.dueIn30d)}
            valueTitle={formatMoney(analytics.money.dueIn30d)}
            href="/company/satinalma/siparisler?status=DELIVERED"
            accent="blue"
            attention={analytics.money.dueIn30d > 0}
            hint={
              analytics.money.dueIn30d > 0
                ? t("odemePlanlaVade30Gun")
                : t("vadesiYaklasanOdemeYok")
            }
          />
          <KpiCard
            label={t("gerceklesenTasarruf")}
            value={formatCompactMoney(analytics.money.realizedSavings)}
            valueTitle={formatMoney(analytics.money.realizedSavings)}
            href="/company/sirketim/raporlar/tasarruf"
            accent="blue"
            deltaPct={analytics.money.deltas.realizedSavings}
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
          label={t("acikSatinAlmaTaleplerim")}
          value={data.openCount}
          href="/company/satinalma/taleplerim?status=OPEN"
          accent="blue"
          spark={analytics?.kpiSeries.listings}
        />
        <KpiCard
          label={t("gelenTeklifler")}
          value={data.bidsReceived}
          href="/company/satinalma/taleplerim?status=IN_AWARD"
          accent="blue"
          attention={(analytics?.actions.awaitingDecision ?? 0) > 0}
          hint={
            (analytics?.actions.awaitingDecision ?? 0) > 0
              ? t("satinAlmaTalebiKararBekliyor", { awaitingDecision: analytics!.actions.awaitingDecision })
              : undefined
          }
          deltaPct={analytics?.deltas.bids}
          spark={analytics?.kpiSeries.bids}
        />
        <KpiCard
          label={t("kazandirilanSatinAlmaTalepleri")}
          value={data.awarded}
          href="/company/satinalma/taleplerim?status=AWARDED"
          accent="blue"
          deltaPct={analytics?.deltas.awarded}
          spark={analytics?.kpiSeries.awarded}
        />
        <KpiCard
          label={t("devamEdenSiparisler")}
          value={data.ongoingOrders}
          href="/company/satinalma/siparisler"
          accent="blue"
          deltaPct={analytics?.deltas.orders}
          spark={analytics?.kpiSeries.orders}
        />
      </div>

      {/* Ana grafik: süreç hunisi + döngü süresi trendi. */}
        </>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title={t("surecHunisi")}
          subtitle={t("donemdeAcilanSatinAlmaTaleplerin")}
          ariaLabel={t("satinalmaSurecHunisi")}
          href="/company/satinalma/taleplerim"
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
              title={t("henuzHuniVerisiYok")}
              body={t("ilkSatinAlmaTalebiniziAcip")}
              ctaLabel={t("satinAlmaTalebiAc")}
              ctaHref="/company/satinalma/taleplerim/yeni"
            />
          )}
        </ChartCard>
        <ChartCard
          title={t("donguSuresi")}
          subtitle={t("satinAlmaTalebiAcilisindanSiparise")}
          ariaLabel={t("donguSuresiTrendi")}
          rangeBadge="son 12 ay"
        >
          <CycleTrendChart points={analytics?.cycleTrend} />
        </ChartCard>
      </div>

      {/* Nakit Takvimi — tedarikçi sekmesinden anasayfa gövdesine taşındı
          (Faz 6.3): ödeme yükü üçüncü sekmede saklı kalmasın. */}
      <ChartCard
        title={t("nakitTakvimi")}
        subtitle={t("onumuzdeki30GununOdemeYuku")}
        ariaLabel={t("n30GunlukOdemeTakvimi")}
        href="/company/satinalma/siparisler?status=DELIVERED"
      >
        {analytics && analytics.cashCalendar.some((w) => w.amount > 0) ? (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.cashCalendar}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <Tooltip formatter={(v) => [formatMoney(Number(v ?? 0), "TRY"), t("odeme")]} />
                <Bar dataKey="amount" fill="#2563eb" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <DashboardEmptyState
            title={t("onumuzdeki30GundeVadesiGelen")}
            body={t("teslimAlinanSiparislerinVadeleriYaklastikca")}
          />
        )}
      </ChartCard>

      {/* Teklife Açık İhaleler paneli */}
      <section className="card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-950/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-2 w-2 rounded-full bg-success-500" />
            <h2 className="text-base font-semibold text-zinc-950">
              {t("teklifeAcikSatinAlmaTalepleri")}
            </h2>
          </div>
          <Link
            href="/company/satinalma/taleplerim"
            className="text-sm font-semibold text-zinc-900 hover:text-zinc-600"
          >
            {t("tumunuIncele")}
          </Link>
        </header>

        {/* Alt sekmeler — segmentli kontrol (pano sekmeleriyle aynı dil). */}
        <div className="border-b border-zinc-950/5 px-5 py-2.5">
          <div className="inline-flex w-fit gap-1 rounded-lg bg-zinc-100 p-0.5">
            {(
              [
                ["own", t("olusturdugunuz"), data.openTendersOwn.length],
                ["company", t("firmanin"), data.openTendersCompany.length],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSubTab(key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all",
                  subTab === key
                    ? "bg-white text-blue-700 shadow-sm ring-1 ring-zinc-950/5"
                    : "text-zinc-500 hover:text-zinc-900",
                )}
              >
                {label}{" "}
                <span
                  className={cn(
                    "tabular-nums",
                    subTab === key ? "text-blue-400" : "text-zinc-400",
                  )}
                >
                  ({count})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Tablo / boş durum */}
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-5 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100">
              <FileX2 className="h-7 w-7 text-zinc-400" />
            </div>
            <p className="text-sm text-zinc-500">
              {t("goruntulenecekBirSatinAlmaTalebi")}
            </p>
          </div>
        ) : (
          <div className="px-3 [--gutter:--spacing(5)]">
            <Table dense>
              <TableHead>
                <TableRow>
                  <SortableHeader label={t("satinAlmaTalebiNo")} k="number" sort={sort} onSort={toggleSort} />
                  <TableHeader>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                      {t("satinAlmaTalebiAdi")}
                    </span>
                  </TableHeader>
                  <SortableHeader label={t("acilisTarihi")} k="opened" sort={sort} onSort={toggleSort} />
                  <SortableHeader label={t("kapanis")} k="closes" sort={sort} onSort={toggleSort} />
                  <SortableHeader
                    label={t("gelenTeklif")} k="bids" sort={sort} onSort={toggleSort}
                    className="text-right"
                  />
                  <TableHeader>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                      {t("rekabet")}
                    </span>
                  </TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className="group transition-colors hover:bg-slate-50/70"
                  >
                    <TableCell>
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] tabular-nums text-zinc-600">
                        {r.tenderNumber}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-64">
                      <Link
                        href={`/company/ilan/${r.id}`}
                        className="block truncate text-[13px] font-semibold text-zinc-900 transition-colors group-hover:text-blue-700"
                        title={r.title}
                      >
                        {r.title}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums text-xs text-zinc-400">
                      {formatDate(r.openedAt)}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-col items-start gap-0.5">
                        <span className="text-[13px] font-semibold tabular-nums text-zinc-900">
                          {formatDate(r.closesAt)}
                        </span>
                        <DaysLeftBadge closesAt={r.closesAt} />
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "text-[15px] font-semibold tabular-nums",
                          (r.bidCount ?? 0) > 0
                            ? "text-blue-700"
                            : "text-zinc-300",
                        )}
                      >
                        {r.bidCount ?? 0}
                      </span>
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
          "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide transition-colors",
          active ? "text-blue-700" : "text-zinc-400 hover:text-zinc-700",
        )}
      >
        {label}
        <span aria-hidden className={cn("text-[9px]", !active && "opacity-40")}>
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
  const t = useTranslations("web.panel.shell.satinalmaIhaleTab");
  const bids = row.bidCount ?? 0;
  if (bids >= 2) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
        <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
        {t("saglikli")}
      </span>
    );
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
        {t("davetliEkle")}
      </Link>
    </span>
  );
}

/** Kapanışa kalan gün rozeti: ≤3 kırmızı, ≤7 amber, aksi nötr. */
function DaysLeftBadge({ closesAt }: { closesAt: string }) {
  const t = useTranslations("web.panel.shell.satinalmaIhaleTab");
  const days = Math.ceil(
    (new Date(closesAt).getTime() - Date.now()) / 86_400_000,
  );
  if (days < 0)
    return <span className="text-xs text-zinc-400">{t("kapandi")}</span>;
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
      {days === 0 ? t("bugun") : t("gunKaldi", { days: days })}
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
  const t = useTranslations("web.panel.shell.satinalmaIhaleTab");
  const formatDaysOrHours = useFormatDaysOrHours();
  const filled = (points ?? []).filter(
    (p): p is { key: string; label: string; value: number } => p.value != null,
  );
  if (filled.length === 0) {
    return (
      <DashboardEmptyState
        title={t("henuzDonguVerisiYok")}
        body={t("kazandirdiginizSatinAlmaTalebiSiparise")}
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
          {t("ortalamaOncekiDonem")}
        </p>
        <p className="text-xs text-slate-400">
          {t("trendIcinEnAz3")}
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
  const unit = useHours ? "saat" : t("gun");

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

/** < 1 gün ortalamayı saate çevirerek yazar ("14 saat" / "1,4 gün") — dil bilen hook. */
function useFormatDaysOrHours(): (days: number) => string {
  const t = useTranslations("web.panel.shell.satinalmaIhaleTab");
  const locale = useLocale();
  return (days) => (days < 1 ? t("saat", { n: Math.round(days * 24) }) : t("gun", { n: days.toLocaleString(locale, { maximumFractionDigits: 1 }) }));
}

// Dalga B-2: yerel `formatDate` KALDIRILDI — paylaşılan formatDate'i
// gölgeleyip dd.mm.yyyy üretiyordu (UI'da iki farklı tarih biçimi).
