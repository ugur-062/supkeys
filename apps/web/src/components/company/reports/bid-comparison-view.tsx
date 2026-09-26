"use client";

import { useLocale, useTranslations } from "next-intl";
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
import { cn } from "@/lib/utils";
import { ArrowLeft, FileSpreadsheet, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useState } from "react";
import { toast } from "sonner";

/** Tutar + sembol — sayı okuyucunun dilinde. */
function money(n: number | null, sym: string, locale: Locale) {
  return n == null ? "—" : `${formatNumber(n, locale)} ${sym}`;
}

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
  const locale = useLocale() as Locale;
  const isAlim = type === "ALIM";
  const [listingId, setListingId] = useState("");
  const [criteria, setCriteria] = useState<"PRICE" | "ANSWERS" | "BOTH">(
    "PRICE",
  );
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

  const run = async () => {
    try {
      await report.mutateAsync(payload());
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("raporOlusturulamadi")));
    }
  };
  const runDownload = async () => {
    try {
      const { filename } = await download.mutateAsync(payload());
      toast.success(tr("indiriliyor", { file: filename }));
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("indirmeBasarisiz")));
    }
  };

  const data = report.data;
  const sym = data
    ? data.listing.currency === "TRY"
      ? "₺"
      : data.listing.currency
    : "₺";

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
              onChange={(v) => setCriteria(v as typeof criteria)}
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
                {tr("hedefToplam", { total: money(data.listing.referenceTotal, sym, locale) })}
              </Badge>
            ) : null}
          </div>

          <div className="overflow-x-auto card px-2 [--gutter:--spacing(3)]">
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader className="sticky left-0 z-10 bg-white">{tr("kalem")}</TableHeader>
                  <TableHeader className="text-right">{tr("hedef")}</TableHeader>
                  {data.parties.map((p) => (
                    <TableHeader key={p.companyId} className="text-right">
                      <span className="block max-w-[140px] truncate">
                        {p.companyName}
                      </span>
                      {!p.submitted ? (
                        <span className="text-xs font-normal text-zinc-400">
                          {tr("teklifYok")}
                        </span>
                      ) : null}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="sticky left-0 z-10 bg-white text-zinc-900">
                      {it.name}{" "}
                      <span className="text-xs text-zinc-400">
                        ({formatNumber(it.quantity, locale)} {it.unit})
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-500">
                      {it.referenceUnitPrice != null
                        ? formatNumber(it.referenceUnitPrice, locale)
                        : "—"}
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
                              {ip?.unitPrice != null
                                ? formatNumber(ip.unitPrice, locale)
                                : "—"}
                              {ip?.deltaVsReferencePct != null ? (
                                <span className="ml-1 text-xs text-zinc-400">
                                  {tr("yuzdeFark", {
                                    sign: ip.deltaVsReferencePct > 0 ? "+" : "",
                                    n: ip.deltaVsReferencePct,
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
                          ? formatNumber(data.listing.referenceTotal, locale)
                          : "—"}
                      </TableCell>
                      {data.parties.map((p) => (
                        <TableCell
                          key={p.companyId}
                          className="bg-zinc-50 text-right font-semibold tabular-nums text-zinc-900"
                        >
                          {p.totalAmount != null
                            ? formatNumber(p.totalAmount, locale)
                            : "—"}
                          {p.bidCurrency ? (
                            <span className="ml-1 text-xs text-zinc-400">
                              {p.bidCurrency}
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
                          {p.deltaVsReference != null
                            ? formatNumber(p.deltaVsReference, locale)
                            : "—"}
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
                        {money(ra.unitPrice, sym, locale)}
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
                        {money(h.amount, sym, locale)}
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
