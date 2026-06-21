"use client";

// V2-7+ — Genel İhale Raporu UI.
// Mod: SINGLE (tek tender) veya RANGE (tarih aralığı + filtreler).

import { Radio, RadioGroup } from "@/components/catalyst/radio";
import { Select } from "@/components/catalyst/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { PageHeader } from "@/components/list";
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
import { tenderStatusLabel } from "@/lib/tenders/labels";
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

      <PageHeader title="Genel İhale Raporu" />

      <section className="card p-5 space-y-4">
        <div>
          <p className="text-xs text-slate-500 font-medium mb-2">
            Raporlama Kriteri
          </p>
          <RadioGroup
            value={mode ?? ""}
            onChange={(v) => setMode(v as Mode)}
            className="space-y-2"
          >
            <div className="flex items-center gap-2.5">
              <Radio value="SINGLE" />
              <span className="text-sm font-medium text-zinc-900">
                Tek bir ihaleyi raporlayacağım
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <Radio value="RANGE" />
              <span className="text-sm font-medium text-zinc-900">
                Belirli tarih aralığındaki ihaleyi raporlayacağım
              </span>
            </div>
          </RadioGroup>
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
                  ...STATUSES.map((s) => ({
                    value: s,
                    label: tenderStatusLabel(s),
                  })),
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
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "danger" | "brand";
}) {
  const toneCls =
    tone === "success"
      ? "text-success-700"
      : tone === "danger"
        ? "text-danger-600"
        : tone === "brand"
          ? "text-brand-700"
          : "text-brand-900";
  return (
    <div className="rounded-xl border border-surface-border bg-white px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-0.5 text-lg font-bold ${toneCls}`}>{value}</p>
    </div>
  );
}

function GeneralResults({
  data,
}: {
  data: NonNullable<ReturnType<typeof useGeneralReport>["data"]>;
}) {
  const s = data.summary;
  return (
    <div className="space-y-4">
      {/* KPI kartları */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard label="Toplam İhale" value={String(s.totalTenders)} />
        <StatCard
          label="Kazandırılan"
          value={String(s.awardedTenders)}
          tone="success"
        />
        <StatCard
          label="İptal"
          value={String(s.cancelledTenders)}
          tone="danger"
        />
        <StatCard
          label="Yanıt Oranı"
          value={`%${s.overallResponseRate}`}
          tone="brand"
        />
        <StatCard
          label="Ort. Teklif / İhale"
          value={String(s.avgBidsPerTender)}
        />
        <StatCard label="Tahmini Toplam" value={fmtMoney(s.totalEstimated)} />
        <StatCard
          label="Kazanan Toplam"
          value={fmtMoney(s.totalAwardedValue)}
        />
        <StatCard
          label="Toplam Tasarruf"
          value={fmtMoney(s.totalSavings)}
          tone={s.totalSavings >= 0 ? "success" : "danger"}
        />
      </div>

      <section className="card overflow-hidden">
        <header className="px-5 py-3 border-b border-surface-border bg-slate-50/60 flex items-center justify-end">
          <span className="text-xs text-slate-500">
            {format(new Date(data.generatedAt), "dd MMM yyyy HH:mm", {
              locale: tr,
            })}
          </span>
        </header>
        <div className="px-3 [--gutter:--spacing(3)]">
          <Table dense>
            <TableHead>
              <TableRow>
                <TableHeader>İhale No</TableHeader>
                <TableHeader>Başlık</TableHeader>
                <TableHeader>Statü</TableHeader>
                <TableHeader className="text-center">Tur</TableHeader>
                <TableHeader className="text-center">Davetli</TableHeader>
                <TableHeader className="text-center">Teklif</TableHeader>
                <TableHeader className="text-center">Yanıt %</TableHeader>
                <TableHeader className="text-right">Tahmini</TableHeader>
                <TableHeader className="text-right">Kazanan Tutar</TableHeader>
                <TableHeader>Kazanan Tedarikçi</TableHeader>
                <TableHeader className="text-right">Tasarruf</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.tenders.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="py-8 text-center text-zinc-500"
                  >
                    Sonuç bulunamadı
                  </TableCell>
                </TableRow>
              ) : (
                data.tenders.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-zinc-900 font-semibold">
                      {t.tenderNumber}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate" title={t.title}>
                      {t.title}
                    </TableCell>
                    <TableCell className="text-zinc-600">
                      {tenderStatusLabel(t.status)}
                    </TableCell>
                    <TableCell className="text-center">
                      #{t.roundNumber}
                    </TableCell>
                    <TableCell className="text-center">{t.invitedCount}</TableCell>
                    <TableCell className="text-center">
                      {t.submittedBidCount}
                    </TableCell>
                    <TableCell className="text-center text-zinc-600">
                      {t.responseRate !== null ? `%${t.responseRate}` : "-"}
                    </TableCell>
                    <TableCell className="text-right text-zinc-600">
                      {t.estimatedTotal !== null
                        ? fmtMoney(t.estimatedTotal)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {t.winningTotal !== null
                        ? `${fmtMoney(t.winningTotal)} ${t.currency}`
                        : "-"}
                    </TableCell>
                    <TableCell
                      className="max-w-[180px] truncate"
                      title={t.winnerName ?? ""}
                    >
                      {t.winnerName ?? "-"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        t.savings !== null && t.savings >= 0
                          ? "text-success-700"
                          : t.savings !== null
                            ? "text-danger-600"
                            : "text-zinc-400"
                      }`}
                    >
                      {t.savings !== null ? fmtMoney(t.savings) : "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function fmtMoney(n: number): string {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
