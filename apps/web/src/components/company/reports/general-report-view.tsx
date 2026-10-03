"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { useListingStatusLabel } from "@/i18n/domain";
import { formatNumber, intlLocale } from "@/i18n/format";
import { formatDate } from "@/lib/format-date";
import { appDayRangeIso } from "@/lib/time-zone";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
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
import { extractErrorMessage } from "@/lib/tenders/error";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { userHasPermission } from "@/lib/company/permissions";
import { ArrowLeft, FileSpreadsheet, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CURRENCIES, affixCurrency } from "@/lib/tenders/labels";
import { ReportListingPicker } from "./report-listing-picker";
import { isDayValue, isInvertedRange, readReportQuery, writeReportQuery } from "./report-url-state";

// Durum etiketi katalogdan (`useListingStatusLabel`); burada yalnız süzgeç sırası
// (yaşam döngüsü sırası). Normal kapanış doğrudan IN_AWARD'a gider; CLOSED
// yalnız admin moderasyon kapatması — sona yakın durur (derin denetim LU-28).
const STATUS_OPTIONS = [
  "DRAFT",
  "IN_APPROVAL",
  "OPEN",
  "IN_AWARD",
  "IN_AWARD_APPROVAL",
  "AWARDED",
  "CLOSED_NO_AWARD",
  "CANCELLED",
  "CLOSED",
] as const;
// Liste TEK KAYNAK: labels.ts CURRENCIES (tablodan türetilir) — Dalga B-2.

/**
 * Tutar — okuyucunun dilinde, ondalıksız; sembol tek kaynaktan
 * (`currencySymbol`). Birim ÇAĞIRANDAN: hedef toplam talebin biriminde,
 * teklif tutarları firmanın rapor biriminde (`baseCurrency`).
 */
function tl(n: number | null, locale: Locale, currency: string) {
  return n == null
    ? "—"
    : affixCurrency(n.toLocaleString(intlLocale(locale), { maximumFractionDigits: 0 }), currency, locale);
}

/** Eksi tasarruf yeşil boyanmaz (kazanan en yüksek teklifin üstünde). */
function deltaTone(n: number | null) {
  return n != null && n < 0 ? "text-red-700" : "text-emerald-700";
}

interface GeneralCriteria {
  mode: "SINGLE" | "RANGE" | null;
  listingId: string;
  rangeStart: string;
  rangeEnd: string;
  fmt: string;
  status: string;
  currency: string;
}

