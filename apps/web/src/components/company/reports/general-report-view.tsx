"use client";

import { formatDate } from "@/lib/format-date";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Heading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { Radio, RadioField, RadioGroup } from "@/components/catalyst/radio";
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
  useDownloadGeneralReport,
  useGeneralReport,
  type GeneralPayload,
  type ReportType,
} from "@/hooks/use-company-reports";
import { useTenders } from "@/hooks/use-company-tenders";
import { extractErrorMessage } from "@/lib/tenders/error";
import { ArrowLeft, FileSpreadsheet, Loader2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CURRENCIES } from "@/lib/tenders/labels";

const STATUS_TR: Record<string, string> = {
  DRAFT: "Taslak",
  IN_APPROVAL: "Onayda",
  OPEN: "Yayında",
  CLOSED: "Teklife Kapalı",
  IN_AWARD_APPROVAL: "Kazandırma Onayı",
  AWARDED: "Tamamlandı",
  CANCELLED: "İptal",
  CLOSED_NO_AWARD: "Kazansız",
};
// Liste TEK KAYNAK: labels.ts CURRENCIES (tablodan türetilir) — Dalga B-2.

function tl(n: number | null) {
  return n == null
    ? "—"
    : `${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺`;
}

/** Genel İhale/İlan Raporu — tek ihale VEYA tarih aralığı (eski sistem deseni). */
export function GeneralReportView({
  type,
  basePath,
}: {
  type: ReportType;
  basePath: string; // "/company/satinalma/raporlar" | "/company/satis/raporlar"
}) {
  const isAlim = type === "ALIM";
  const deltaWord = isAlim ? "Tasarruf" : "Kazanç";
  const [mode, setMode] = useState<"SINGLE" | "RANGE" | null>(null);
  const [listingId, setListingId] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [fmt, setFmt] = useState("");
  const [status, setStatus] = useState("");
  const [currency, setCurrency] = useState("");

  const myTenders = useTenders(type);
  const report = useGeneralReport();
  const download = useDownloadGeneralReport();

  const canSubmit = useMemo(() => {
    if (mode === "SINGLE") return listingId.trim().length > 0;
    if (mode === "RANGE") return rangeStart.length > 0 && rangeEnd.length > 0;
    return false;
  }, [mode, listingId, rangeStart, rangeEnd]);

  const payload = (): GeneralPayload | null => {
    if (mode === "SINGLE") {
      if (!listingId.trim()) return null;
      return { type, mode: "SINGLE", listingId: listingId.trim() };
    }
    if (mode === "RANGE") {
      return {
        type,
        mode: "RANGE",
        rangeStart: new Date(rangeStart).toISOString(),
        rangeEnd: new Date(`${rangeEnd}T23:59:59`).toISOString(),
        format: fmt || undefined,
        status: status || undefined,
        currency: currency || undefined,
      };
    }
    return null;
  };

  const run = async () => {
    const p = payload();
    if (!p) return;
    try {
      await report.mutateAsync(p);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Rapor oluşturulamadı"));
    }
  };
  const runDownload = async () => {
    const p = payload();
    if (!p) return;
    try {
      const { filename } = await download.mutateAsync(p);
      toast.success(`${filename} indiriliyor`);
    } catch (err) {
      toast.error(extractErrorMessage(err, "İndirme başarısız"));
    }
  };

  const data = report.data;

  return (
    <div className="space-y-5">
      <nav className="text-sm text-zinc-500">
        <Link
          href={basePath}
          className="inline-flex items-center gap-1 hover:text-zinc-800 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Raporlar
        </Link>
      </nav>
      <Heading>{isAlim ? "Genel İhale Raporu" : "Genel İlan Raporu"}</Heading>

      {/* Kriter kartı */}
      <section className="space-y-4 card p-5 shadow-sm">
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-500">
            Raporlama Kriteri
          </p>
          <RadioGroup
            value={mode ?? ""}
            onChange={(v) => setMode(v as "SINGLE" | "RANGE")}
            className="space-y-2"
          >
            <RadioField>
              <Radio value="SINGLE" />
              <Label>
                Tek bir {isAlim ? "ihaleyi" : "ilanı"} raporlayacağım
              </Label>
            </RadioField>
            <RadioField>
              <Radio value="RANGE" />
              <Label>
                Belirli tarih aralığındaki {isAlim ? "ihaleleri" : "ilanları"}{" "}
                raporlayacağım
              </Label>
            </RadioField>
          </RadioGroup>
        </div>

        {mode === "SINGLE" ? (
          <Field>
            <Label>{isAlim ? "İhale" : "İlan"}</Label>
            <Select
              value={listingId}
              onChange={(e) => setListingId(e.target.value)}
            >
              <option value="">— Seçin —</option>
              {(myTenders.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tenderNumber} — {t.title}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {mode === "RANGE" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field>
              <Label>Başlangıç</Label>
              <Input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
              />
            </Field>
            <Field>
              <Label>Bitiş</Label>
              <Input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
              />
            </Field>
            <Field>
              <Label>Usul</Label>
              <Select value={fmt} onChange={(e) => setFmt(e.target.value)}>
                <option value="">Tümü</option>
                <option value="RFQ">Teklif Toplama</option>
                <option value="ENGLISH_AUCTION">Pazarlık</option>
              </Select>
            </Field>
            <Field>
              <Label>Durum</Label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Tümü</option>
                {Object.entries(STATUS_TR).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <Label>Para Birimi</Label>
              <Select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="">Tümü</option>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
          <Button onClick={run} disabled={!canSubmit || report.isPending}>
            {report.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" data-slot="icon" />
            ) : null}
            Raporu Oluştur
          </Button>
          <Button
            outline
            onClick={runDownload}
            disabled={!canSubmit || download.isPending}
          >
            <FileSpreadsheet data-slot="icon" />
            Excel İndir
          </Button>
        </div>
      </section>

      {/* Sonuç */}
      {report.isPending ? (
        <ReportPendingSkeleton />
      ) : data ? (
        <section className="space-y-4">
          {/* Dalga B-2: sunucu tavanı SESSİZ kesiyordu — kullanıcı eksik listeyi
              tam sanıyordu. Sözleşme (`truncated`/`maxRows`) API'de vardı ama
              hiçbir yüzey okumuyordu. */}
          {data.truncated ? (
            <p
              role="status"
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              Sonuç en fazla {data.maxRows ?? 500} kayıtla sınırlandı — daha
              eskiler bu raporda YOK. Tarih aralığını daraltarak tamamını
              görebilirsiniz.
            </p>
          ) : null}
          {/* Özet şeridi */}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200/80 bg-zinc-950/[0.06] sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                [
                  isAlim ? "Toplam İhale" : "Toplam İlan",
                  String(data.summary.totalListings),
                ],
                ["Kazandırılan", String(data.summary.awardedListings)],
                ["Yanıt Oranı", `%${data.summary.overallResponseRate}`],
                ["Ort. Teklif", String(data.summary.avgBidsPerListing)],
                ["Kazanan Toplam", tl(data.summary.totalAwardedValue)],
                [`Toplam ${deltaWord}`, tl(data.summary.totalDelta), true],
              ] as Array<[string, string, boolean?]>
            ).map(([k, v, accent]) => (
              <div key={k} className="bg-white p-3.5">
                <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {k}
                </dt>
                <dd
                  className={`mt-0.5 truncate text-lg font-bold tabular-nums ${
                    accent ? "text-emerald-600" : "text-zinc-900"
                  }`}
                >
                  {v}
                </dd>
              </div>
            ))}
          </dl>

          <div className="overflow-x-auto card px-2 [--gutter:--spacing(4)]">
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader className="sticky left-0 z-10 bg-white">{isAlim ? "İhale" : "İlan"}</TableHeader>
                  <TableHeader>Durum</TableHeader>
                  <TableHeader className="text-right">Davet</TableHeader>
                  <TableHeader className="text-right">Teklif</TableHeader>
                  <TableHeader className="text-right">Yanıt %</TableHeader>
                  <TableHeader className="text-right">
                    {isAlim ? "Hedef" : "Taban"}
                  </TableHeader>
                  <TableHeader className="text-right">Kazanan</TableHeader>
                  <TableHeader>
                    {isAlim ? "Kazanan Tedarikçi" : "Kazanan Alıcı"}
                  </TableHeader>
                  <TableHeader className="text-right">{deltaWord}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.listings.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="sticky left-0 z-10 bg-white">
                      <Link
                        href={`/company/ilan/${t.id}`}
                        className="font-medium text-zinc-900 hover:text-blue-600 hover:underline"
                      >
                        {t.title}
                      </Link>
                      <div className="tabular-nums text-xs text-zinc-400">
                        {t.number ?? "—"}
                        {t.closesAt
                          ? ` · ${formatDate(t.closesAt, "short")}`
                          : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge color="zinc">
                        {STATUS_TR[t.status] ?? t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.invitedCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.submittedBidCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.responseRate != null ? `%${t.responseRate}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-600">
                      {tl(t.estimatedTotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-900">
                      {tl(t.winningTotal)}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-zinc-700">
                      {t.winnerName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-emerald-700">
                      {tl(t.delta)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Text className="text-xs text-zinc-400">
            Tutarlar teklif anındaki TCMB kuruyla TRY karşılığı olarak
            gösterilir.
          </Text>
        </section>
      ) : null}
    </div>
  );
}

/** Rapor üretilirken sonuç alanı yer tutucusu (tek skeleton dili). */
function ReportPendingSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-zinc-100" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />
    </div>
  );
}
