"use client";

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
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

function money(n: number | null, sym = "₺") {
  return n == null ? "—" : `${n.toLocaleString("tr-TR")} ${sym}`;
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
  const isAlim = type === "ALIM";
  const [listingId, setListingId] = useState("");
  const [criteria, setCriteria] = useState<"PRICE" | "ANSWERS" | "BOTH">(
    "PRICE",
  );
  const [includeNonBidders, setIncludeNonBidders] = useState(false);
  const [showBidCurrencies, setShowBidCurrencies] = useState(false);
  const [includeRoundHistory, setIncludeRoundHistory] = useState(false);

  const myTenders = useTenders(type);
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
      toast.error(extractErrorMessage(err, "Rapor oluşturulamadı"));
    }
  };
  const runDownload = async () => {
    try {
      const { filename } = await download.mutateAsync(payload());
      toast.success(`${filename} indiriliyor`);
    } catch (err) {
      toast.error(extractErrorMessage(err, "İndirme başarısız"));
    }
  };

  const data = report.data;
  const sym = data
    ? data.listing.currency === "TRY"
      ? "₺"
      : data.listing.currency
    : "₺";

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <nav className="text-sm text-zinc-500">
        <Link
          href={basePath}
          className="inline-flex items-center gap-1 hover:text-zinc-800 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Raporlar
        </Link>
      </nav>
      <Heading>Teklif Karşılaştırma Raporu</Heading>
      <Text className="text-sm text-zinc-500">
        Bir {isAlim ? "ihaleye" : "ilana"} gelen teklifleri kalem bazında yan
        yana karşılaştırın —{" "}
        {isAlim ? "en düşük birim fiyatlar" : "en yüksek birim fiyatlar"}{" "}
        vurgulanır.
      </Text>

      {/* Kriter kartı */}
      <section className="space-y-4 rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-sm">
        <Field>
          <Label>{isAlim ? "İhale" : "İlan"}</Label>
          <Select
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
          >
            <option value="">— Seçin —</option>
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
              Karşılaştırma Kriteri
            </p>
            <RadioGroup
              value={criteria}
              onChange={(v) => setCriteria(v as typeof criteria)}
              className="space-y-1.5"
            >
              <RadioField>
                <Radio value="PRICE" />
                <Label>Fiyatlar</Label>
              </RadioField>
              <RadioField>
                <Radio value="ANSWERS" />
                <Label>Soru yanıtları</Label>
              </RadioField>
              <RadioField>
                <Radio value="BOTH" />
                <Label>Fiyatlar + yanıtlar</Label>
              </RadioField>
            </RadioGroup>
          </div>
          <div className="space-y-1.5">
            <p className="mb-2 text-xs font-medium text-zinc-500">Seçenekler</p>
            <CheckboxField>
              <Checkbox
                checked={includeNonBidders}
                onChange={setIncludeNonBidders}
              />
              <Label>Teklif vermeyen davetlileri de göster</Label>
            </CheckboxField>
            <CheckboxField>
              <Checkbox
                checked={showBidCurrencies}
                onChange={setShowBidCurrencies}
              />
              <Label>Teklif para birimlerini göster</Label>
            </CheckboxField>
            <CheckboxField>
              <Checkbox
                checked={includeRoundHistory}
                onChange={setIncludeRoundHistory}
              />
              <Label>Tur geçmişini ekle (açık eksiltme/artırma)</Label>
            </CheckboxField>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
          <Button onClick={run} disabled={!listingId || report.isPending}>
            {report.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" data-slot="icon" />
            ) : null}
            Raporu Oluştur
          </Button>
          <Button
            outline
            onClick={runDownload}
            disabled={!listingId || download.isPending}
          >
            <FileSpreadsheet data-slot="icon" />
            Excel İndir
          </Button>
        </div>
      </section>

      {/* Sonuç: matris */}
      {report.isPending ? (
        <ReportPendingSkeleton />
      ) : data ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-zinc-400">
              {data.listing.number ?? "—"}
            </span>
            <Badge color={isAlim ? "blue" : "emerald"}>
              {data.listing.title}
            </Badge>
            <Badge color="zinc">Tur {data.listing.round}</Badge>
            {data.includePrice && data.listing.referenceTotal > 0 ? (
              <Badge color="zinc">
                {isAlim ? "Hedef" : "Taban"} Toplam:{" "}
                {money(data.listing.referenceTotal, sym)}
              </Badge>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-zinc-950/5 bg-white px-2 shadow-sm [--gutter:--spacing(3)]">
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader className="sticky left-0 z-10 bg-white">Kalem</TableHeader>
                  <TableHeader className="text-right">
                    {isAlim ? "Hedef" : "Taban"}
                  </TableHeader>
                  {data.parties.map((p) => (
                    <TableHeader key={p.companyId} className="text-right">
                      <span className="block max-w-[140px] truncate">
                        {p.companyName}
                      </span>
                      {!p.submitted ? (
                        <span className="text-[10px] font-normal text-zinc-400">
                          teklif yok
                        </span>
                      ) : p.isBuyNow ? (
                        <span className="text-[10px] font-normal text-emerald-600">
                          Hemen-Al
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
                        ({it.quantity.toLocaleString("tr-TR")} {it.unit})
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-500">
                      {it.referenceUnitPrice != null
                        ? it.referenceUnitPrice.toLocaleString("tr-TR")
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
                                ? ip.unitPrice.toLocaleString("tr-TR")
                                : "—"}
                              {ip?.deltaVsReferencePct != null ? (
                                <span className="ml-1 text-[10px] text-zinc-400">
                                  ({ip.deltaVsReferencePct > 0 ? "+" : ""}
                                  {ip.deltaVsReferencePct}%)
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                          {data.includeAnswers && ia?.answer ? (
                            <span className="block max-w-[200px] truncate text-left text-[11px] font-normal text-zinc-500">
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
                        GENEL TOPLAM
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-zinc-500">
                        {data.listing.referenceTotal > 0
                          ? data.listing.referenceTotal.toLocaleString("tr-TR")
                          : "—"}
                      </TableCell>
                      {data.parties.map((p) => (
                        <TableCell
                          key={p.companyId}
                          className="bg-zinc-50 text-right font-semibold tabular-nums text-zinc-900"
                        >
                          {p.totalAmount != null
                            ? p.totalAmount.toLocaleString("tr-TR")
                            : "—"}
                          {p.bidCurrency ? (
                            <span className="ml-1 text-[10px] text-zinc-400">
                              {p.bidCurrency}
                            </span>
                          ) : null}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="sticky left-0 z-10 bg-white font-semibold text-zinc-900">
                        SIRA {isAlim ? "(en ucuz=1)" : "(en yüksek=1)"}
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
                        {isAlim ? "Hedefe Göre Tasarruf" : "Taban Üstü Kazanç"}
                      </TableCell>
                      <TableCell />
                      {data.parties.map((p) => (
                        <TableCell
                          key={p.companyId}
                          className="text-right tabular-nums text-emerald-700"
                        >
                          {p.deltaVsReference != null
                            ? p.deltaVsReference.toLocaleString("tr-TR")
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
            <div className="rounded-2xl border border-zinc-950/5 bg-white p-5 shadow-sm">
              <Subheading className="mb-3">
                Önerilen Kazanan{" "}
                <span className="text-xs font-normal text-zinc-400">
                  (kalem bazında {isAlim ? "en düşük" : "en yüksek"} birim
                  fiyat)
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
                      <span className="font-mono font-semibold tabular-nums">
                        {money(ra.unitPrice, sym)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Tur geçmişi */}
          {data.roundHistory.length > 0 ? (
            <div className="rounded-2xl border border-zinc-950/5 bg-white p-5 shadow-sm">
              <Subheading className="mb-3">Tur Geçmişi</Subheading>
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader>Tur</TableHeader>
                    <TableHeader>{isAlim ? "Tedarikçi" : "Alıcı"}</TableHeader>
                    <TableHeader className="text-right">Tutar</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.roundHistory.map((h, i) => (
                    <TableRow key={i}>
                      <TableCell>Tur {h.round}</TableCell>
                      <TableCell className="sticky left-0 z-10 bg-white text-zinc-900">
                        {h.bidderName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(h.amount, sym)}
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
