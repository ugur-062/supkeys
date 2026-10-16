"use client";

import { ID_TOKEN_CLASS } from "@/lib/id-token";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { formatNumber, intlLocale } from "@/i18n/format";
import { useUnitLabel } from "@/i18n/domain";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
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
import { appDayRangeIso } from "@/lib/time-zone";
import { ArrowLeft, ChevronDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { CURRENCIES, affixCurrency } from "@/lib/tenders/labels";
import { MONEY_FRACTION } from "@/lib/line-amount";
import {
  REPORT_FIRST_COL_WITH_TOGGLE,
  REPORT_STICKY_CELL,
  REPORT_STICKY_HEADER,
  summaryTileSpan,
} from "./report-table";
import { isDayValue, isInvertedRange, readReportQuery, writeReportQuery } from "./report-url-state";

// Liste TEK KAYNAK: labels.ts CURRENCIES (tablodan türetilir) — Dalga B-2.

/** Tutar — okuyucunun dilinde, ondalıksız; birim firmanın rapor birimi (`baseCurrency`). */
function tl(n: number | null, locale: Locale, currency: string) {
  return n == null
    ? "—"
    : affixCurrency(n.toLocaleString(intlLocale(locale), { maximumFractionDigits: 0 }), currency, locale);
}

/** Kalem birim fiyatı/tasarrufu — 2 ondalık, birim etiketli (D-295). */
function money2(n: number, locale: Locale, currency: string) {
  return affixCurrency(formatNumber(n, locale, MONEY_FRACTION), currency, locale);
}

/** Eksi tasarruf yeşil boyanmaz (kazanan en yüksek teklifin / hedefin üstünde). */
function deltaTone(n: number | null) {
  return n != null && n < 0 ? "text-red-700" : "text-emerald-700";
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
  // Birim Türkçe ad olarak saklanır ("adet") — EN/RU'da katalogdan çevrilir.
  const unitLabel = useUnitLabel();
  // Yüzde bir ondalıkla, okuyucunun dilinde (ICU düz argümanı sayı biçimlemez).
  // Önce gösterilecek basamağa yuvarlanır ve `+ 0` ile -0 atılır: sıfıra
  // yuvarlanan küçük eksi değer Intl'de "-0" basıyordu ("%-0"; arayüz testi webB-01).
  const pct1 = (n: number) =>
    (Math.round(n * 10) / 10 + 0).toLocaleString(intlLocale(locale), { maximumFractionDigits: 1 });
  const pct0 = (n: number) => formatNumber(Math.round(n) + 0, locale, { maximumFractionDigits: 0 });
  const isAlim = type === "ALIM";
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [currency, setCurrency] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);

  const report = useSavingsReport();
  const download = useDownloadSavingsReport();
  // Ters aralık (bitiş < başlangıç) satır içi hata + gönderim kapalı (D-113).
  const rangeInverted = isInvertedRange(rangeStart, rangeEnd);
  const canSubmit = rangeStart.length > 0 && rangeEnd.length > 0 && !rangeInverted;

  // Günler ürün saat diliminde (İstanbul) tam gün olarak okunur.
  const buildPayload = (start: string, end: string, cur: string): SavingsPayload | null => {
    if (isInvertedRange(start, end)) return null;
    const range = appDayRangeIso(start, end);
    if (!range) return null;
    return { type, ...range, currency: cur || undefined };
  };
  const payload = () => buildPayload(rangeStart, rangeEnd, currency);

  const generate = async (p: SavingsPayload) => {
    try {
      await report.mutateAsync(p);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("raporOlusturulamadi")));
    }
  };

  const run = async () => {
    const p = payload();
    if (!p) return;
    // Kriterler adrese: talebe gidip Geri'ye basınca rapor geri gelir (D-293).
    writeReportQuery({ start: rangeStart, end: rangeEnd, currency });
    await generate(p);
  };

  // Açılışta adresteki kriterleri geri yükle ve raporu yeniden üret (D-293).
  useEffect(() => {
    const q = readReportQuery();
    const start = q.get("start");
    const end = q.get("end");
    if (!isDayValue(start) || !isDayValue(end)) return;
    const cur = q.get("currency") ?? "";
    setRangeStart(start);
    setRangeEnd(end);
    setCurrency(cur);
    const p = buildPayload(start, end, cur);
    if (p) void generate(p);
    // Yalnız açılışta bir kez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const runDownload = async () => {
    const p = payload();
    if (!p) return;
    try {
      const { filename } = await download.mutateAsync(p);
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
              max={rangeEnd || undefined}
              onChange={(e) => setRangeStart(e.target.value)}
            />
          </Field>
          <Field>
            <Label>{t("bitis")}</Label>
            <Input
              type="date"
              value={rangeEnd}
              min={rangeStart || undefined}
              invalid={rangeInverted}
              onChange={(e) => setRangeEnd(e.target.value)}
            />
            {rangeInverted ? (
              <ErrorMessage>{t("bitisBaslangictanOnceOlamaz")}</ErrorMessage>
            ) : null}
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
          <Button
            onClick={run}
            disabled={!canSubmit || report.isPending}
            aria-describedby={!canSubmit && !rangeInverted ? "savings-range-hint" : undefined}
          >
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
          {/* Düğmeler neden pasif? (arayüz testi son tur S-BUY: ilk açılışta
              gri düğme açıklamasızdı). Ters aralıkta satır içi hata zaten var. */}
          {!canSubmit && !rangeInverted ? (
            <span id="savings-range-hint" className="text-xs text-zinc-500">
              {t("raporIcinTarihAraligiSecin")}
            </span>
          ) : null}
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
                  [t("kazananToplam"), tl(data.summary.grandActual, locale, data.baseCurrency ?? "TRY")],
                  [t("toplamTasarruf"), tl(data.summary.grandDelta, locale, data.baseCurrency ?? "TRY"), data.summary.grandDelta >= 0],
                  [
                    t("tasarrufYuzde"),
                    t("yuzde", { n: pct1(data.summary.grandDeltaPct) }),
                    data.summary.grandDeltaPct >= 0,
                  ],
                  [
                    t("ortTasarrufYuzde"),
                    t("yuzde", { n: pct1(data.summary.avgDeltaPct) }),
                  ],
                ] as Array<[string, string, boolean?]>
              ).map(([k, v, accent], i, all) => (
                <div key={k} className={`bg-white p-3.5 ${summaryTileSpan(i, all.length)}`}>
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
                    pct: data.summary.best.deltaPct != null ? pct0(data.summary.best.deltaPct) : "-",
                  })}
                </Badge>
              ) : null}
              {data.summary.worst &&
              data.summary.worst.title !== data.summary.best?.title ? (
                <Badge color="amber">
                  {t("enZayif", {
                    title: data.summary.worst.title,
                    pct: data.summary.worst.deltaPct != null ? pct0(data.summary.worst.deltaPct) : "-",
                  })}
                </Badge>
              ) : null}
            </div>

            {/* Satırlar — kalem detayına açılır. Tek yatay kaydırıcı tablonun
                kendisi (kart kaydırmaz, kenar payı --gutter'a eşit — g10-06);
                ilk sütun yapışkan ve telefonda dar/saran (g10-04). */}
            <div className="card overflow-hidden px-2 [--gutter:--spacing(2)]">
              {/* `@container`: açılan kalem detayı telefonda tablonun GÖRÜNEN
                  genişliğine (100cqw) oturur ve yapışkandır — tablo sağa
                  kaydırılmış olsa da ekranda kalır, kendi içinde kaymaz. */}
              <Table dense className="@container">
                <TableHead>
                  <TableRow>
                    <TableHeader className={`${REPORT_STICKY_CELL} ${REPORT_STICKY_HEADER}`}>
                      {t("satinAlmaTalebi")}
                    </TableHeader>
                    <TableHeader className="text-right">{t("teklif")}</TableHeader>
                    <TableHeader className="text-right">{t("enYuksek")}</TableHeader>
                    <TableHeader className="text-right">{t("kazanan")}</TableHeader>
                    <TableHeader className="text-right">{t("tasarruf")}</TableHeader>
                    <TableHeader className="text-right">%</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.rows.map((r) => (
                    <Fragment key={r.id}>
                      <TableRow>
                        <TableCell className={REPORT_STICKY_CELL}>
                          <div className="flex items-start gap-2">
                            {/* Açıcı İLK hücrede (g10-04: 971 px'lik tablonun
                                en sağında 16 px'lik simgeydi, ~600 px kaydırmadan
                                bulunmuyordu). Kutu 44 px; negatif boşlukla satır
                                yüksekliği değişmez. Sol pay hücre dolgusuna eşit
                                (telefonda 8, sm+ 4 px): kutu yapışkan hücrenin
                                kenarında başlar, kaydırıcı onu kırpmaz; sağ pay
                                kutuyu başlığın tam önünde bitirir. Açıcı durumunu
                                ve hangi talebin kalemlerini açtığını duyurur (D-295). */}
                            <button
                              type="button"
                              onClick={() =>
                                setOpenRow(openRow === r.id ? null : r.id)
                              }
                              aria-expanded={openRow === r.id}
                              aria-controls={`savings-items-${r.id}`}
                              aria-label={t("kalemDetayiTalep", { title: r.title })}
                              className="relative -my-2.5 -ml-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 sm:-ml-1"
                            >
                              <ChevronDown
                                className={`h-4 w-4 transition-transform ${
                                  openRow === r.id ? "rotate-180" : ""
                                }`}
                              />
                            </button>
                            <div className={REPORT_FIRST_COL_WITH_TOGGLE}>
                              <Link
                                href={`/company/ilan/${r.id}`}
                                className="font-medium text-zinc-900 hover:text-blue-600 hover:underline"
                              >
                                {r.title}
                              </Link>
                              <div className="tabular-nums text-xs text-zinc-400">
                                <span className={ID_TOKEN_CLASS}>{r.number ?? "—"} ·</span>{" "}
                                {r.winners.map((w) => w.name).join(", ") || "—"}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.bidCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-600">
                          {tl(isAlim ? r.highestBid : r.lowestBid, locale, data.baseCurrency ?? "TRY")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-900">
                          {tl(r.winningTotal, locale, data.baseCurrency ?? "TRY")}
                        </TableCell>
                        <TableCell className={`text-right font-semibold tabular-nums ${deltaTone(r.delta)}`}>
                          {tl(r.delta, locale, data.baseCurrency ?? "TRY")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-600">
                          {r.deltaPct != null
                            ? t("yuzde", { n: pct0(r.deltaPct) })
                            : "—"}
                        </TableCell>
                      </TableRow>
                      {openRow === r.id ? (
                        <TableRow key={`${r.id}-detail`} id={`savings-items-${r.id}`}>
                          <TableCell colSpan={6} className="bg-zinc-50/60">
                            <div className="sticky left-2 w-[calc(100cqw-1rem)] space-y-2 py-2 whitespace-normal sm:static sm:w-auto sm:whitespace-nowrap">
                              <Subheading className="text-sm">
                                {t("kalemDetayi2")}
                              </Subheading>
                              {/* Telefon: iç içe tablo yerine alt alta kalem
                                  kartları (g10-04: ikinci tablo, zaten kaydırılmış
                                  tablonun içinde kesik görünüyordu). */}
                              <ul data-testid="savings-items-list" className="space-y-2 sm:hidden">
                                {r.items.map((it, i) => (
                                  <li key={i} className="rounded-lg bg-white p-3 ring-1 ring-zinc-950/5">
                                    <p className="text-sm font-medium text-zinc-900 wrap-break-word">
                                      {it.name}{" "}
                                      <span className="text-xs font-normal text-zinc-500">
                                        ({unitLabel(it.unit)})
                                      </span>
                                    </p>
                                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                                      <div>
                                        <dt className="text-zinc-500">{t("adet")}</dt>
                                        <dd className="mt-0.5 tabular-nums text-zinc-900">
                                          {formatNumber(it.awardedQuantity ?? it.quantity, locale)}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt className="text-zinc-500">{t("tasarruf")}</dt>
                                        <dd className={`mt-0.5 font-semibold tabular-nums ${deltaTone(it.delta)}`}>
                                          {it.delta != null
                                            ? money2(it.delta, locale, data.baseCurrency ?? "TRY")
                                            : "—"}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt className="text-zinc-500">{t("hedefBirim")}</dt>
                                        <dd className="mt-0.5 tabular-nums text-zinc-600">
                                          {it.referenceUnitPrice != null
                                            ? money2(it.referenceUnitPrice, locale, data.baseCurrency ?? "TRY")
                                            : "—"}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt className="text-zinc-500">{t("kazananBirim")}</dt>
                                        <dd className="mt-0.5 tabular-nums text-zinc-900">
                                          {it.winningUnitPrice != null
                                            ? money2(it.winningUnitPrice, locale, data.baseCurrency ?? "TRY")
                                            : "—"}
                                        </dd>
                                      </div>
                                      <div className="col-span-2">
                                        <dt className="text-zinc-500">{t("kazananTedarikci")}</dt>
                                        <dd className="mt-0.5 text-zinc-700 wrap-break-word">
                                          {it.winnerName ?? "—"}
                                        </dd>
                                      </div>
                                    </dl>
                                  </li>
                                ))}
                              </ul>
                              <div data-testid="savings-items-table" className="hidden sm:block">
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
                                            ({unitLabel(it.unit)})
                                          </span>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                          {formatNumber(it.awardedQuantity ?? it.quantity, locale)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums text-zinc-600">
                                          {it.referenceUnitPrice != null
                                            ? money2(it.referenceUnitPrice, locale, data.baseCurrency ?? "TRY")
                                            : "—"}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums text-zinc-900">
                                          {it.winningUnitPrice != null
                                            ? money2(it.winningUnitPrice, locale, data.baseCurrency ?? "TRY")
                                            : "—"}
                                        </TableCell>
                                        <TableCell className="text-zinc-700">
                                          {it.winnerName ?? "—"}
                                        </TableCell>
                                        <TableCell className={`text-right font-semibold tabular-nums ${deltaTone(it.delta)}`}>
                                          {it.delta != null
                                            ? money2(it.delta, locale, data.baseCurrency ?? "TRY")
                                            : "—"}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
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
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      {/* Uzun firma adı sarar, tutar bölünmez ("320" / "₺" değil). */}
                      <span className="min-w-0 font-medium text-zinc-900 wrap-break-word">
                        {b.name}
                      </span>
                      <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums">
                        {tl(b.awarded, locale, data.baseCurrency ?? "TRY")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Text className="text-xs text-zinc-400">
              {t("tutarlarTeklifAnindakiTcmbKuruylaCur", { currency: data.baseCurrency ?? "TRY" })}
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