/** Kriter → istek gövdesi; eksik/ters kriterde null. */
function buildPayload(type: ReportType, c: GeneralCriteria): GeneralPayload | null {
  if (c.mode === "SINGLE") {
    if (!c.listingId.trim()) return null;
    return { type, mode: "SINGLE", listingId: c.listingId.trim() };
  }
  if (c.mode === "RANGE") {
    if (isInvertedRange(c.rangeStart, c.rangeEnd)) return null;
    // Günler ürün saat diliminde (İstanbul) tam gün olarak okunur.
    const range = appDayRangeIso(c.rangeStart, c.rangeEnd);
    if (!range) return null;
    return {
      type,
      mode: "RANGE",
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
      format: c.fmt || undefined,
      status: c.status || undefined,
      currency: c.currency || undefined,
    };
  }
  return null;
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

  const { user } = useCompanyAuth();
  const canOpenListing = userHasPermission(user, "buy:view");
  const report = useGeneralReport();
  const download = useDownloadGeneralReport();

  // Ters aralık (bitiş < başlangıç) satır içi hata + gönderim kapalı (D-113).
  const rangeInverted = mode === "RANGE" && isInvertedRange(rangeStart, rangeEnd);
  const canSubmit = useMemo(() => {
    if (mode === "SINGLE") return listingId.trim().length > 0;
    if (mode === "RANGE")
      return rangeStart.length > 0 && rangeEnd.length > 0 && !rangeInverted;
    return false;
  }, [mode, listingId, rangeStart, rangeEnd, rangeInverted]);

  const criteria = (): GeneralCriteria => ({
    mode,
    listingId,
    rangeStart,
    rangeEnd,
    fmt,
    status,
    currency,
  });
  const payload = () => buildPayload(type, criteria());

  const generate = async (p: GeneralPayload) => {
    try {
      await report.mutateAsync(p);
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("raporOlusturulamadi")));
    }
  };

  const run = async () => {
    const c = criteria();
    const p = buildPayload(type, c);
    if (!p) return;
    // Kriterler adrese: talebe gidip Geri'ye basınca rapor geri gelir (D-293).
    writeReportQuery(
      c.mode === "SINGLE"
        ? { mode: "SINGLE", listing: c.listingId.trim() }
        : {
            mode: "RANGE",
            start: c.rangeStart,
            end: c.rangeEnd,
            format: c.fmt,
            status: c.status,
            currency: c.currency,
          },
    );
    await generate(p);
  };

  // Açılışta adresteki kriterleri geri yükle ve raporu yeniden üret (D-293).
  useEffect(() => {
    const q = readReportQuery();
    const m = q.get("mode");
    let restored: GeneralCriteria | null = null;
    if (m === "SINGLE" && q.get("listing")) {
      restored = {
        mode: "SINGLE",
        listingId: q.get("listing") ?? "",
        rangeStart: "",
        rangeEnd: "",
        fmt: "",
        status: "",
        currency: "",
      };
    } else if (m === "RANGE" && isDayValue(q.get("start")) && isDayValue(q.get("end"))) {
      restored = {
        mode: "RANGE",
        listingId: "",
        rangeStart: q.get("start") ?? "",
        rangeEnd: q.get("end") ?? "",
        fmt: q.get("format") ?? "",
        status: q.get("status") ?? "",
        currency: q.get("currency") ?? "",
      };
    }
    if (!restored) return;
    setMode(restored.mode);
    setListingId(restored.listingId);
    setRangeStart(restored.rangeStart);
    setRangeEnd(restored.rangeEnd);
    setFmt(restored.fmt);
    setStatus(restored.status);
    setCurrency(restored.currency);
    const p = buildPayload(type, restored);
    if (p) void generate(p);
    // Yalnız açılışta bir kez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
          <ReportListingPicker
            value={listingId}
            onChange={setListingId}
            label={tr("satinAlmaTalebi")}
            placeholder={tr("secin")}
          />
        ) : null}

        {mode === "RANGE" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field>
              <Label>{tr("baslangic")}</Label>
              <Input
                type="date"
                value={rangeStart}
                max={rangeEnd || undefined}
                onChange={(e) => setRangeStart(e.target.value)}
              />
            </Field>
            <Field>
              <Label>{tr("bitis")}</Label>
              <Input
                type="date"
                value={rangeEnd}
                min={rangeStart || undefined}
                invalid={rangeInverted}
                onChange={(e) => setRangeEnd(e.target.value)}
              />
              {rangeInverted ? (
                <ErrorMessage>{tr("bitisBaslangictanOnceOlamaz")}</ErrorMessage>
              ) : null}
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
                // Sayılar okuyucunun ondalık ayırıcısıyla (ICU düz argümanı
                // biçimlemez — "%77.3", "1.2" basıyordu; arayüz testi O-033).
                [
                  tr("yanitOrani"),
                  tr("yuzde", { n: formatNumber(data.summary.overallResponseRate, locale, { maximumFractionDigits: 1 }) }),
                ],
                [tr("ortTeklif"), formatNumber(data.summary.avgBidsPerListing, locale, { maximumFractionDigits: 1 })],
                [tr("kazananToplam"), tl(data.summary.totalAwardedValue, locale, data.baseCurrency ?? "TRY")],
                [tr("toplamTasarruf"), tl(data.summary.totalDelta, locale, data.baseCurrency ?? "TRY"), data.summary.totalDelta >= 0],
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
                      {/* Talep detayı buy:view ister — yalnız rapor yetkilisine
                          bağlantı yetki duvarına götürürdü (arayüz testi T3). */}
                      {canOpenListing ? (
                        <Link
                          href={`/company/ilan/${t.id}`}
                          className="font-medium text-zinc-900 hover:text-blue-600 hover:underline"
                        >
                          {t.title}
                        </Link>
                      ) : (
                        <span className="font-medium text-zinc-900">{t.title}</span>
                      )}
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
                      {t.responseRate != null
                        ? tr("yuzde", { n: formatNumber(t.responseRate, locale, { maximumFractionDigits: 1 }) })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-600">
                      {tl(t.estimatedTotal, locale, t.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-900">
                      {tl(t.winningTotal, locale, data.baseCurrency ?? "TRY")}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-zinc-700">
                      {t.winnerName ?? "—"}
                    </TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${deltaTone(t.delta)}`}>
                      {tl(t.delta, locale, data.baseCurrency ?? "TRY")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Text className="text-xs text-zinc-400">
            {tr("tutarlarTeklifAnindakiTcmbKuruylaCur", { currency: data.baseCurrency ?? "TRY" })}
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
