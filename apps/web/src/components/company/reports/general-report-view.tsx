"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { useListingStatusLabel } from "@/i18n/domain";
import { INTL_LOCALE } from "@/i18n/format";
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
import { Link } from "@/i18n/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CURRENCIES } from "@/lib/tenders/labels";

// Durum etiketi katalogdan (`useListingStatusLabel`); burada yalnız süzgeç sırası.
const STATUS_OPTIONS = [
  "DRAFT",
  "IN_APPROVAL",
  "OPEN",
  "CLOSED",
  "IN_AWARD_APPROVAL",
  "AWARDED",
  "CANCELLED",
  "CLOSED_NO_AWARD",
] as const;
// Liste TEK KAYNAK: labels.ts CURRENCIES (tablodan türetilir) — Dalga B-2.

/** TRY toplamı — okuyucunun dilinde, ondalıksız. */
function tl(n: number | null, locale: Locale) {
  return n == null
    ? "—"
    : `${n.toLocaleString(INTL_LOCALE[locale] ?? "tr-TR", { maximumFractionDigits: 0 })} ₺`;
}

/** Genel İhale/İlan Raporu — tek ihale VEYA tarih aralığı (eski sistem deseni). */
export function GeneralReportView({
  type,
  basePath,
}: {
  type: ReportType;
  basePath: string; // "/company/sirketim/raporlar"
}) {
  const tr = useTranslations("web.panel.reports.generalReportView");
  const locale = useLocale() as Locale;
  const statusLabel = useListingStatusLabel();
  const [mode, setMode] = useState<"SINGLE" | "RANGE" | null>(null);
  const [listingId, setListingId] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [fmt, setFmt] = useState("");
  const [status, setStatus] = useState("");
  const [currency, setCurrency] = useState("");

  const myTenders = useTenders();
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
      toast.error(extractErrorMessage(err, tr("raporOlusturulamadi")));
    }
  };
  const runDownload = async () => {
    const p = payload();
    if (!p) return;
    try {
      const { filename } = await download.mutateAsync(p);
      toast.success(tr("indiriliyor", { file: filename }));
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("indirmeBasarisiz")));
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
          {tr("raporlar")}
        </Link>
      </nav>
      <Heading>{tr("genelSatinAlmaTalebiRaporu")}</Heading>

      {/* Kriter kartı */}
      <section className="space-y-4 card p-5 shadow-sm">
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-500">
            {tr("raporlamaKriteri")}
          </p>
          <RadioGroup
            value={mode ?? ""}
            onChange={(v) => setMode(v as "SINGLE" | "RANGE")}
            className="space-y-2"
          >
            <RadioField>
              <Radio value="SINGLE" />
              <Label>{tr("tekBirSatinAlmaTalebiniRaporlayacagim")}</Label>
            </RadioField>
            <RadioField>
              <Radio value="RANGE" />
              <Label>{tr("belirliTarihAraligindakiSatinAlmaTaleplerini")}</Label>
            </RadioField>
          </RadioGroup>
        </div>

        {mode === "SINGLE" ? (
          <Field>
            <Label>{tr("satinAlmaTalebi")}</Label>
            <Select
              value={listingId}
              onChange={(e) => setListingId(e.target.value)}
            >
              <option value="">{tr("secin")}</option>
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
              <Label>{tr("baslangic")}</Label>
              <Input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
              />
            </Field>
            <Field>
              <Label>{tr("bitis")}</Label>
              <Input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
              />
            </Field>
            <Field>
              <Label>{tr("usul")}</Label>
              <Select value={fmt} onChange={(e) => setFmt(e.target.value)}>
                <option value="">{tr("tumu")}</option>
                <option value="RFQ">{tr("teklifToplama")}</option>
                <option value="ENGLISH_AUCTION">{tr("pazarlik")}</option>
              </Select>
            </Field>
            <Field>
              <Label>{tr("durum")}</Label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{tr("tumu")}</option>
                {STATUS_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {statusLabel(v)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <Label>{tr("paraBirimi")}</Label>
              <Select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="">{tr("tumu")}</option>
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
            {tr("raporuOlustur")}
          </Button>
          <Button
            outline
            onClick={runDownload}
            disabled={!canSubmit || download.isPending}
          >
            <FileSpreadsheet data-slot="icon" />
            {tr("excelIndir")}
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
              {tr("sonucEnFazlaKayitlaSinirlandi", { max: data.maxRows ?? 500 })}
            </p>
          ) : null}
          {/* Özet şeridi */}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200/80 bg-zinc-950/[0.06] sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                [
                  tr("toplamSatinAlmaTalebi"),
                  String(data.summary.totalListings),
                ],
                [tr("kazandirilan"), String(data.summary.awardedListings)],
                [tr("yanitOrani"), tr("yuzde", { n: data.summary.overallResponseRate })],
                [tr("ortTeklif"), String(data.summary.avgBidsPerListing)],
                [tr("kazananToplam"), tl(data.summary.totalAwardedValue, locale)],
                [tr("toplamTasarruf"), tl(data.summary.totalDelta, locale), true],
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
                  <TableHeader className="sticky left-0 z-10 bg-white">{tr("satinAlmaTalebi")}</TableHeader>
                  <TableHeader>{tr("durum")}</TableHeader>
                  <TableHeader className="text-right">{tr("davet")}</TableHeader>
                  <TableHeader className="text-right">{tr("teklif")}</TableHeader>
                  <TableHeader className="text-right">{tr("yanit")}</TableHeader>
                  <TableHeader className="text-right">{tr("hedef")}</TableHeader>
                  <TableHeader className="text-right">{tr("kazanan")}</TableHeader>
                  <TableHeader>{tr("kazananTedarikci")}</TableHeader>
                  <TableHeader className="text-right">{tr("tasarruf")}</TableHeader>
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
                          ? ` · ${formatDate(t.closesAt, "short", locale)}`
                          : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge color="zinc">
                        {statusLabel(t.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.invitedCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.submittedBidCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.responseRate != null ? tr("yuzde", { n: t.responseRate }) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-600">
                      {tl(t.estimatedTotal, locale)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-900">
                      {tl(t.winningTotal, locale)}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-zinc-700">
                      {t.winnerName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-emerald-700">
                      {tl(t.delta, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Text className="text-xs text-zinc-400">
            {tr("tutarlarTeklifAnindakiTcmbKuruyla")}
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
