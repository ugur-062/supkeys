"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Heading } from "@/components/catalyst/heading";
import { Select } from "@/components/catalyst/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { Text } from "@/components/catalyst/text";
import {
  useCounterpartiesReport,
  useGeneralReport,
  useListingReport,
  useMonthlyReport,
  useOrdersSummaryReport,
  useSavingsReport,
  type ReportType,
  type SavingsRow,
} from "@/hooks/use-company-reports";
import { useTenders } from "@/hooks/use-company-tenders";
import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  BarChart3,
  Building2,
  CalendarRange,
  Download,
  FileSearch,
  Package,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const RANGES: { value: string; label: string; days: number | null }[] = [
  { value: "30", label: "Son 30 Gün", days: 30 },
  { value: "90", label: "Son 3 Ay", days: 90 },
  { value: "180", label: "Son 6 Ay", days: 180 },
  { value: "365", label: "Son 1 Yıl", days: 365 },
  { value: "all", label: "Tümü", days: null },
];

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Taslak",
  IN_APPROVAL: "Onayda",
  OPEN: "Açık",
  CLOSED: "Teklife Kapalı",
  IN_AWARD_APPROVAL: "Kazandırma Onayı",
  AWARDED: "Tamamlandı",
  CLOSED_NO_AWARD: "Kazansız",
  CANCELLED: "İptal",
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: "Onay Bekliyor",
  ACCEPTED: "Onaylandı",
  CREATED: "Yeni",
  IN_DELIVERY: "Kargoda",
  DELIVERED: "Ödeme Bekleniyor",
  COMPLETED: "Tamamlandı",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal",
};

function tl(n: number) {
  return `${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺`;
}

function sym(cur: string) {
  return CURRENCY_SYMBOL[cur as keyof typeof CURRENCY_SYMBOL] ?? cur;
}

function totalsLabel(totals: Record<string, number>): string {
  const entries = Object.entries(totals);
  if (entries.length === 0) return "—";
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(
      ([c, v]) =>
        `${v.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ${sym(c)}`,
    )
    .join(" · ");
}

