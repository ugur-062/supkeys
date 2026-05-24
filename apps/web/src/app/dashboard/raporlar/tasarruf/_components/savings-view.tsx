"use client";

// V2-7+ — Tasarruf Raporu UI.
// Tarih aralığı + opsiyonel para birimi; AWARDED ihalelerde hedef vs kazanan farkı.

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useDownloadSavingsReport,
  useSavingsReport,
  type SavingsPayload,
} from "@/hooks/use-reports";
import { extractErrorMessage } from "@/lib/tenders/error";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ArrowLeft,
  FileSpreadsheet,
  Loader2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const CURRENCIES = ["TRY", "USD", "EUR", "GBP"] as const;

export function SavingsReportView() {
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [currency, setCurrency] = useState<string>("");

  const reportMutation = useSavingsReport();
  const downloadMutation = useDownloadSavingsReport();

  const canSubmit = useMemo(
    () => rangeStart.length > 0 && rangeEnd.length > 0,
    [rangeStart, rangeEnd],
  );

  const buildPayload = (): SavingsPayload | null => {
    if (!canSubmit) return null;
    return {
      rangeStart: new Date(rangeStart).toISOString(),
      rangeEnd: new Date(rangeEnd).toISOString(),
      currency: currency || undefined,
    };
  };

  const handleGenerate = async () => {
    const p = buildPayload();
    if (!p) return;
    try {
      await reportMutation.mutateAsync(p);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Rapor oluşturulamadı"));
    }
  };

  const handleDownload = async () => {
    const p = buildPayload();
    if (!p) return;
    try {
      const { filename } = await downloadMutation.mutateAsync({ payload: p, format: "xlsx" });
      toast.success(`${filename} indiriliyor`);
    } catch (err) {
      toast.error(extractErrorMessage(err, "İndirme başarısız"));
    }
  };

  const reset = () => {
    setRangeStart("");
    setRangeEnd("");
    setCurrency("");
    reportMutation.reset();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <nav className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link
          href="/dashboard/raporlar"
          className="hover:text-brand-700 hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Raporlar
        </Link>
      </nav>

      <header>
        <h1 className="font-display font-bold text-2xl md:text-3xl text-brand-900">
          Tasarruf Raporu
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Verilen tarih aralığında kazandırılmış ihalelerde hedef fiyat ile
          kazanan teklif arasındaki farkı (tasarruf) gösterir.
        </p>
      </header>

      <section className="card p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field>
            <Label htmlFor="rs" required>
              Rapor Başlangıç
            </Label>
            <Input
              id="rs"
              type="datetime-local"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="re" required>
              Rapor Bitiş
            </Label>
            <Input
              id="re"
              type="datetime-local"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="cur">İhale Para Birimi</Label>
            <select
              id="cur"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-surface-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            >
              <option value="">Hepsi</option>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={handleGenerate}
              disabled={!canSubmit || reportMutation.isPending}
              loading={reportMutation.isPending}
            >
              Rapor Oluştur
            </Button>
            <Button variant="ghost" onClick={reset}>
              Tümünü Temizle
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleDownload()}
              disabled={!canSubmit || downloadMutation.isPending}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel İndir
            </Button>
          </div>
        </div>
      </section>

      {reportMutation.isPending ? (
        <div className="flex items-center justify-center py-10 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="ml-2 text-sm">Rapor hazırlanıyor…</span>
        </div>
      ) : null}

      {reportMutation.data ? <SavingsResults data={reportMutation.data} /> : null}
    </div>
  );
}

