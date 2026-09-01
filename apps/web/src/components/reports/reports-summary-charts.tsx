"use client";

import { formatMoney } from "@/components/ui/money";
import { numberPossessive } from "@/lib/turkish";
import { companyApi } from "@/lib/company-auth/api";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * P2 (frontend denetimi §10.5) — Raporlar hub'ının üstüne 3-4 grafikli özet.
 * Veri POST /company/reports/summary (tip-farkında); paket kapısına takılırsa
 * (403) bölüm sessizce gizlenir — hub'ın rapor kartları aynen çalışır.
 * Palet monokrom + tek semantik vurgu (emerald) — marka kararı §0.1.
 */
interface ReportsSummary {
  months: {
    key: string;
    label: string;
    listings: number;
    bids: number;
    orderTotalTry: number;
  }[];
  winRate: { won: number; total: number };
  orders: { count: number; avgTry: number | null };
  categories: { name: string; count: number }[];
}

const ZINC_900 = "#18181b";
const ZINC_400 = "#a1a1aa";
const ZINC_200 = "#e4e4e7";
const EMERALD = "#10b981";

export function useReportsSummary(type: "ALIM" | "SATIS") {
  return useQuery({
    queryKey: ["reports-summary", type],
    queryFn: async () => {
      const { data } = await companyApi.post<ReportsSummary>(
        "/company/reports/summary",
        { type },
      );
      return data;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      {hint ? <p className="mt-0.5 text-xs text-zinc-500">{hint}</p> : null}
      <div className="mt-3 h-52">{children}</div>
    </section>
  );
}

const AXIS_TICK = { fontSize: 11, fill: ZINC_400 };

/** B15: kırpılan kategori etiketi — SVG <title> ile tam metin tooltip'i. */
function CategoryTick({
  x,
  y,
  payload,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: unknown };
}) {
  const full = String(payload?.value ?? "");
  const shown = full.length > 20 ? `${full.slice(0, 19)}…` : full;
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fill={ZINC_400}>
      <title>{full}</title>
      {shown}
    </text>
  );
}


export function ReportsSummaryCharts({ type }: { type: "ALIM" | "SATIS" }) {
  const { data, isLoading, isError } = useReportsSummary(type);
  // Paket kapısı / hata: bölüm görünmez (hub kartları etkilenmez).
  if (isError) return null;
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-72 animate-pulse rounded-2xl bg-zinc-100" />
        ))}
      </div>
    );
  }
  if (!data) return null;

  const isAlim = type === "ALIM";
  const hasVolume = data.months.some((m) => m.listings > 0 || m.bids > 0);
  const hasOrders = data.months.some((m) => m.orderTotalTry > 0);
  const winPct =
    data.winRate.total > 0
      ? Math.round((data.winRate.won / data.winRate.total) * 100)
      : null;
  // Hiç veri yoksa bölümü hiç çizme — boş eksen ızgaraları "boş ve düz"
  // hissini geri getirirdi.
  if (!hasVolume && !hasOrders && winPct === null && data.categories.length === 0)
    return null;

  return (
    <div>
      {/* B12: bölümde iki pencere var (grafikler 6 ay, oran/segment 12 ay)
          — başlık nötr; her kart kendi dönemini hint'inde söyler. */}
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">
        Performans Özeti
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {hasVolume ? (
          <ChartCard
            title={isAlim ? "Aylık Satın Alma Talebi ve Gelen Teklif" : "Aylık Satın Alma Talebi ve Verilen Teklif"}
            hint="Adet — son 6 ay"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.months} barGap={2}>
                <CartesianGrid vertical={false} stroke={ZINC_200} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS_TICK} width={28} />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  formatter={(v, name) => [Number(v ?? 0), String(name)]}
                />
                {/* B14: iki seri — legend olmadan renkler okunamıyordu. */}
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                />
                <Bar dataKey="listings" name="Satın Alma Talebi" fill={ZINC_900} radius={[3, 3, 0, 0]} />
                <Bar
                  dataKey="bids"
                  name={isAlim ? "Gelen Teklif" : "Verilen Teklif"}
                  fill={ZINC_400}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}

        {winPct !== null ? (
          <ChartCard
            title={isAlim ? "Kazandırma Oranı" : "Kazanma Oranı"}
            hint={
              isAlim
                ? `Son 12 ayda sonuçlanan ${data.winRate.total} satın alma talebinin ${data.winRate.won}${numberPossessive(data.winRate.won)} kazandırıldı`
                : `Son 12 ayda karara bağlanan ${data.winRate.total} teklifin ${data.winRate.won}${numberPossessive(data.winRate.won)} kazandı`
            }
          >
            <div className="relative h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "won", value: data.winRate.won },
                      {
                        name: "rest",
                        value: data.winRate.total - data.winRate.won,
                      },
                    ]}
                    dataKey="value"
                    innerRadius="68%"
                    outerRadius="90%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                  >
                    <Cell fill={EMERALD} />
                    <Cell fill={ZINC_200} />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="font-mono text-3xl font-semibold tabular-nums text-zinc-900">
                  %{winPct}
                </span>
              </div>
            </div>
          </ChartCard>
        ) : null}

        {hasOrders ? (
          <ChartCard
            title={isAlim ? "Aylık Alış Hacmi" : "Aylık Satış Hacmi"}
            hint={
              data.orders.avgTry != null
                ? `Yalnız TRY siparişler — ortalama ${formatMoney(data.orders.avgTry, "TRY")}`
                : "Yalnız TRY siparişler"
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.months}>
                <CartesianGrid vertical={false} stroke={ZINC_200} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_TICK}
                  width={52}
                  // C24: kısaltma dili formatCompactMoney ile aynı ("60 B",
                  // "1,2 Mn") — kural: KPI/eksen kısaltır, tablo/detay tam yazar.
                  tickFormatter={(v: number) =>
                    v >= 1_000_000
                      ? `${(v / 1_000_000).toLocaleString("tr-TR")} Mn`
                      : v >= 1_000
                        ? `${(v / 1_000).toLocaleString("tr-TR")} B`
                        : String(v)
                  }
                />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  formatter={(v) => [formatMoney(Number(v ?? 0), "TRY"), "Tutar"]}
                />
                <Bar dataKey="orderTotalTry" fill={ZINC_900} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}

        {data.categories.length > 0 ? (
          <ChartCard
            title="Kategori Dağılımı"
            hint={
              isAlim
                ? "Son 12 ayda açtığınız satın alma taleplerin segmentleri"
                : "Son 12 ayda teklif verdiğiniz satın alma taleplerin segmentleri"
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.categories} layout="vertical" barSize={14}>
                <CartesianGrid horizontal={false} stroke={ZINC_200} />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={CategoryTick}
                  width={140}
                />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  formatter={(v) => [Number(v ?? 0), "Satın Alma Talebi"]}
                />
                <Bar dataKey="count" fill={ZINC_900} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}
      </div>
    </div>
  );
}
