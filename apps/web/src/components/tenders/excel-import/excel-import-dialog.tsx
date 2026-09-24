"use client";

import { useLocale, useTranslations } from "next-intl";
import { INTL_LOCALE } from "@/i18n/format";
import type { Locale } from "@rothern/i18n";
import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Dropzone } from "@/components/ui/dropzone";
import {
  useDownloadItemTemplate,
  useParseItemImport,
} from "@/hooks/use-listing-item-import";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import {
  ITEM_IMPORT_COLUMNS,
  type ItemImportColumnKey,
  type ItemImportItem,
  type ItemImportResult,
} from "@rothern/shared";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  IMPORT_MAX_FILE_BYTES,
  ITEM_IMPORT_MAX_CSV_BYTES,
} from "@rothern/shared";

export type ExcelImportMode = "append" | "replace";

/**
 * "Excel ile İçe Aktar" (2026-08-22) — AI YOK. Şablonu indir → doldur → yükle →
 * önizleme (hatalı satırlar kırmızı, aktarılmaz) → "Kalemlere aktar" (ekle /
 * değiştir). Yalnız FORM dolar; ihale yine Yayınla ile açılır.
 */
export function ExcelImportDialog({
  open,
  onClose,
  existingCount,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  /** Formdaki mevcut kalem sayısı — "değiştir" seçeneği metni için. */
  existingCount: number;
  onApply: (items: ItemImportItem[], mode: ExcelImportMode) => void;
}) {
  const t = useTranslations("web.panel.requests.excelImportDialog");
  const locale = useLocale() as Locale;
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ItemImportResult | null>(null);
  const [mode, setMode] = useState<ExcelImportMode>("append");
  const download = useDownloadItemTemplate();
  const parse = useParseItemImport();
  const busy = parse.isPending || download.isPending;

  const reset = () => {
    setFile(null);
    setResult(null);
    setMode("append");
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const run = async (f: File) => {
    setFile(f);
    try {
      const r = await parse.mutateAsync({ file: f });
      setResult(r);
      if (r.rows.length === 0) toast.info(t("dosyadaKalemSatiriBulunamadi"));
    } catch (err) {
      setFile(null);
      toast.error(extractErrorMessage(err, t("dosyaOkunamadi")));
    }
  };

  const validItems = useMemo(
    () => (result ? result.rows.filter((r) => r.errors.length === 0).map((r) => r.item) : []),
    [result],
  );

  const apply = () => {
    if (validItems.length === 0) return;
    onApply(validItems, mode);
    reset();
    onClose();
  };

  const visibleColumns: ItemImportColumnKey[] = result
    ? ITEM_IMPORT_COLUMNS.map((c) => c.key).filter((k) => result.columns.includes(k))
    : [];
  // Önizleme başlığı katalogdan (`sutun.<anahtar>`); şablon dosyasının kendi başlıkları API'den gelir.
  const headerOf = (k: ItemImportColumnKey) => (t.has(`sutun.${k}` as never) ? t(`sutun.${k}` as never) : k);

  return (
    <Dialog open={open} onClose={close} size={result ? "5xl" : "lg"}>
      <DialogTitle>
        <span className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          {t("excelIleIceAktar")}
        </span>
      </DialogTitle>
      <DialogDescription>
        {t("sablonuIndiripDoldurunSonraYukleyin")}
      </DialogDescription>

      <DialogBody className="space-y-4">
        {!result ? (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-950/10 bg-zinc-50 px-3 py-2.5">
              <Download className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              <div className="min-w-0 flex-1 text-sm text-zinc-700">
                {t.rich("adim1BosSablonuIndirin", { strong: (c) => <strong>{c}</strong> })}
              </div>
              <Button
                outline
                disabled={busy}
                onClick={() =>
                  download
                    .mutateAsync()
                    .catch((e) => toast.error(extractErrorMessage(e, t("sablonIndirilemedi"))))
                }
              >
                {download.isPending ? t("indiriliyor") : t("sablonuIndir")}
              </Button>
            </div>
            <div className="rounded-lg border border-zinc-950/10 px-3 py-2.5 text-sm text-zinc-700">
              {t.rich("adim2DoldurdugunuzDosyayiYukleyin", {
                strong: (c) => <strong>{c}</strong>,
                xlsxMb: Math.round(IMPORT_MAX_FILE_BYTES / 1024 / 1024),
                csvMb: Math.round(ITEM_IMPORT_MAX_CSV_BYTES / 1024 / 1024),
              })}
            </div>
            <Dropzone
              accept=".xlsx,.csv"
              disabled={busy}
              onFiles={(fs) => {
                const f = fs[0];
                if (!f) return;
                // Dalga B-5: istemcide boyut kapısı YOKTU — büyük dosya base64'e
                // çevrilip yollanıyor, kullanıcı bekledikten sonra açıklamasız
                // 413 alıyordu. Sunucuya gitmeden, doğru sınırla reddet.
                const isCsv = /\.csv$/i.test(f.name);
                const cap = isCsv
                  ? ITEM_IMPORT_MAX_CSV_BYTES
                  : IMPORT_MAX_FILE_BYTES;
                if (f.size > cap) {
                  toast.error(
                    t("dosyaCokBuyukIcinSinir", {
                      mb: (f.size / 1024 / 1024).toFixed(1),
                      kind: isCsv ? "CSV" : "Excel",
                      cap: Math.round(cap / 1024 / 1024),
                    }),
                  );
                  return;
                }
                void run(f);
              }}
              label={t("excelCsvSec")}
              hint={t("kendiListenizDeOlabilirBasliklar")}
            />
            {parse.isPending && file ? (
              <p className="text-sm text-zinc-500">
                {t.rich("dosyaOkunuyor", { name: file.name, strong: (c) => <span className="font-medium text-zinc-700">{c}</span> })}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-800">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {t("satirHazir", { validCount: result.validCount })}
              </span>
              {result.invalidCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1 font-medium text-red-700">
                  <AlertCircle className="h-4 w-4" aria-hidden />
                  {t("hataliSatirAktarilmaz", { invalidCount: result.invalidCount })}
                </span>
              ) : null}
              {result.truncated > 0 ? (
                <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-800">
                  {t("satirTavanNedeniyleOkunmadiEn", { truncated: result.truncated })}
                </span>
              ) : null}
              <span className="ml-auto text-xs text-zinc-500">
                {t("sayfa", { name: file?.name ?? "", sheetName: result.sheetName })}
              </span>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800"
              >
                <X className="h-3.5 w-3.5" /> {t("baskaDosya")}
              </button>
            </div>

            <div className="max-h-[50vh] overflow-auto rounded-lg border border-zinc-950/10">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">{t("satir")}</th>
                    {visibleColumns.map((k) => (
                      <th scope="col" key={k} className="px-3 py-2 font-medium">
                        {headerOf(k)}
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-2 font-medium">{t("durum")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {result.rows.map((r) => {
                    const bad = r.errors.length > 0;
                    return (
                      <tr key={r.rowNumber} className={cn(bad && "bg-red-50/60")}>
                        <td className="px-3 py-1.5 text-xs text-zinc-500">{r.rowNumber}</td>
                        {visibleColumns.map((k) => (
                          <td key={k} className="max-w-[240px] truncate px-3 py-1.5 text-zinc-800">
                            {formatCell(k, r.item, INTL_LOCALE[locale] ?? "tr-TR")}
                          </td>
                        ))}
                        <td className="px-3 py-1.5">
                          {bad ? (
                            <span className="text-xs text-red-700">{r.errors.join(" · ")}</span>
                          ) : (
                            <span className="text-xs text-emerald-700">{t("hazir")}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {validItems.length > 0 ? (
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="excel-import-mode"
                    checked={mode === "append"}
                    onChange={() => setMode("append")}
                  />
                  {t("mevcutKalemlereEkle")}
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="excel-import-mode"
                    checked={mode === "replace"}
                    onChange={() => setMode("replace")}
                  />
                  {t("mevcutKalemiDegistir", { existingCount: existingCount })}
                </label>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                {t("aktarilabilirSatirYokHatalariDuzeltip")}
              </p>
            )}
          </>
        )}
      </DialogBody>

      <DialogActions>
        <Button plain disabled={busy} onClick={close}>
          {t("vazgec")}
        </Button>
        {result ? (
          <Button disabled={busy || validItems.length === 0} onClick={apply}>
            {t("kalemiAktar", { n: validItems.length })}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}

function formatCell(k: ItemImportColumnKey, it: ItemImportItem, intlLocale: string): string {
  const v = it[k];
  if (v == null || v === "") return "—";
  if (k === "requiredByDate" && typeof v === "string") {
    const [y, m, d] = v.split("-");
    return y && m && d ? `${d}.${m}.${y}` : v;
  }
  if (typeof v === "number") return v.toLocaleString(intlLocale, { maximumFractionDigits: 3 });
  return String(v);
}
