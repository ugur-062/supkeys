"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Trophy } from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { InfoTooltip } from "./info-tooltip";
import { PeriodToggle, type Period } from "./period-toggle";

export interface SupplierMetric {
  fromPool: number;
  totalLabel: string; // "Toplam Teklif Veren: 3"
}

export interface TopSupplierRow {
  rank: number;
  /** Anonim "CLE...", "KAR..." vb. */
  shortName: string;
  /** Madalya rengi 1-3, sonrası noktasız sayı */
  tendersBidOn: number;
  averageRank: number;
  totalBids: number;
}

export interface CompetitiveTender {
  tenderNumber: string;
  title: string;
  bidderCount: number;
  /** Bar chart için ihale-bazlı bidder sayısı dağılımı; vurgulu olan en yüksektir */
  distribution: Array<{ id: string; count: number; highlight?: boolean }>;
}

export interface TedarikciTabData {
  uniqueBiddersMonth: SupplierMetric;
  uniqueBiddersYear: SupplierMetric;
  bidsCountMonth: SupplierMetric;
  bidsCountYear: SupplierMetric;
  averageBidsMonth: SupplierMetric;
  averageBidsYear: SupplierMetric;
  topSuppliersMonth: TopSupplierRow[];
  topSuppliersYear: TopSupplierRow[];
  competitiveMonth: CompetitiveTender;
  competitiveYear: CompetitiveTender;
}

interface Props {
  data: TedarikciTabData;
}

const MEDAL_BG = ["bg-amber-400", "bg-slate-300", "bg-orange-400"] as const;

export function TedarikciTab({ data }: Props) {
  const [topPeriod, setTopPeriod] = useState<Period>("month");
  const [compPeriod, setCompPeriod] = useState<Period>("month");

  const topSuppliers =
    topPeriod === "month" ? data.topSuppliersMonth : data.topSuppliersYear;
  const competitive =
    compPeriod === "month" ? data.competitiveMonth : data.competitiveYear;

  return (
    <div className="space-y-6">
      {/* Faz 6: Rekabet Skoru bilgisi ana tablonun "Rekabet" kolonuna,
          Nakit Takvimi anasayfa gövdesine (İhale sekmesi) taşındı — üçüncü
          sekmede saklı kalmıyorlar. */}
      {/* Alt 2 kart: En Sık Teklif Veren Tedarikçiler + En Rekabetçi İhale */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Sol — geniş tablo */}
        <section className="card p-6 lg:col-span-2">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <InfoTooltip content="Dönemde en çok ihalenize teklif veren tedarikçiler. Ortalama sıralama düşükse o tedarikçi sürekli en iyi 1-2 fiyat veriyor demektir." />
              <h2 className="text-sm font-semibold text-zinc-950">
                En Sık Teklif Veren Tedarikçiler
              </h2>
            </div>
            <PeriodToggle value={topPeriod} onChange={setTopPeriod} />
          </header>

          {topSuppliers.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              Bu dönemde teklif veren tedarikçi bulunmuyor.
            </p>
          ) : (
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>Tedarikçiler</TableHeader>
                  <TableHeader>Teklif Verdiği İhale</TableHeader>
                  <TableHeader>Ortalama Sıra</TableHeader>
                  <TableHeader>Toplam Teklif</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {topSuppliers.map((r) => (
                  <TableRow key={r.rank}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600">
                          {r.rank}
                        </span>
                        {r.rank >= 1 && r.rank <= 3 ? (
                          <span
                            aria-hidden
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white ${MEDAL_BG[r.rank - 1]}`}
                            title={`${r.rank}. sırada`}
                          >
                            ★
                          </span>
                        ) : null}
                        <AvatarInitials name={r.shortName} size="sm" />
                        <span className="font-medium text-zinc-900">
                          {r.shortName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono tabular-nums text-zinc-700">
                      {r.tendersBidOn}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums text-zinc-700">
                      {r.averageRank.toFixed(2)}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums text-zinc-700">
                      {r.totalBids}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        {/* Sağ — en rekabetçi ihale */}
        <section className="card p-6">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-950">
              En Rekabetçi İhale
            </h2>
            <PeriodToggle value={compPeriod} onChange={setCompPeriod} />
          </header>

          <div className="relative h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={competitive.distribution.map((d) => ({
                  id: d.id,
                  count: d.count,
                  highlight: d.highlight ? 1 : 0,
                }))}
                margin={{ top: 24, right: 4, bottom: 4, left: 4 }}
                barCategoryGap={2}
              >
                <XAxis
                  dataKey="id"
                  tick={false}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {competitive.distribution.map((d, idx) => (
                    <Cell
                      key={idx}
                      fill={
                        d.highlight
                          ? "var(--color-zinc-900, #18181b)"
                          : "var(--color-zinc-200, #e4e4e7)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Kupa rozeti — bar üstüne overlay */}
            <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2">
              <div className="flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 shadow-sm">
                <Trophy className="h-3 w-3 fill-current text-amber-500" />
                {competitive.bidderCount} Teklif Veren
              </div>
            </div>
          </div>

          <div className="mt-3 space-y-0.5 border-t border-zinc-950/5 pt-3 text-center">
            <p className="tabular-nums text-xs text-zinc-500">
              #{competitive.tenderNumber}
            </p>
            <p className="text-sm font-semibold text-zinc-950">
              {competitive.title}
            </p>
            <p className="text-xs text-zinc-500">
              İhaledeki Teklif Veren Sayısı: {competitive.bidderCount}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
