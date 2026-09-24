"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { INTL_LOCALE, formatNumber } from "@/i18n/format";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Heading, Subheading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
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
  useDownloadSavingsReport,
  useSavingsReport,
  type ReportType,
  type SavingsPayload,
} from "@/hooks/use-company-reports";
import { extractErrorMessage } from "@/lib/tenders/error";
import { ArrowLeft, ChevronDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { CURRENCIES } from "@/lib/tenders/labels";

// Liste TEK KAYNAK: labels.ts CURRENCIES (tablodan türetilir) — Dalga B-2.

/** TRY toplamı — okuyucunun dilinde, ondalıksız. */
function tl(n: number | null, locale: Locale) {
  return n == null
    ? "—"
    : `${n.toLocaleString(INTL_LOCALE[locale] ?? "tr-TR", { maximumFractionDigits: 0 })} ₺`;
}

/**
 * Tasarruf (ALIM) / Rekabet Kazancı (SATIS) Raporu — tarih aralığı bazlı,
 * kalem detayına açılabilir satırlar (eski sistem deseni).
 */
export function SavingsReportView({
  type,
  basePath,
}: {
  type: ReportType;
  basePath: string;
}) {
  const t = useTranslations("web.panel.reports.savingsReportView");
  const locale = useLocale() as Locale;
  // Yüzde bir ondalıkla, okuyucunun dilinde (ICU düz argümanı sayı biçimlemez).
  const pct1 = (n: number) =>
    n.toLocaleString(INTL_LOCALE[locale] ?? "tr-TR", { maximumFractionDigits: 1 });
  const isAlim = type === "ALIM";
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [currency, setCurrency] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);

  const report = useSavingsReport();
  const download = useDownloadSavingsReport();
  const canSubmit = rangeStart.length > 0 && rangeEnd.length > 0;

  const payload = (): SavingsPayload => ({
    type,
    rangeStart: new Date(rangeStart).toISOString(),
    rangeEnd: new Date(`${rangeEnd}T23:59:59`).toISOString(),
    currency: currency || undefined,
  });

  const run = async () => {
    try {
      await report.mutateAsync(payload());
    } catch (err) {
      toast.error(extractErrorMessage(err, t("raporOlusturulamadi")));
    }
  };
  const runDownload = async () => {
    try {
      const { filename } = await download.mutateAsync(payload());
      toast.success(t("indiriliyor", { file: filename }));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("indirmeBasarisiz")));
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
          {t("raporlar")}
        </Link>
      </nav>
      <Heading>{t("tasarrufRaporu")}</Heading>
      <Text className="text-sm text-zinc-500">
        {t("kazandirilanSatinAlmaTaleplerindeRekabetin")}
      </Text>

      {/* Kriter kartı */}
      <section className="space-y-4 card p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field>
            <Label>{t("baslangic")}</Label>
            <Input
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
            />
          </Field>
          <Field>
            <Label>{t("bitis")}</Label>
            <Input
              type="date"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
            />
          </Field>
          <Field>
            <Label>{t("paraBirimiTalep")}</Label>
            <Select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="">{t("tumu")}</option>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
          <Button onClick={run} disabled={!canSubmit || report.isPending}>
            {report.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" data-slot="icon" />
            ) : null}
            {t("raporuOlustur")}
          </Button>
          <Button
            outline
            onClick={runDownload}
            disabled={!canSubmit || download.isPending}
          >
            <FileSpreadsheet data-slot="icon" />
            {t("excelIndir")}
          </Button>
        </div>
      </section>

      {report.isPending ? (
        <ReportPendingSkeleton />
      ) : data ? (
        data.rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center text-sm text-zinc-500">
            {t("buAraliktaKazandirilmisSatinAlmaTalebiYok")}
          </div>
        ) : (
          <section className="space-y-4">
            {/* Dalga B-2: bu raporda `truncated` bayrağı HİÇ yoktu — tavan
                sessizce kesiyor, kullanıcı eksik tasarruf toplamını tam
                sanıyordu. Bayrak API'ye eklendi, burada okunuyor. */}
            {data.truncated ? (
              <p
                role="status"
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              >
                {t("sonucEnFazlaKayitlaSinirlandi", { max: data.maxRows ?? 500 })}
              </p>
            ) : null}
            {/* Özet şeridi */}
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200/80 bg-zinc-950/[0.06] sm:grid-cols-3 lg:grid-cols-5">
              {(
                [
                  [t("satinAlmaTalebi"), String(data.summary.totalListings)],
                  [t("kazananToplam"), tl(data.summary.grandActual, locale)],
                  [t("toplamTasarruf"), tl(data.summary.grandDelta, locale), true],
                  [
                    t("tasarrufYuzde"),
                    t("yuzde", { n: pct1(data.summary.grandDeltaPct) }),
                    true,
                  ],
                  [
                    t("ortTasarrufYuzde"),
                    t("yuzde", { n: pct1(data.summary.avgDeltaPct) }),
                  ],
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
            <div className="flex flex-wrap gap-2">
              {data.summary.best ? (
                <Badge color="green">
                  {t("enIyi", {
                    title: data.summary.best.title,
                    pct: data.summary.best.deltaPct?.toFixed(0) ?? "-",
                  })}
                </Badge>
              ) : null}
              {data.summary.worst &&
              data.summary.worst.title !== data.summary.best?.title ? (
                <Badge color="amber">
                  {t("enZayif", {
                    title: data.summary.worst.title,
                    pct: data.summary.worst.deltaPct?.toFixed(0) ?? "-",
                  })}
                </Badge>
              ) : null}
            </div>

            {/* Satırlar — kalem detayına açılır */}
            <div className="overflow-x-auto card px-2 [--gutter:--spacing(4)]">
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t("satinAlmaTalebi")}</TableHeader>
                    <TableHeader className="text-right">{t("teklif")}</TableHeader>
                    <TableHeader className="text-right">{t("enYuksek")}</TableHeader>
                    <TableHeader className="text-right">{t("kazanan")}</TableHeader>
                    <TableHeader className="text-right">{t("tasarruf")}</TableHeader>
                    <TableHeader className="text-right">%</TableHeader>
                    <TableHeader />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.rows.map((r) => (
                    <Fragment key={r.id}>
                      <TableRow>
                        <TableCell>
                          <Link
                            href={`/company/ilan/${r.id}`}
                            className="font-medium text-zinc-900 hover:text-blue-600 hover:underline"
                          >
                            {r.title}
                          </Link>
                          <div className="tabular-nums text-xs text-zinc-400">
                            {r.number ?? "—"} ·{" "}
                            {r.winners.map((w) => w.name).join(", ") || "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.bidCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-600">
                          {tl(isAlim ? r.highestBid : r.lowestBid, locale)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-900">
                          {tl(r.winningTotal, locale)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-emerald-700">
                          {tl(r.delta, locale)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-600">
                          {r.deltaPct != null
                            ? t("yuzde", { n: r.deltaPct.toFixed(0) })
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenRow(openRow === r.id ? null : r.id)
                            }
                            aria-label={t("kalemDetayi")}
                            className="text-zinc-400 hover:text-zinc-700"
                          >
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${
                                openRow === r.id ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                        </TableCell>
                      </TableRow>
                      {openRow === r.id ? (
                        <TableRow key={`${r.id}-detail`}>
                          <TableCell colSpan={7} className="bg-zinc-50/60">
                            <div className="space-y-2 py-2">
                              <Subheading className="text-sm">
                                {t("kalemDetayi2")}
                              </Subheading>
                              <Table dense>
                                <TableHead>
                                  <TableRow>
                                    <TableHeader>{t("kalem")}</TableHeader>
                                    <TableHeader className="text-right">
                                      {t("adet")}
                                    </TableHeader>
                                    <TableHeader className="text-right">
                                      {t("hedefBirim")}
                                    </TableHeader>
                                    <TableHeader className="text-right">
                                      {t("kazananBirim")}
                                    </TableHeader>
                                    <TableHeader>
                                      {t("kazananTedarikci")}
                                    </TableHeader>
                                    <TableHeader className="text-right">
                                      {t("tasarruf")}
                                    </TableHeader>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {r.items.map((it, i) => (
                                    <TableRow key={i}>
                                      <TableCell className="text-zinc-900">
                                        {it.name}{" "}
                                        <span className="text-xs text-zinc-400">
                                          ({it.unit})
                                        </span>
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums">
                                        {it.awardedQuantity ?? it.quantity}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums text-zinc-600">
                                        {it.referenceUnitPrice != null
                                          ? formatNumber(it.referenceUnitPrice, locale)
                                          : "—"}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums text-zinc-900">
                                        {it.winningUnitPrice != null
                                          ? formatNumber(it.winningUnitPrice, locale)
                                          : "—"}
                                      </TableCell>
                                      <TableCell className="text-zinc-700">
                                        {it.winnerName ?? "—"}
                                      </TableCell>
                                      <TableCell className="text-right font-semibold tabular-nums text-emerald-700">
                                        {it.delta != null
                                          ? formatNumber(it.delta, locale)
                                          : "—"}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Karşı taraf kırılımı */}
            {data.summary.byParty.length > 0 ? (
              <div className="card p-5">
                <Subheading className="mb-3">
                  {t("tedarikciBazliKazanilanTutar")}
                </Subheading>
                <ul className="divide-y divide-zinc-50">
                  {data.summary.byParty.map((b) => (
                    <li
                      key={b.name}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span className="font-medium text-zinc-900">
                        {b.name}
                      </span>
                      <span className=" font-semibold tabular-nums">
                        {tl(b.awarded, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Text className="text-xs text-zinc-400">
              {t("tutarlarTeklifAnindakiTcmbKuruyla")}
            </Text>
          </section>
        )
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
