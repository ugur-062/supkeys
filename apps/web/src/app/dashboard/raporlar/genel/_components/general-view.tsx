"use client";

// V2-7+ — Genel İhale Raporu UI.
// Mod: SINGLE (tek tender) veya RANGE (tarih aralığı + filtreler).

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useDownloadGeneralReport,
  useGeneralReport,
  type GeneralPayload,
} from "@/hooks/use-reports";
import { extractErrorMessage } from "@/lib/tenders/error";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ArrowLeft,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Mode = "SINGLE" | "RANGE";

const TENDER_TYPES = ["RFQ", "ENGLISH_AUCTION"] as const;
const STATUSES = [
  "DRAFT",
  "IN_APPROVAL",
  "OPEN_FOR_BIDS",
  "IN_AWARD",
  "IN_AWARD_APPROVAL",
  "AWARDED",
  "CANCELLED",
  "CLOSED_NO_AWARD",
] as const;
const CURRENCIES = ["TRY", "USD", "EUR", "GBP"] as const;

export function GeneralReportView() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [tenderInput, setTenderInput] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [tenderType, setTenderType] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [currency, setCurrency] = useState<string>("");

  const reportMutation = useGeneralReport();
  const downloadMutation = useDownloadGeneralReport();

  const canSubmit = useMemo(() => {
    if (!mode) return false;
    if (mode === "SINGLE") return tenderInput.trim().length > 0;
    return rangeStart.length > 0 && rangeEnd.length > 0;
  }, [mode, tenderInput, rangeStart, rangeEnd]);

  const buildPayload = (): GeneralPayload | null => {
    if (mode === "SINGLE") {
      const id = tenderInput.trim();
      if (!id) {
        toast.error("Bir ihale numarası ya da ID girin");
        return null;
      }
      // Numara/ID çözümü backend'de (tenant scope) — "ilk 100" sınırı yok.
      return { mode: "SINGLE", tenderId: id };
    }
    if (mode === "RANGE") {
      return {
        mode: "RANGE",
        rangeStart: new Date(rangeStart).toISOString(),
        rangeEnd: new Date(rangeEnd).toISOString(),
        tenderType: tenderType || undefined,
        status: status || undefined,
        currency: currency || undefined,
      };
    }
    return null;
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
    setMode(null);
    setTenderInput("");
    setRangeStart("");
    setRangeEnd("");
    setTenderType("");
    setStatus("");
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
          Genel İhale Raporu
        </h1>
      </header>

      <section className="card p-5 space-y-4">
        <div>
          <p className="text-xs text-slate-500 font-medium mb-2">
            Raporlama Kriteri
          </p>
          <div className="space-y-2">
            <RadioRow
              checked={mode === "SINGLE"}
              onChange={() => setMode("SINGLE")}
              label="Tek bir ihaleyi raporlayacağım"
            />
            <RadioRow
              checked={mode === "RANGE"}
              onChange={() => setMode("RANGE")}
              label="Belirli tarih aralığındaki ihaleyi raporlayacağım"
            />
          </div>
        </div>

        {mode === "SINGLE" ? (
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
        ) : null}

        {mode === "RANGE" ? (
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
              <Label htmlFor="tt">İhale Tipi</Label>
              <SelectInput
                id="tt"
                value={tenderType}
                onChange={setTenderType}
                options={[
                  { value: "", label: "Hepsi" },
                  ...TENDER_TYPES.map((t) => ({ value: t, label: t === "RFQ" ? "RFQ" : "İngiliz Usulü" })),
                ]}
              />
            </Field>
            <Field>
              <Label htmlFor="st">İhale Statüsü</Label>
              <SelectInput
                id="st"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "", label: "Hepsi" },
                  ...STATUSES.map((s) => ({ value: s, label: s })),
                ]}
              />
            </Field>
            <Field>
              <Label htmlFor="cur">İhale Para Birimi</Label>
              <SelectInput
                id="cur"
                value={currency}
                onChange={setCurrency}
                options={[
                  { value: "", label: "Hepsi" },
                  ...CURRENCIES.map((c) => ({ value: c, label: c })),
                ]}
              />
            </Field>
          </div>
        ) : null}

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
        <GeneralResults data={reportMutation.data} />
      ) : null}
    </div>
  );
}

function RadioRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="w-4 h-4"
      />
      <span className="text-sm font-medium text-brand-900">{label}</span>
    </label>
  );
}

function SelectInput({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3.5 py-2.5 rounded-lg border border-surface-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function GeneralResults({
  data,
}: {
  data: NonNullable<ReturnType<typeof useGeneralReport>["data"]>;
}) {
  return (
    <section className="card overflow-hidden">
      <header className="px-5 py-3 border-b border-surface-border bg-slate-50/60 flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm">
          <span className="font-semibold text-brand-900">
            {data.summary.totalTenders}
          </span>{" "}
          ihale ·{" "}
          <span className="font-semibold text-success-700">
            {data.summary.awardedTenders}
          </span>{" "}
          kazandırıldı ·{" "}
          <span className="font-semibold">
            {fmtMoney(data.summary.totalAwardedValue)}
          </span>{" "}
          toplam
        </div>
        <span className="text-xs text-slate-500">
          {format(new Date(data.generatedAt), "dd MMM yyyy HH:mm", { locale: tr })}
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-50 text-brand-900">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">İhale No</th>
              <th className="px-3 py-2 text-left font-semibold">Başlık</th>
              <th className="px-3 py-2 text-left font-semibold">Tip</th>
              <th className="px-3 py-2 text-left font-semibold">Statü</th>
              <th className="px-3 py-2 text-center font-semibold">Tur</th>
              <th className="px-3 py-2 text-center font-semibold">Davetli</th>
              <th className="px-3 py-2 text-center font-semibold">Teklif</th>
              <th className="px-3 py-2 text-right font-semibold">Kazanan Tutar</th>
              <th className="px-3 py-2 text-left font-semibold">Oluşturan</th>
            </tr>
          </thead>
          <tbody>
            {data.tenders.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                  Sonuç bulunamadı
                </td>
              </tr>
            ) : (
              data.tenders.map((t) => (
                <tr key={t.id} className="border-t border-surface-border">
                  <td className="px-3 py-2 font-mono text-brand-700 font-semibold">
                    {t.tenderNumber}
                  </td>
                  <td className="px-3 py-2">{t.title}</td>
                  <td className="px-3 py-2">{t.type === "RFQ" ? "RFQ" : "İngiliz"}</td>
                  <td className="px-3 py-2 text-slate-600">{t.status}</td>
                  <td className="px-3 py-2 text-center">#{t.roundNumber}</td>
                  <td className="px-3 py-2 text-center">{t.invitedCount}</td>
                  <td className="px-3 py-2 text-center">{t.submittedBidCount}</td>
                  <td className="px-3 py-2 text-right">
                    {t.winningTotal !== null
                      ? `${fmtMoney(t.winningTotal)} ${t.currency}`
                      : "-"}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{t.createdBy ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function fmtMoney(n: number): string {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