/** Bölüm kabuğu — Şablonlar sayfasıyla aynı dil (ikonlu başlık + kart). */
function Section({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-950/5 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
            <Icon className="h-4.5 w-4.5 text-zinc-700" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900">{title}</h3>
            <p className="text-xs text-zinc-500">{description}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Tek-ölçülü yatay çubuk satırı — ince mark (8px), veri ucunda yuvarlak,
 * değer metin token'ıyla sağda (renk kimlik taşımaz, tek seri).
 */
function BarRow({
  label,
  sub,
  value,
  max,
  valueLabel,
  title,
}: {
  label: string;
  sub?: string;
  value: number;
  max: number;
  valueLabel: string;
  title?: string;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5" title={title}>
      <div className="w-32 shrink-0 sm:w-40">
        <p className="truncate text-sm font-medium text-zinc-900">{label}</p>
        {sub ? <p className="truncate text-xs text-zinc-400">{sub}</p> : null}
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-r-full bg-zinc-900"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-28 shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-zinc-900">
        {valueLabel}
      </div>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-6 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}

/** Tasarruf/kazanç tablosu CSV (Excel uyumlu, BOM'lu, ; ayraçlı). */
function downloadCsv(type: ReportType, rows: SavingsRow[]) {
  const refLabel =
    type === "ALIM" ? "En Yüksek Teklif (TRY)" : "En Düşük Teklif (TRY)";
  const deltaLabel =
    type === "ALIM" ? "Tasarruf (TRY)" : "Rekabet Kazancı (TRY)";
  const header = [
    "İhale No",
    "Başlık",
    "Kazandırma Tarihi",
    "Teklif Sayısı",
    refLabel,
    "Kazanan (TRY)",
    deltaLabel,
    "%",
  ];
  const lines = rows.map((r) =>
    [
      r.number ?? "",
      `"${r.title.replace(/"/g, '""')}"`,
      r.awardedAt ? format(new Date(r.awardedAt), "yyyy-MM-dd") : "",
      r.bidCount,
      Math.round(r.reference),
      Math.round(r.winning),
      Math.round(r.delta),
      r.deltaPct.toFixed(1),
    ].join(";"),
  );
  const csv = "﻿" + [header.join(";"), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${type === "ALIM" ? "alim" : "satis"}-rekabet-raporu.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** İhale-bazlı detay paneli. */
function ListingReportPanel({ listingId }: { listingId: string }) {
  const report = useListingReport(listingId);
  if (report.isLoading)
    return <Text className="text-sm text-zinc-500">Yükleniyor…</Text>;
  const r = report.data;
  if (!r)
    return <Text className="text-sm text-zinc-500">Rapor yüklenemedi.</Text>;
  const isAlim = r.type === "ALIM";
  const cur = sym(r.currency);

  const stats = [
    { label: "Davet Edilen", value: String(r.participation.invited) },
    { label: "Teklif Veren Firma", value: String(r.participation.bidders) },
    {
      label: "Davet → Teklif",
      value:
        r.participation.invited > 0
          ? `%${Math.round((r.participation.invitedBidders / r.participation.invited) * 100)}`
          : "—",
    },
    { label: "Toplam Teklif", value: String(r.participation.totalBids) },
    {
      label: "En Düşük",
      value: r.bidStats.min != null ? tl(r.bidStats.min) : "—",
    },
    {
      label: "Ortalama",
      value: r.bidStats.avg != null ? tl(r.bidStats.avg) : "—",
    },
    {
      label: "En Yüksek",
      value: r.bidStats.max != null ? tl(r.bidStats.max) : "—",
    },
    {
      label: isAlim ? "Tasarruf" : "Rekabet Kazancı",
      value: r.bidStats.delta != null ? tl(r.bidStats.delta) : "—",
      accent: true,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-zinc-400">
          {r.number ?? "—"}
        </span>
        <Badge color={isAlim ? "blue" : "emerald"}>
          {isAlim ? "Alım İhalesi" : "Satış İlanı"}
        </Badge>
        <Badge color="zinc">{STATUS_LABEL[r.status] ?? r.status}</Badge>
        {r.participation.buyNowUsed ? (
          <Badge color="emerald">Hemen-Al kullanıldı</Badge>
        ) : null}
        <Link
          href={`/company/ilan/${r.id}`}
          className="ml-auto text-xs font-semibold text-blue-600 hover:underline"
        >
          İhaleye Git →
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-950/5 bg-zinc-950/[0.06] sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white p-3.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              {s.label}
            </dt>
            <dd
              className={cn(
                "mt-0.5 truncate text-lg font-bold tabular-nums",
                s.accent ? "text-emerald-600" : "text-zinc-900",
              )}
            >
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      {r.items.length > 0 ? (
        <div className="rounded-xl border border-zinc-950/10 px-2 [--gutter:--spacing(4)]">
          <Table dense>
            <TableHead>
              <TableRow>
                <TableHeader>Kalem</TableHeader>
                <TableHeader className="text-right">Teklif</TableHeader>
                <TableHeader className="text-right">
                  {isAlim ? "En Düşük Birim" : "En Yüksek Birim"}
                </TableHeader>
                <TableHeader className="text-right">Kazanan Birim</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {r.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="text-zinc-900">
                    {it.name}{" "}
                    <span className="text-xs text-zinc-400">
                      ({Number(it.quantity).toLocaleString("tr-TR")} {it.unit})
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-zinc-600">
                    {it.offerCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-zinc-700">
                    {it.bestUnitPrice != null
                      ? `${it.bestUnitPrice.toLocaleString("tr-TR")} ${cur}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums text-zinc-900">
                    {it.winningUnitPrice != null
                      ? `${it.winningUnitPrice.toLocaleString("tr-TR")} ${cur}`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {r.orders.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {r.orders.map((o) => (
            <Link
              key={o.id}
              href={`/company/siparis/${o.id}`}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs transition-colors hover:bg-zinc-50"
            >
              <span className="font-mono">{o.number ?? "Sipariş"}</span>
              <Badge color="zinc">
                {ORDER_STATUS_LABEL[o.status] ?? o.status}
              </Badge>
              <span className="font-semibold tabular-nums">
                {Number(o.amount).toLocaleString("tr-TR")} {sym(o.currency)}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Raporlar — iki portalın ortak görünümü. Süre aralığı bazlı genel rapor +
 * ihale bazlı detay. ALIM: tasarruf dili · SATIS: kazanç dili.
 */
export function ReportsView({ type }: { type: ReportType }) {
  const isAlim = type === "ALIM";
  const [range, setRange] = useState("90");
  const [selectedListing, setSelectedListing] = useState("");
  const days = RANGES.find((r) => r.value === range)?.days ?? null;

  const general = useGeneralReport(type, days);
  const savings = useSavingsReport(type, days);
  const monthly = useMonthlyReport(type, days);
  const counterparties = useCounterpartiesReport(type, days);
  const ordersSummary = useOrdersSummaryReport(type, days);
  const myTenders = useTenders(type);

  const deltaWord = isAlim ? "Tasarruf" : "Rekabet Kazancı";
  const partyWord = isAlim ? "Tedarikçi" : "Alıcı";

  const g = general.data;
  const hero = g
    ? [
        {
          label: isAlim ? "Toplam İhale" : "Toplam İlan",
          value: String(g.total),
        },
        { label: "Kazandırılan", value: String(g.awardedCount) },
        {
          label: isAlim ? "Sözleşme Toplamı" : "Satış Toplamı",
          value: tl(g.totalAwarded),
        },
        { label: deltaWord, value: tl(g.totalCompetitionDelta), accent: true },
        { label: "Ort. Teklif / İhale", value: String(g.avgBidsPerListing) },
      ]
    : [];

  const maxMonthly = Math.max(
    1,
    ...(monthly.data ?? []).map((m) => m.awardedTry),
  );
  const maxCp = Math.max(
    1,
    ...(counterparties.data ?? []).map((c) => c.orderCount),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Başlık + süre aralığı */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Heading>Raporlar</Heading>
          <Text className="mt-1 text-sm text-zinc-500">
            {isAlim
              ? "Alım ihalelerinizin performansı: rekabet tasarrufu, katılım ve tedarikçi kırılımı."
              : "Satış ilanlarınızın performansı: rekabet kazancı, katılım ve alıcı kırılımı."}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-zinc-400" aria-hidden="true" />
          <Select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="max-w-[150px]"
            aria-label="Süre aralığı"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Hero KPI bandı */}
      {general.isLoading || !g ? (
        <div className="h-24 animate-pulse rounded-2xl bg-zinc-100" />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-950/5 bg-zinc-950/[0.06] sm:grid-cols-3 lg:grid-cols-5">
            {hero.map((k) => (
              <div key={k.label} className="bg-white p-4">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  {k.label}
                </dt>
                <dd
                  className={cn(
                    "mt-0.5 truncate text-xl font-bold tabular-nums",
                    k.accent ? "text-emerald-600" : "text-zinc-900",
                  )}
                >
                  {k.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2">
            {Object.entries(g.byStatus).map(([s, c]) => (
              <Badge key={s} color="zinc">
                {STATUS_LABEL[s] ?? s}: {c}
              </Badge>
            ))}
          </div>
        </>
      )}

      {/* Aylık eğilim — tek seri çubuk listesi */}
      <Section
        icon={TrendingUp}
        title="Aylık Eğilim"
        description={
          isAlim
            ? "Kazandırma ayına göre sözleşme tutarı (TRY karşılığı)."
            : "Kazandırma ayına göre satış tutarı (TRY karşılığı)."
        }
      >
        {monthly.isLoading || !monthly.data ? (
          <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
        ) : monthly.data.length === 0 ? (
          <EmptyHint>Bu aralıkta veri yok.</EmptyHint>
        ) : (
          <div className="divide-y divide-zinc-50">
            {monthly.data.map((m) => (
              <BarRow
                key={m.month}
                label={format(new Date(`${m.month}-01`), "MMMM yyyy", {
                  locale: tr,
                })}
                sub={`${m.created} açıldı · ${m.awarded} kazandırıldı`}
                value={m.awardedTry}
                max={maxMonthly}
                valueLabel={tl(m.awardedTry)}
                title={`${m.month}: ${m.created} açıldı, ${m.awarded} kazandırıldı, ${tl(m.awardedTry)}`}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Rekabet tablosu */}
      <Section
        icon={Trophy}
        title={`${deltaWord} (Rekabet)`}
        description={
          isAlim
            ? "Kazandırılan ihale başına: en yüksek teklif ile kazanan arasındaki fark — rekabetin size kazandırdığı."
            : "Kazandırılan ilan başına: kazanan ile en düşük teklif arasındaki fark — rekabetin fiyatı yükselttiği tutar."
        }
        action={
          savings.data && savings.data.rows.length > 0 ? (
            <Button outline onClick={() => downloadCsv(type, savings.data.rows)}>
              <Download data-slot="icon" />
              CSV İndir
            </Button>
          ) : undefined
        }
      >
        {savings.isLoading || !savings.data ? (
          <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
        ) : savings.data.rows.length === 0 ? (
          <EmptyHint>
            Bu aralıkta kazandırılmış {isAlim ? "ihale" : "ilan"} yok.
          </EmptyHint>
        ) : (
          <>
            {savings.data.best ? (
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge color="green">
                  En iyi rekabet: {savings.data.best.title} (%
                  {savings.data.best.deltaPct.toFixed(0)})
                </Badge>
                {savings.data.worst &&
                savings.data.worst.title !== savings.data.best.title ? (
                  <Badge color="amber">
                    En zayıf: {savings.data.worst.title} (%
                    {savings.data.worst.deltaPct.toFixed(0)})
                  </Badge>
                ) : null}
              </div>
            ) : null}
            <div className="rounded-xl border border-zinc-950/10 px-2 [--gutter:--spacing(4)]">
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader>{isAlim ? "İhale" : "İlan"}</TableHeader>
                    <TableHeader className="text-right">
                      {isAlim ? "En Yüksek" : "En Düşük"}
                    </TableHeader>
                    <TableHeader className="text-right">Kazanan</TableHeader>
                    <TableHeader className="text-right">{deltaWord}</TableHeader>
                    <TableHeader className="text-right">%</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {savings.data.rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link
                          href={`/company/ilan/${r.id}`}
                          className="font-medium text-zinc-900 hover:text-blue-600 hover:underline"
                        >
                          {r.title}
                        </Link>
                        <div className="font-mono text-[11px] text-zinc-400">
                          {r.number ?? "—"} · {r.bidCount} teklif
                          {r.awardedAt
                            ? ` · ${format(new Date(r.awardedAt), "d MMM yyyy", { locale: tr })}`
                            : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-zinc-600">
                        {tl(r.reference)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-zinc-900">
                        {tl(r.winning)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-emerald-700">
                        {tl(r.delta)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-zinc-600">
                        %{r.deltaPct.toFixed(0)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-semibold text-zinc-900">
                      Toplam
                    </TableCell>
                    <TableCell />
                    <TableCell className="text-right font-semibold tabular-nums">
                      {tl(savings.data.grandWinning)}
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums text-emerald-700">
                      {tl(savings.data.grandDelta)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <Text className="mt-2 text-xs text-zinc-400">
              Tutarlar teklif anındaki TCMB kuruyla TRY&apos;ye çevrilerek
              toplanır.
            </Text>
          </>
        )}
      </Section>

      {/* Karşı taraf + sipariş özeti */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section
          icon={Building2}
          title={`En Çok Çalışılan ${partyWord}ler`}
          description="Sipariş adedine göre ilk 10 (iptal/red hariç)."
        >
          {counterparties.isLoading || !counterparties.data ? (
            <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
          ) : counterparties.data.length === 0 ? (
            <EmptyHint>Bu aralıkta sipariş yok.</EmptyHint>
          ) : (
            <div className="divide-y divide-zinc-50">
              {counterparties.data.map((c) => (
                <BarRow
                  key={c.companyId}
                  label={c.name}
                  sub={totalsLabel(c.totals)}
                  value={c.orderCount}
                  max={maxCp}
                  valueLabel={`${c.orderCount} sipariş`}
                  title={`${c.name}: ${c.orderCount} sipariş · ${totalsLabel(c.totals)}`}
                />
              ))}
            </div>
          )}
        </Section>

        <Section
          icon={Package}
          title="Sipariş Özeti"
          description={
            isAlim
              ? "Bu aralıkta ihalelerinizden doğan alım siparişleri."
              : "Bu aralıkta ilanlarınızdan doğan satış siparişleri."
          }
        >
          {ordersSummary.isLoading || !ordersSummary.data ? (
            <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-950/5 bg-zinc-950/[0.06]">
                <div className="bg-white p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                    Toplam Sipariş
                  </div>
                  <div className="mt-0.5 text-xl font-bold tabular-nums text-zinc-900">
                    {ordersSummary.data.total}
                  </div>
                </div>
                <div className="bg-white p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                    Ciro
                  </div>
                  <div className="mt-0.5 truncate text-xl font-bold tabular-nums text-zinc-900">
                    {totalsLabel(ordersSummary.data.totals)}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(ordersSummary.data.byStatus).map(([s, c]) => (
                  <Badge key={s} color="zinc">
                    {ORDER_STATUS_LABEL[s] ?? s}: {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* İhale bazlı rapor */}
      <Section
        icon={FileSearch}
        title="İhale Bazlı Rapor"
        description="Tek bir ihalenin katılım, teklif dağılımı ve kalem kırılımı."
        action={
          <Select
            value={selectedListing}
            onChange={(e) => setSelectedListing(e.target.value)}
            className="max-w-[300px]"
            aria-label="İhale seç"
          >
            <option value="">— {isAlim ? "İhale" : "İlan"} seçin —</option>
            {(myTenders.data ?? [])
              .filter((t) => t.status !== "DRAFT")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tenderNumber} — {t.title}
                </option>
              ))}
          </Select>
        }
      >
        {selectedListing ? (
          <ListingReportPanel listingId={selectedListing} />
        ) : (
          <EmptyHint>
            <BarChart3
              className="mx-auto mb-2 h-6 w-6 text-zinc-300"
              aria-hidden="true"
            />
            Katılım, teklif istatistikleri ve kalem kırılımını görmek için
            yukarıdan bir {isAlim ? "ihale" : "ilan"} seçin.
          </EmptyHint>
        )}
      </Section>
    </div>
  );
}
