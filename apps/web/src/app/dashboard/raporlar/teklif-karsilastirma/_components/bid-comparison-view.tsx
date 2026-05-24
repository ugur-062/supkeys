"use client";

// V2-7+ — Teklif Karşılaştırma Raporu UI.
// Form: İhale No (tender number veya UUID) + criteria + 3 checkbox.
// Submit → web'de tablo render; ek olarak PDF/Excel indir.

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useBidComparisonReport,
  useDownloadBidComparisonReport,
  type BidComparisonPayload,
} from "@/hooks/use-reports";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Criterion = "PRICE" | "ANSWERS" | "BOTH";

export function BidComparisonView() {
  const [tenderInput, setTenderInput] = useState("");
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [openCrit, setOpenCrit] = useState(false);
  const [includeAllRounds, setIncludeAllRounds] = useState(false);
  const [includeNonBidders, setIncludeNonBidders] = useState(false);
  const [showBidCurrencies, setShowBidCurrencies] = useState(true);

  const reportMutation = useBidComparisonReport();
  const downloadMutation = useDownloadBidComparisonReport();

  const canSubmit = useMemo(() => {
    if (!tenderInput.trim()) return false;
    if (criteria.length === 0) return false;
    return true;
  }, [tenderInput, criteria]);

  const buildPayload = (): BidComparisonPayload | null => {
    const tenderId = tenderInput.trim();
    if (!tenderId) {
      toast.error("Bir ihale numarası ya da ID girin");
      return null;
    }
    // Numara/ID çözümü backend'de (tenant scope) — "ilk 100" sınırı yok.
    return {
      tenderId,
      criteria,
      includeAllRounds,
      includeNonBidders,
      showBidCurrencies,
    };
  };

  const handleGenerate = async () => {
    const payload = buildPayload();
    if (!payload) return;
    try {
      await reportMutation.mutateAsync(payload);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Rapor oluşturulamadı"));
    }
  };

  const handleDownload = async () => {
    const payload = buildPayload();
    if (!payload) return;
    try {
      const { filename } = await downloadMutation.mutateAsync({ payload, format: "xlsx" });
      toast.success(`${filename} indiriliyor`);
    } catch (err) {
      toast.error(extractErrorMessage(err, "İndirme başarısız"));
    }
  };

  const reset = () => {
    setTenderInput("");
    setCriteria([]);
    setIncludeAllRounds(false);
    setIncludeNonBidders(false);
    setShowBidCurrencies(true);
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
          Teklif Karşılaştırma Raporu
        </h1>
      </header>

      <section className="card p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field>
            <Label htmlFor="tender-no" required>
              İhale No
            </Label>
            <Input
              id="tender-no"
              placeholder="Ör. 2464-1"
              value={tenderInput}
              onChange={(e) => setTenderInput(e.target.value)}
            />
          </Field>

          <Field>
            <Label required>Rapor Karşılaştırma Kriteri</Label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenCrit((o) => !o)}
                className="w-full text-left px-3.5 py-2.5 rounded-lg border border-surface-border bg-white text-sm flex items-center justify-between hover:border-brand-300"
              >
                <span className={criteria.length === 0 ? "text-slate-400" : ""}>
                  {criteria.length === 0
                    ? "Seçin…"
                    : criteria.map((c) => CRIT_LABEL[c]).join(", ")}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {openCrit ? (
                <div className="absolute z-10 mt-1 w-full bg-white rounded-lg border border-surface-border shadow-lg p-1.5">
                  {(["PRICE", "ANSWERS", "BOTH"] as const).map((c) => (
                    <label
                      key={c}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={criteria.includes(c)}
                        onChange={(e) =>
                          setCriteria((prev) =>
                            e.target.checked
                              ? Array.from(new Set([...prev, c]))
                              : prev.filter((x) => x !== c),
                          )
                        }
                      />
                      <span className="text-sm">{CRIT_LABEL[c]}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          </Field>
        </div>

        <div className="space-y-2 pt-1">
          <CheckboxRow
            checked={includeAllRounds}
            onChange={setIncludeAllRounds}
            label="Tüm turları göster"
          />
          <CheckboxRow
            checked={includeNonBidders}
            onChange={setIncludeNonBidders}
            label="Teklif vermeyenleri göster"
          />
          <CheckboxRow
            checked={showBidCurrencies}
            onChange={setShowBidCurrencies}
            label="Teklif para birimlerini göster"
            hint="İhale ana para birimine ek olarak teklif para birimlerini de görebilirsiniz."
          />
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

      {reportMutation.data ? (
        <BidComparisonResults data={reportMutation.data} />
      ) : null}
    </div>
  );
}

const CRIT_LABEL: Record<Criterion, string> = {
  PRICE: "Fiyata göre",
  ANSWERS: "Kalem yanıtlarına göre",
  BOTH: "Hem fiyat hem kalem yanıtlarına göre",
};

function CheckboxRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div>
        <p className="text-sm font-medium text-brand-900">{label}</p>
        {hint ? <p className="text-xs text-slate-500 mt-0.5">{hint}</p> : null}
      </div>
    </label>
  );
}

function BidComparisonResults({
  data,
}: {
  data: NonNullable<ReturnType<typeof useBidComparisonReport>["data"]>;
}) {
  if (data.rounds.length === 0) {
    return (
      <p className="text-center text-sm text-slate-500 py-10">
        Bu kriterlere uyan tur bulunamadı.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      {data.rounds.map((round) => (
        <RoundTable key={round.tenderId} round={round} data={data} />
      ))}
    </div>
  );
}

function RoundTable({
  round,
  data,
}: {
  round: NonNullable<ReturnType<typeof useBidComparisonReport>["data"]>["rounds"][number];
  data: NonNullable<ReturnType<typeof useBidComparisonReport>["data"]>;
}) {
  return (
    <section className="card overflow-hidden">
      <header className="px-5 py-3 border-b border-surface-border bg-slate-50/60">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-sm font-mono text-brand-700 font-semibold">
            {round.tenderNumber}
          </code>
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-xs font-bold">
            Tur #{round.roundNumber}
          </span>
          <span className="text-sm text-slate-500">· {round.currency}</span>
        </div>
        <p className="font-semibold text-brand-900 mt-1">{round.title}</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-50 text-brand-900">
            <tr>
              <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                Kalem
              </th>
              <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">
                Adet/Birim
              </th>
              <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                Hedef Birim
              </th>
              {round.suppliers.map((s) => (
                <th
                  key={s.supplierId}
                  colSpan={
                    (data.includePrice ? 2 : 0) + (data.includeAnswers ? 1 : 0)
                  }
                  className="px-3 py-2 text-center font-semibold border-l border-surface-border"
                >
                  <div className="truncate max-w-[200px] mx-auto">
                    {s.companyName}
                  </div>
                  {!s.submitted ? (
                    <span className="text-[10px] text-slate-500 font-normal">
                      (Teklif yok)
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
            {data.includePrice || data.includeAnswers ? (
              <tr className="text-xs text-slate-600">
                <th></th>
                <th></th>
                <th></th>
                {round.suppliers.map((s) =>
                  [
                    data.includePrice && (
                      <th
                        key={`p-u-${s.supplierId}`}
                        className="px-3 py-1.5 text-right font-medium border-l border-surface-border"
                      >
                        Birim
                      </th>
                    ),
                    data.includePrice && (
                      <th
                        key={`p-t-${s.supplierId}`}
                        className="px-3 py-1.5 text-right font-medium"
                      >
                        Toplam
                      </th>
                    ),
                    data.includeAnswers && (
                      <th
                        key={`a-${s.supplierId}`}
                        className={cn(
                          "px-3 py-1.5 text-left font-medium",
                          !data.includePrice && "border-l border-surface-border",
                        )}
                      >
                        Yanıt
                      </th>
                    ),
                  ]
                    .filter(Boolean)
                    .flat(),
                )}
              </tr>
            ) : null}
          </thead>
          <tbody>
            {round.items.map((item) => (
              <tr key={item.id} className="border-t border-surface-border">
                <td className="px-3 py-2 font-semibold">{item.name}</td>
                <td className="px-3 py-2 text-center text-slate-600">
                  {item.quantity} {item.unit}
                </td>
                <td className="px-3 py-2 text-right">
                  {item.targetUnitPrice !== null
                    ? fmtMoney(item.targetUnitPrice)
                    : "-"}
                </td>
                {round.suppliers.map((s) => {
                  const ip = s.itemPrices.find((x) => x.tenderItemId === item.id);
                  const ia = s.itemAnswers.find((x) => x.tenderItemId === item.id);
                  return (
                    <Cell
                      key={s.supplierId}
                      supplierId={s.supplierId}
                      includePrice={data.includePrice}
                      includeAnswers={data.includeAnswers}
                      unitPrice={ip?.unitPrice ?? null}
                      totalPrice={ip?.totalPrice ?? null}
                      answer={ia?.customAnswer ?? null}
                    />
                  );
                })}
              </tr>
            ))}
            {data.includePrice ? (
              <tr className="border-t border-surface-border bg-brand-50 font-semibold">
                <td className="px-3 py-2" colSpan={3}>
                  GENEL TOPLAM
                </td>
                {round.suppliers.map((s) => (
                  <TotalCells
                    key={s.supplierId}
                    includePrice={data.includePrice}
                    includeAnswers={data.includeAnswers}
                    total={s.totalAmount}
                  />
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Cell({
  supplierId,
  includePrice,
  includeAnswers,
  unitPrice,
  totalPrice,
  answer,
}: {
  supplierId: string;
  includePrice: boolean;
  includeAnswers: boolean;
  unitPrice: number | null;
  totalPrice: number | null;
  answer: string | null;
}) {
  return (
    <>
      {includePrice ? (
        <>
          <td
            key={`u-${supplierId}`}
            className="px-3 py-2 text-right border-l border-surface-border"
          >
            {unitPrice !== null ? fmtMoney(unitPrice) : "-"}
          </td>
          <td key={`t-${supplierId}`} className="px-3 py-2 text-right">
            {totalPrice !== null ? fmtMoney(totalPrice) : "-"}
          </td>
        </>
      ) : null}
      {includeAnswers ? (
        <td
          key={`a-${supplierId}`}
          className={cn(
            "px-3 py-2 text-slate-700 max-w-[240px] truncate",
            !includePrice && "border-l border-surface-border",
          )}
        >
          {answer ?? "-"}
        </td>
      ) : null}
    </>
  );
}

function TotalCells({
  includePrice,
  includeAnswers,
  total,
}: {
  includePrice: boolean;
  includeAnswers: boolean;
  total: number | null;
}) {
  return (
    <>
      {includePrice ? (
        <>
          <td className="px-3 py-2 border-l border-surface-border" />
          <td className="px-3 py-2 text-right">
            {total !== null ? fmtMoney(total) : "-"}
          </td>
        </>
      ) : null}
      {includeAnswers ? <td className="px-3 py-2" /> : null}
    </>
  );
}

function fmtMoney(n: number): string {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
