"use client";

import { useLocale, useTranslations } from "next-intl";
import { useQuantityLabel } from "@/i18n/domain";
import type { Locale } from "@rothern/i18n";
import { formatNumber } from "@/i18n/format";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import {
  Checkbox,
  CheckboxField,
} from "@/components/catalyst/checkbox";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Heading, Subheading } from "@/components/catalyst/heading";
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
  useBidComparisonReport,
  useDownloadBidComparisonReport,
  type BidComparisonPayload,
  type ReportType,
} from "@/hooks/use-company-reports";
import { useTenders } from "@/hooks/use-company-tenders";
import { extractErrorMessage } from "@/lib/tenders/error";
import { affixCurrency } from "@/lib/tenders/labels";
import { cn } from "@/lib/utils";
import { ArrowLeft, FileSpreadsheet, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { MONEY_FRACTION } from "@/lib/line-amount";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { readReportQuery, writeReportQuery } from "./report-url-state";

/**
 * Tutar + sembol — sayı okuyucunun dilinde, HER ZAMAN 2 ondalık ("2,50 ₺";
 * eskiden "2,5 ₺" — arayüz testi O-027); sembolün YERİ de dilden
 * (`affixCurrency`: İngilizcede önde "$1,200.00", TR/RU'da sonda "1.200,00 $").
 */
function money(n: number | null, currency: string, locale: Locale) {
  return n == null
    ? "—"
    : affixCurrency(formatNumber(n, locale, MONEY_FRACTION), currency, locale);
}

const CRITERIA = ["PRICE", "ANSWERS", "BOTH"] as const;
type Criteria = (typeof CRITERIA)[number];

/**
 * Teklifin sonucu sütun başlığında (O-027): kazandırmada kaybeden teklif de
 * LOST'tur ama elenmemiştir — "Kaybetti" ile "Elendi" ayrı okunur.
 */
type PartyOutcome = "won" | "partial" | "lost" | "eliminated";
function partyOutcome(p: { status: string; eliminated?: boolean }): PartyOutcome | null {
  if (p.status === "WON") return "won";
  if (p.status === "AWARDED_PARTIAL") return "partial";
  if (p.status === "LOST") return p.eliminated ? "eliminated" : "lost";
  return null;
}
const OUTCOME_KEY = {
  won: "sonucKazandi",
  partial: "sonucKismenKazandi",
  lost: "sonucKaybetti",
  eliminated: "sonucElendi",
} as const;
const OUTCOME_COLOR = {
  won: "green",
  partial: "green",
  lost: "zinc",
  eliminated: "red",
} as const;

/**
 * Teklif Karşılaştırma Raporu — bir ihaleye gelen teklifleri kalem bazında
 * matris olarak karşılaştırır (eski sistem deseni; kapalı zarf: yalnız sahip).
 */
export function BidComparisonView({
  type,
  basePath,
}: {
  type: ReportType;
  basePath: string;
}) {
  const tr = useTranslations("web.panel.reports.bidComparisonView");
  const quantity = useQuantityLabel();
  const locale = useLocale() as Locale;
  const isAlim = type === "ALIM";
  const [listingId, setListingId] = useState("");
  const [criteria, setCriteria] = useState<Criteria>("PRICE");
  const [includeNonBidders, setIncludeNonBidders] = useState(false);
  const [showBidCurrencies, setShowBidCurrencies] = useState(false);
  const [includeRoundHistory, setIncludeRoundHistory] = useState(false);

  const myTenders = useTenders();
  const report = useBidComparisonReport();
  const download = useDownloadBidComparisonReport();

  const payload = (): BidComparisonPayload => ({
    type,
    listingId,
    criteria,
    includeNonBidders,
    showBidCurrencies,
    includeRoundHistory,
  });

  const generate = async (p: BidComparisonPayload) => {
    try {
      await report.mutateAsync(p);
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("raporOlusturulamadi")));
    }
  };
  const run = async () => {
    // Kriterler adrese: talebe gidip Geri'ye basınca rapor geri gelir (D-293).
    writeReportQuery({
      listing: listingId,
      criteria,
      nonBidders: includeNonBidders,
      currencies: showBidCurrencies,
      rounds: includeRoundHistory,
    });
    await generate(payload());
  };

  // Açılışta adresteki kriterleri geri yükle ve raporu yeniden üret (D-293).
  useEffect(() => {
    const q = readReportQuery();
    const listing = q.get("listing");
    if (!listing) return;
    const c = q.get("criteria");
    const restoredCriteria: Criteria = (CRITERIA as readonly string[]).includes(c ?? "")
      ? (c as Criteria)
      : "PRICE";
    const p: BidComparisonPayload = {
      type,
      listingId: listing,
      criteria: restoredCriteria,
      includeNonBidders: q.get("nonBidders") === "1",
      showBidCurrencies: q.get("currencies") === "1",
      includeRoundHistory: q.get("rounds") === "1",
    };
    setListingId(listing);
    setCriteria(restoredCriteria);
    setIncludeNonBidders(!!p.includeNonBidders);
    setShowBidCurrencies(!!p.showBidCurrencies);
    setIncludeRoundHistory(!!p.includeRoundHistory);
    void generate(p);
    // Yalnız açılışta bir kez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const runDownload = async () => {
    try {
      const { filename } = await download.mutateAsync(payload());
      toast.success(tr("indiriliyor", { file: filename }));
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("indirmeBasarisiz")));
    }
  };

  const data = report.data;
  // Referans/önerilen birim fiyatlar firmanın RAPOR BİRİMİNDE (sunucu çevirir,
  // `baseCurrency`); tur geçmişi satırı kendi birimini taşır.
  const baseCurrency = data?.baseCurrency ?? "TRY";

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
      <Heading>{tr("teklifKarsilastirmaRaporu")}</Heading>
      <Text className="text-sm text-zinc-500">
        {tr("birSatinAlmaTalebineGelenTeklifleri")}
      </Text>

      {/* Kriter kartı */}
      <section className="space-y-4 card p-5 shadow-sm">
        <Field>
          <Label>{tr("satinAlmaTalebi")}</Label>
          <Select
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
          >
            <option value="">{tr("secin")}</option>
            {(myTenders.data ?? [])
              .filter((t) => t.status !== "DRAFT")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tenderNumber} — {t.title}
                </option>
              ))}
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-500">
              {tr("karsilastirmaKriteri")}
            </p>
            <RadioGroup
              value={criteria}
              onChange={(v) => setCriteria(v as Criteria)}
              className="space-y-1.5"
            >
              <RadioField>
                <Radio value="PRICE" />
                <Label>{tr("fiyatlar")}</Label>
              </RadioField>
              <RadioField>
                <Radio value="ANSWERS" />
                <Label>{tr("soruYanitlari")}</Label>
              </RadioField>
              <RadioField>
                <Radio value="BOTH" />
                <Label>{tr("fiyatlarYanitlar")}</Label>
              </RadioField>
            </RadioGroup>
          </div>
          <div className="space-y-1.5">
            <p className="mb-2 text-xs font-medium text-zinc-500">{tr("secenekler")}</p>
            <CheckboxField>
              <Checkbox
                checked={includeNonBidders}
                onChange={setIncludeNonBidders}
              />
              <Label>{tr("teklifVermeyenDavetlileriDeGoster")}</Label>
            </CheckboxField>
            <CheckboxField>
              <Checkbox
                checked={showBidCurrencies}
                onChange={setShowBidCurrencies}
              />
              <Label>{tr("teklifParaBirimleriniGoster")}</Label>
            </CheckboxField>
            <CheckboxField>
              <Checkbox
                checked={includeRoundHistory}
                onChange={setIncludeRoundHistory}
              />
              <Label>{tr("turGecmisiniEkleAcikEksiltme")}</Label>
            </CheckboxField>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
          <Button onClick={run} disabled={!listingId || report.isPending}>
            {report.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" data-slot="icon" />
            ) : null}
            {tr("raporuOlustur")}
          </Button>
          <Button
            outline
            onClick={runDownload}
            disabled={!listingId || download.isPending}
          >
            <FileSpreadsheet data-slot="icon" />
            {tr("excelIndir")}
          </Button>
        </div>
      </section>

      {/* Sonuç: matris */}
      {report.isPending ? (
        <ReportPendingSkeleton />
      ) : data ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums text-xs text-zinc-400">
              {data.listing.number ?? "—"}
            </span>
            <Badge color={isAlim ? "blue" : "emerald"}>
              {data.listing.title}
            </Badge>
            <Badge color="zinc">{tr("tur", { round: data.listing.round })}</Badge>
            {data.includePrice && data.listing.referenceTotal > 0 ? (
              <Badge color="zinc">
                {tr("hedefToplam", { total: money(data.listing.referenceTotal, baseCurrency, locale) })}
              </Badge>
            ) : null}
          </div>

          <div className="overflow-x-auto card px-2 [--gutter:--spacing(3)]">
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader className="sticky left-0 z-10 bg-white">{tr("kalem")}</TableHeader>
                  <TableHeader className="text-right">{tr("hedef")}</TableHeader>
                  {data.parties.map((p) => {
                    const outcome = partyOutcome(p);
                    return (
                      <TableHeader key={p.companyId} className="text-right">
                        <span className="block max-w-[140px] truncate">
                          {p.companyName}
                        </span>
                        {!p.submitted ? (
                          <span className="text-xs font-normal text-zinc-500">
                            {tr("teklifYok")}
                          </span>
                        ) : outcome ? (
                          <Badge color={OUTCOME_COLOR[outcome]} className="mt-0.5">
                            {tr(OUTCOME_KEY[outcome])}
                          </Badge>
                        ) : null}
                      </TableHeader>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="sticky left-0 z-10 bg-white text-zinc-900">
                      {it.name}{" "}
                      <span className="text-xs text-zinc-400">
                        ({quantity(it.quantity, it.unit)})
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-500">
                      {money(it.referenceUnitPrice, baseCurrency, locale)}
                    </TableCell>
                    {data.parties.map((p) => {
                      const ip = p.itemPrices.find((x) => x.itemId === it.id);
                      const ia = p.itemAnswers.find((x) => x.itemId === it.id);
                      return (
                        <TableCell
                          key={p.companyId}
                          className={cn(
                            "text-right tabular-nums",
                            ip?.isBest
                              ? "bg-emerald-50 font-semibold text-emerald-800"
                              : "text-zinc-700",
                          )}
                        >
                          {data.includePrice ? (
                            <span className="block">
                              {/* Ham fiyat KALEMİN biriminde — birim HER ZAMAN
                                  yazılır (çok-birimli teklifte etiketsiz ham
                                  sayılar kıyaslanamaz; derin denetim Y-14). */}
                              {money(
                                ip?.unitPrice ?? null,
                                ip?.currency ?? data.baseCurrency ?? "TRY",
                                locale,
                              )}
                              {ip?.deltaVsReferencePct != null ? (
                                <span className="ml-1 text-xs text-zinc-400">
                                  {tr("yuzdeFark", {
                                    sign: ip.deltaVsReferencePct > 0 ? "+" : "",
                                    // Okuyucunun ondalık ayırıcısıyla (ICU düz argümanı biçimlemez).
                                    n: formatNumber(ip.deltaVsReferencePct, locale, { maximumFractionDigits: 1 }),
                                  })}
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                          {data.includeAnswers && ia?.answer ? (
                            <span className="block max-w-[200px] truncate text-left text-xs font-normal text-zinc-500">
                              {ia.answer}
                            </span>
                          ) : null}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                {data.includePrice ? (
                  <>
                    <TableRow>
                      <TableCell className="sticky left-0 z-10 bg-white font-semibold text-zinc-900">
                        {tr("genelToplam")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-zinc-500">
                        {data.listing.referenceTotal > 0
                          ? money(data.listing.referenceTotal, baseCurrency, locale)
                          : "—"}
                      </TableCell>
                      {data.parties.map((p) => (
                        <TableCell
                          key={p.companyId}
                          className="bg-zinc-50 text-right font-semibold tabular-nums text-zinc-900"
                        >
                          {/* Kıyaslanabilir toplam RAPOR biriminde (hedef ve
                              sıra ile aynı baz); ham tutar yalnız "teklif
                              para birimlerini göster" açıkken, birimiyle. */}
                          {p.totalTry != null
                            ? money(p.totalTry, baseCurrency, locale)
                            : // Kur damgası yoksa (çevrilemedi) ham tutar
                              // KENDİ birimiyle — asla birimsiz değil.
                              money(
                                p.totalAmount,
                                p.totalCurrency ?? p.bidCurrency ?? data.baseCurrency ?? "TRY",
                                locale,
                              )}
                          {p.totalTry != null && p.bidCurrency && p.totalAmount != null ? (
                            <span className="block text-xs font-normal text-zinc-400">
                              {money(
                                p.totalAmount,
                                p.totalCurrency ?? p.bidCurrency,
                                locale,
                              )}
                            </span>
                          ) : null}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="sticky left-0 z-10 bg-white font-semibold text-zinc-900">
                        {tr("siraEnUcuz1")}
                      </TableCell>
                      <TableCell />
                      {data.parties.map((p) => (
                        <TableCell
                          key={p.companyId}
                          className="text-right font-semibold tabular-nums"
                        >
                          {p.rank ?? "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-zinc-700">
                        {tr("hedefeGoreTasarruf")}
                      </TableCell>
                      <TableCell />
                      {data.parties.map((p) => (
                        <TableCell
                          key={p.companyId}
                          className="text-right tabular-nums text-emerald-700"
                        >
                          {money(p.deltaVsReference, baseCurrency, locale)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </>
                ) : null}
              </TableBody>
            </Table>
          </div>

          {/* Önerilen kazanan */}
          {data.includePrice && data.recommendedAwards.length > 0 ? (
            <div className="card p-5">
              <Subheading className="mb-3">
                {tr("onerilenKazanan")}{" "}
                <span className="text-xs font-normal text-zinc-400">
                  {tr("kalemBazindaEnDusukBirimFiyat")}
                </span>
              </Subheading>
              <ul className="divide-y divide-zinc-50">
                {data.recommendedAwards.map((ra) => (
                  <li
                    key={ra.itemId}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span className="text-zinc-900">{ra.itemName}</span>
                    <span className="flex items-center gap-3">
                      <span className="font-medium text-zinc-700">
                        {ra.companyName}
                      </span>
                      <span className=" font-semibold tabular-nums">
                        {money(ra.unitPrice, baseCurrency, locale)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Tur geçmişi */}
          {data.roundHistory.length > 0 ? (
            <div className="card p-5">
              <Subheading className="mb-3">{tr("turGecmisi")}</Subheading>
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader>{tr("tur2")}</TableHeader>
                    <TableHeader>{tr("tedarikci")}</TableHeader>
                    <TableHeader className="text-right">{tr("tutar")}</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.roundHistory.map((h, i) => (
                    <TableRow key={i}>
                      <TableCell>{tr("tur", { round: h.round })}</TableCell>
                      <TableCell className="sticky left-0 z-10 bg-white text-zinc-900">
                        {h.bidderName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(h.amount, h.currency || baseCurrency, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
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
