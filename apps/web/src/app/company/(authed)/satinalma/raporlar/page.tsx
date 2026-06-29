"use client";

import { Badge } from "@/components/catalyst/badge";
import { Heading, Subheading } from "@/components/catalyst/heading";
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
  useGeneralReport,
  useSavingsReport,
} from "@/hooks/use-company-reports";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import Link from "next/link";
import { useState } from "react";

const RANGES: { value: string; label: string; days: number | null }[] = [
  { value: "90", label: "Son 3 Ay", days: 90 },
  { value: "30", label: "Son 30 Gün", days: 30 },
  { value: "180", label: "Son 6 Ay", days: 180 },
  { value: "365", label: "Son 1 Yıl", days: 365 },
  { value: "all", label: "Tümü", days: null },
];

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Taslak",
  IN_APPROVAL: "Onayda",
  OPEN: "Açık",
  CLOSED: "Teklife Kapalı",
  IN_AWARD: "Kazandırmada",
  IN_AWARD_APPROVAL: "Kazandırma Onayı",
  AWARDED: "Tamamlandı",
  CLOSED_NO_AWARD: "Kazansız",
  CANCELLED: "İptal",
};

function tl(n: number) {
  return `${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺`;
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-950/10 bg-white p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <div
        className={`mt-1 text-xl font-bold tabular-nums ${
          accent ? "text-emerald-600" : "text-zinc-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export default function RaporlarPage() {
  const [range, setRange] = useState("90");
  const days = RANGES.find((r) => r.value === range)?.days ?? null;
  const general = useGeneralReport(days);
  const savings = useSavingsReport(days);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Heading>Raporlar</Heading>
          <Text className="mt-1 text-sm text-zinc-500">
            Alım ihalelerinizin özeti ve rekabet tasarrufu.
          </Text>
        </div>
        <Select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="max-w-[160px]"
        >
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Genel KPI'lar */}
      <section className="space-y-3">
        <Subheading>Genel</Subheading>
        {general.isLoading || !general.data ? (
          <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Kpi label="Toplam İhale" value={String(general.data.total)} />
              <Kpi
                label="Tamamlanan"
                value={String(general.data.awardedCount)}
              />
              <Kpi label="Tahmini Toplam" value={tl(general.data.totalEstimated)} />
              <Kpi label="Kazanan Toplam" value={tl(general.data.totalAwarded)} />
              <Kpi
                label="Toplam Tasarruf"
                value={tl(general.data.totalSavings)}
                accent
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(general.data.byStatus).map(([s, c]) => (
                <Badge key={s} color="zinc">
                  {STATUS_LABEL[s] ?? s}: {c}
                </Badge>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Tasarruf */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Subheading>Tasarruf (rekabet)</Subheading>
          {savings.data ? (
            <div className="flex flex-wrap gap-2 text-xs">
              {savings.data.best ? (
                <Badge color="green">
                  En iyi: {savings.data.best.title} (%
                  {savings.data.best.savingsPct.toFixed(0)})
                </Badge>
              ) : null}
              {savings.data.worst ? (
                <Badge color="amber">
                  En düşük: {savings.data.worst.title} (%
                  {savings.data.worst.savingsPct.toFixed(0)})
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>

        {savings.isLoading || !savings.data ? (
          <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
        ) : savings.data.rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center text-sm text-zinc-500">
            Bu aralıkta tamamlanmış ihale yok.
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-950/5 bg-white px-2 shadow-sm [--gutter:--spacing(4)]">
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>İhale</TableHeader>
                  <TableHeader className="text-right">En Yüksek</TableHeader>
                  <TableHeader className="text-right">Kazanan</TableHeader>
                  <TableHeader className="text-right">Tasarruf</TableHeader>
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
                        {r.number ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-600">
                      {tl(r.highest)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-900">
                      {tl(r.winning)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-emerald-700">
                      {tl(r.savings)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-600">
                      %{r.savingsPct.toFixed(0)}
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
                    {tl(savings.data.grandSavings)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
        <Text className="text-xs text-zinc-400">
          Teklif karşılaştırması için bir ihaleye tıklayın — kalem bazlı
          karşılaştırma ihale detayındadır.
        </Text>
      </section>
    </div>
  );
}