function SavingsResults({
  data,
}: {
  data: NonNullable<ReturnType<typeof useSavingsReport>["data"]>;
}) {
  const isPositive = data.summary.grandSavings >= 0;
  return (
    <>
      <section className="card p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryStat
          label="Toplam İhale"
          value={String(data.summary.totalTenders)}
        />
        <SummaryStat
          label="Hedef Toplam"
          value={fmtMoney(data.summary.grandTarget)}
        />
        <SummaryStat
          label="Kazanan Toplam"
          value={fmtMoney(data.summary.grandActual)}
        />
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-brand-700">
            {isPositive ? (
              <TrendingDown className="w-4 h-4" />
            ) : (
              <TrendingUp className="w-4 h-4" />
            )}
            Tasarruf
          </div>
          <div className="mt-1 text-xl font-bold text-brand-900">
            {fmtMoney(data.summary.grandSavings)}
          </div>
          <div className="text-xs text-slate-600 mt-0.5">
            {data.summary.grandSavingsPct.toFixed(2)}%
          </div>
        </div>
      </section>

      {/* İkincil KPI'lar: ortalama + en iyi/en düşük */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryStat
          label="Ortalama Tasarruf %"
          value={`${data.summary.avgSavingsPct.toFixed(2)}%`}
        />
        <div className="rounded-xl border border-success-200 bg-success-50/50 p-4">
          <div className="text-xs font-medium text-success-700">
            En İyi Tasarruf
          </div>
          {data.summary.bestTender ? (
            <>
              <div className="mt-1 text-sm font-bold text-brand-900">
                {data.summary.bestTender.tenderNumber} ·{" "}
                {data.summary.bestTender.savingsPct?.toFixed(2) ?? "-"}%
              </div>
              <div
                className="text-xs text-slate-600 truncate"
                title={data.summary.bestTender.title}
              >
                {data.summary.bestTender.title}
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm text-slate-400">-</div>
          )}
        </div>
        <div className="rounded-xl border border-surface-border bg-white p-4">
          <div className="text-xs font-medium text-slate-500">
            En Düşük Tasarruf
          </div>
          {data.summary.worstTender ? (
            <>
              <div className="mt-1 text-sm font-bold text-brand-900">
                {data.summary.worstTender.tenderNumber} ·{" "}
                {data.summary.worstTender.savingsPct?.toFixed(2) ?? "-"}%
              </div>
              <div
                className="text-xs text-slate-600 truncate"
                title={data.summary.worstTender.title}
              >
                {data.summary.worstTender.title}
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm text-slate-400">-</div>
          )}
        </div>
      </section>

      {data.summary.bySupplier.length > 0 ? (
        <section className="card p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Tedarikçi Bazlı Kazanılan Tutar
          </h3>
          <ul className="space-y-1.5">
            {data.summary.bySupplier.map((b) => (
              <li
                key={b.name}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-brand-900">{b.name}</span>
                <span className="font-semibold tabular-nums">
                  {fmtMoney(b.awarded)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card overflow-hidden">
        <header className="px-5 py-3 border-b border-surface-border bg-slate-50/60 flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm text-slate-600">
            {format(new Date(data.rangeStart), "dd MMM yyyy", { locale: tr })} –{" "}
            {format(new Date(data.rangeEnd), "dd MMM yyyy", { locale: tr })}
            {data.currency ? ` · ${data.currency}` : ""}
          </span>
          <span className="text-xs text-slate-500">
            {format(new Date(data.generatedAt), "dd MMM yyyy HH:mm", {
              locale: tr,
            })}
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-50 text-brand-900">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">İhale No</th>
                <th className="px-3 py-2 text-left font-semibold">Başlık</th>
                <th className="px-3 py-2 text-left font-semibold">Para</th>
                <th className="px-3 py-2 text-right font-semibold">Hedef</th>
                <th className="px-3 py-2 text-right font-semibold">Kazanan</th>
                <th className="px-3 py-2 text-right font-semibold">Tasarruf</th>
                <th className="px-3 py-2 text-right font-semibold">%</th>
                <th className="px-3 py-2 text-left font-semibold">
                  Kazanan Tedarikçi
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    Bu aralıkta AWARDED ihale bulunamadı.
                  </td>
                </tr>
              ) : (
                data.rows.map((r) => (
                  <tr key={r.id} className="border-t border-surface-border">
                    <td className="px-3 py-2 font-mono text-brand-700 font-semibold">
                      {r.tenderNumber}
                    </td>
                    <td className="px-3 py-2">{r.title}</td>
                    <td className="px-3 py-2">{r.currency}</td>
                    <td className="px-3 py-2 text-right">
                      {fmtMoney(r.targetTotal)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmtMoney(r.actualTotal)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-success-700">
                      {r.savings !== null ? fmtMoney(r.savings) : "-"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.savingsPct !== null
                        ? `${r.savingsPct.toFixed(2)}%`
                        : "-"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {r.winners.map((w) => w.name).join(", ") || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {data.rows.some((r) => r.items.length > 0) ? (
        <section className="card overflow-hidden">
          <header className="px-5 py-3 border-b border-surface-border bg-slate-50/60">
            <h3 className="text-sm font-semibold text-brand-900">
              Kalem Bazlı Tasarruf
            </h3>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-brand-50 text-brand-900">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">İhale No</th>
                  <th className="px-3 py-2 text-left font-semibold">Kalem</th>
                  <th className="px-3 py-2 text-center font-semibold">
                    Kazanan Adet
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Hedef Birim
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Kazanan Birim
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">Kazanan</th>
                  <th className="px-3 py-2 text-right font-semibold">Tasarruf</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.flatMap((r) =>
                  r.items.map((it, idx) => (
                    <tr
                      key={`${r.id}-${idx}`}
                      className="border-t border-surface-border"
                    >
                      <td className="px-3 py-2 font-mono text-brand-700">
                        {r.tenderNumber}
                      </td>
                      <td className="px-3 py-2">{it.name}</td>
                      <td className="px-3 py-2 text-center">
                        {it.awardedQuantity ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {it.targetUnitPrice !== null
                          ? fmtMoney(it.targetUnitPrice)
                          : "-"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {it.winningUnitPrice !== null
                          ? fmtMoney(it.winningUnitPrice)
                          : "-"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {it.winnerName ?? "-"}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-medium ${
                          it.savings !== null && it.savings >= 0
                            ? "text-success-700"
                            : it.savings !== null
                              ? "text-danger-600"
                              : "text-slate-400"
                        }`}
                      >
                        {it.savings !== null ? fmtMoney(it.savings) : "-"}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-surface-border bg-white p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-brand-900">{value}</div>
    </div>
  );
}

function fmtMoney(n: number): string {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
