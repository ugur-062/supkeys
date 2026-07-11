"use client";

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
import Link from "next/link";
import { Fragment, useState } from "react";
import { toast } from "sonner";

const CURRENCIES = [
  "TRY",
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "JPY",
  "AED",
  "CNY",
  "RUB",
];

function tl(n: number | null) {
  return n == null
    ? "—"
    : `${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺`;
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
  const isAlim = type === "ALIM";
  const deltaWord = isAlim ? "Tasarruf" : "Kazanç";
  const partyWord = isAlim ? "Tedarikçi" : "Alıcı";
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
      <Heading>
        {isAlim ? "Tasarruf Raporu" : "Rekabet Kazancı Raporu"}
      </Heading>
      <Text className="text-sm text-zinc-500">
        {isAlim
          ? "Kazandırılan ihalelerde rekabetin size kazandırdığı tutar (en yüksek teklif − kazanan) ve hedef fiyata göre kalem detayı."
          : "Kazandırılan ilanlarda rekabetin fiyatı yükselttiği tutar (kazanan − en düşük teklif) ve tabana göre kalem detayı."}
      </Text>

      {/* Kriter kartı */}
      <section className="space-y-4 rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
            <Label>Para Birimi (ilan)</Label>
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

      {report.isPending ? (
        <ReportPendingSkeleton />
      ) : data ? (
        data.rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center text-sm text-zinc-500">
            Bu aralıkta kazandırılmış {isAlim ? "ihale" : "ilan"} yok.
          </div>
        ) : (
          <section className="space-y-4">
            {/* Özet şeridi */}
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-950/5 bg-zinc-950/[0.06] sm:grid-cols-3 lg:grid-cols-5">
              {(
                [
                  [
                    isAlim ? "İhale" : "İlan",
                    String(data.summary.totalListings),
                  ],
                  ["Kazanan Toplam", tl(data.summary.grandActual)],
                  [`Toplam ${deltaWord}`, tl(data.summary.grandDelta), true],
                  [
                    `${deltaWord} %`,
                    `%${data.summary.grandDeltaPct.toFixed(1)}`,
                    true,
                  ],
                  [
                    `Ort. ${deltaWord} %`,
                    `%${data.summary.avgDeltaPct.toFixed(1)}`,
                  ],
                ] as Array<[string, string, boolean?]>
              ).map(([k, v, accent]) => (
                <div key={k} className="bg-white p-3.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
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
                  En iyi: {data.summary.best.title} (%
                  {data.summary.best.deltaPct?.toFixed(0) ?? "-"})
                </Badge>
              ) : null}
              {data.summary.worst &&
              data.summary.worst.title !== data.summary.best?.title ? (
                <Badge color="amber">
                  En zayıf: {data.summary.worst.title} (%
                  {data.summary.worst.deltaPct?.toFixed(0) ?? "-"})
                </Badge>
              ) : null}
            </div>

            {/* Satırlar — kalem detayına açılır */}
            <div className="overflow-x-auto rounded-2xl border border-zinc-950/5 bg-white px-2 shadow-sm [--gutter:--spacing(4)]">
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader>{isAlim ? "İhale" : "İlan"}</TableHeader>
                    <TableHeader className="text-right">Teklif</TableHeader>
                    <TableHeader className="text-right">
                      {isAlim ? "En Yüksek" : "En Düşük"}
                    </TableHeader>
                    <TableHeader className="text-right">Kazanan</TableHeader>
                    <TableHeader className="text-right">{deltaWord}</TableHeader>
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
                          <div className="tabular-nums text-[11px] text-zinc-400">
                            {r.number ?? "—"} ·{" "}
                            {r.winners.map((w) => w.name).join(", ") || "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.bidCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-600">
                          {tl(isAlim ? r.highestBid : r.lowestBid)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-900">
                          {tl(r.winningTotal)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-emerald-700">
                          {tl(r.delta)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-zinc-600">
                          {r.deltaPct != null
                            ? `%${r.deltaPct.toFixed(0)}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenRow(openRow === r.id ? null : r.id)
                            }
                            aria-label="Kalem detayı"
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
                                Kalem Detayı
                              </Subheading>
                              <Table dense>
                                <TableHead>
                                  <TableRow>
                                    <TableHeader>Kalem</TableHeader>
                                    <TableHeader className="text-right">
                                      Adet
                                    </TableHeader>
                                    <TableHeader className="text-right">
                                      {isAlim ? "Hedef Birim" : "Taban Birim"}
                                    </TableHeader>
                                    <TableHeader className="text-right">
                                      Kazanan Birim
                                    </TableHeader>
                                    <TableHeader>
                                      Kazanan {partyWord}
                                    </TableHeader>
                                    <TableHeader className="text-right">
                                      {deltaWord}
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
                                          ? it.referenceUnitPrice.toLocaleString(
                                              "tr-TR",
                                            )
                                          : "—"}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums text-zinc-900">
                                        {it.winningUnitPrice != null
                                          ? it.winningUnitPrice.toLocaleString(
                                              "tr-TR",
                                            )
                                          : "—"}
                                      </TableCell>
                                      <TableCell className="text-zinc-700">
                                        {it.winnerName ?? "—"}
                                      </TableCell>
                                      <TableCell className="text-right font-semibold tabular-nums text-emerald-700">
                                        {it.delta != null
                                          ? it.delta.toLocaleString("tr-TR")
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
              <div className="rounded-2xl border border-zinc-950/5 bg-white p-5 shadow-sm">
                <Subheading className="mb-3">
                  {partyWord} Bazlı Kazanılan Tutar
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
                      <span className="font-mono font-semibold tabular-nums">
                        {tl(b.awarded)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Text className="text-xs text-zinc-400">
              Tutarlar teklif anındaki TCMB kuruyla TRY karşılığı olarak
              toplanır. Kalem detayı ilan birimindedir.
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
