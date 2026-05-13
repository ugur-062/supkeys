"use client";

import { AvatarInitials } from "@/components/ui/avatar-initials";
import { AlertTriangle, Trophy } from "lucide-react";
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
  const [global, setGlobal] = useState<Period>("month");
  const [topPeriod, setTopPeriod] = useState<Period>("month");
  const [compPeriod, setCompPeriod] = useState<Period>("month");

  const uniqueBidders =
    global === "month" ? data.uniqueBiddersMonth : data.uniqueBiddersYear;
  const bidsCount =
    global === "month" ? data.bidsCountMonth : data.bidsCountYear;
  const averageBids =
    global === "month" ? data.averageBidsMonth : data.averageBidsYear;
  const topSuppliers =
    topPeriod === "month" ? data.topSuppliersMonth : data.topSuppliersYear;
  const competitive =
    compPeriod === "month" ? data.competitiveMonth : data.competitiveYear;

  return (
    <div className="space-y-6">
      {/* Dönem filtre + hesaplama linki */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <PeriodToggle value={global} onChange={setGlobal} />
        <button
          type="button"
          className="text-xs font-semibold text-brand-600 hover:text-brand-700"
        >
          Hesaplama Kriterlerini İncele
        </button>
      </div>

      {/* Uyarı banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-warning-500/30 bg-warning-50 px-5 py-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning-600" />
        <p className="text-sm text-warning-900">
          İhalelerinizi genellikle davetlilere özel açıyorsunuz. Rekabeti ve
          teklif çeşitliliğini artırmak için daha fazla ihaleyi tüm{" "}
          <strong>Supkeys Tedarikçi Havuzu</strong>'na açmanızı öneririz.
        </p>
      </div>

      {/* 3 KPI metrik kartı */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <PoolKpi
          label="Teklif Veren Sayısı"
          value={uniqueBidders.fromPool}
          subtotal={uniqueBidders.totalLabel}
          description="Supkeys tedarikçi havuzundan teklif veren tedarikçi sayısı"
          tooltip="Belirli dönemde, davetiniz olmadan Supkeys Tedarikçi Havuzu üzerinden ihalenize teklif veren benzersiz tedarikçi sayısı."
        />
        <PoolKpi
          label="Teklif Sayısı"
          value={bidsCount.fromPool}
          subtotal={bidsCount.totalLabel}
          description="Supkeys tedarikçi havuzundan alınan teklif sayısı"
          tooltip="Supkeys Tedarikçi Havuzu'ndan gelen toplam teklif sayısı (revizyonlar ayrı kabul edilir)."
        />
        <PoolKpi
          label="Ortalama Teklif"
          value={uniqueBidders.fromPool === 0
            ? "0,00"
            : (bidsCount.fromPool / uniqueBidders.fromPool).toLocaleString(
                "tr-TR",
                { minimumFractionDigits: 2, maximumFractionDigits: 2 },
              )}
          subtotal={averageBids.totalLabel}
          description="Supkeys tedarikçi havuzundan alınan tekliflerin ortalaması"
          tooltip="Havuzdan teklif sayısı / havuzdan teklif veren sayısı."
        />
      </div>

      {/* Alt 2 kart: En Sık Teklif Veren Tedarikçiler + En Rekabetçi İhale */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Sol — geniş tablo */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <InfoTooltip content="Dönemde en çok ihalenize teklif veren tedarikçiler. Ortalama sıralama düşükse o tedarikçi sürekli en iyi 1-2 fiyat veriyor demektir." />
              <h2 className="font-display text-sm font-bold text-brand-900">
                En Sık Teklif Veren Tedarikçiler
              </h2>
            </div>
            <PeriodToggle value={topPeriod} onChange={setTopPeriod} />
          </header>

          {topSuppliers.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Bu dönemde teklif veren tedarikçi bulunmuyor.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="py-2 pr-3">Tedarikçiler</th>
                  <th className="py-2 pr-3">Teklif Verdiği İhale</th>
                  <th className="py-2 pr-3">Ortalama Sıra</th>
                  <th className="py-2 pr-3">Toplam Teklif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topSuppliers.map((r) => (
                  <tr key={r.rank}>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                            {r.rank}
                          </span>
                          {r.rank >= 1 && r.rank <= 3 ? (
                            <span
                              aria-hidden
                              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${MEDAL_BG[r.rank - 1]}`}
                              title={`${r.rank}. sırada`}
                            >
                              ★
                            </span>
                          ) : null}
                          <AvatarInitials name={r.shortName} size="sm" />
                          <span className="font-medium text-brand-900">
                            {r.shortName}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-3 font-mono tabular-nums text-slate-700">
                        {r.tendersBidOn}
                      </td>
                      <td className="py-3 pr-3 font-mono tabular-nums text-slate-700">
                        {r.averageRank.toFixed(2)}
                      </td>
                      <td className="py-3 pr-3 font-mono tabular-nums text-slate-700">
                        {r.totalBids}
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Sağ — en rekabetçi ihale */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-sm font-bold text-brand-900">
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
                          ? "var(--color-brand-500, #3b6bff)"
                          : "var(--color-slate-200, #e2e8f0)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Kupa rozeti — bar üstüne overlay */}
            <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2">
              <div className="flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 shadow-sm">
                <Trophy className="h-3 w-3 fill-current text-amber-500" />
                {competitive.bidderCount} Teklif Veren
              </div>
            </div>
          </div>

          <div className="mt-3 space-y-0.5 border-t border-slate-100 pt-3 text-center">
            <p className="font-mono text-xs text-slate-500">
              #{competitive.tenderNumber}
            </p>
            <p className="font-display text-sm font-bold text-brand-900">
              {competitive.title}
            </p>
            <p className="text-xs text-slate-500">
              İhaledeki Teklif Veren Sayısı: {competitive.bidderCount}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

function PoolKpi({
  label,
  value,
  subtotal,
  description,
  tooltip,
}: {
  label: string;
  value: string | number;
  subtotal: string;
  description: string;
  tooltip: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-2">
        <InfoTooltip content={tooltip} />
        <p className="text-sm font-medium text-slate-600">{label}</p>
      </div>
      <p className="text-3xl font-bold tabular-nums text-brand-900">{value}</p>
      <p className="text-xs leading-snug text-slate-500">{description}</p>
      <p className="border-t border-slate-100 pt-3 text-xs font-medium text-slate-600">
        {subtotal}
      </p>
    </div>
  );
}
