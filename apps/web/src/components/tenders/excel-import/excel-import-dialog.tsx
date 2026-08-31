"use client";

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
  type ItemImportScope,
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
  scope,
  existingCount,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  scope: ItemImportScope;
  /** Formdaki mevcut kalem sayısı — "değiştir" seçeneği metni için. */
  existingCount: number;
  onApply: (items: ItemImportItem[], mode: ExcelImportMode) => void;
}) {
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
      const r = await parse.mutateAsync({ file: f, scope });
      setResult(r);
      if (r.rows.length === 0) toast.info("Dosyada kalem satırı bulunamadı");
    } catch (err) {
      setFile(null);
      toast.error(extractErrorMessage(err, "Dosya okunamadı"));
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
  const headerOf = (k: ItemImportColumnKey) =>
    ITEM_IMPORT_COLUMNS.find((c) => c.key === k)?.header.replace(/\s*\(.*\)$/, "") ?? k;

  return (
    <Dialog open={open} onClose={close} size={result ? "5xl" : "lg"}>
      <DialogTitle>
        <span className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Excel ile İçe Aktar
        </span>
      </DialogTitle>
      <DialogDescription>
        Şablonu indirip doldurun, sonra yükleyin — kalemler birebir aktarılır
        (AI kullanılmaz). Aktarmadan önce önizleme görürsünüz.
      </DialogDescription>

      <DialogBody className="space-y-4">
        {!result ? (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-950/10 bg-zinc-50 px-3 py-2.5">
              <Download className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              <div className="min-w-0 flex-1 text-sm text-zinc-700">
                <strong>1.</strong> Boş şablonu indirin (Kalemler sayfası + nasıl doldurulur + örnek)
              </div>
              <Button
                outline
                disabled={busy}
                onClick={() =>
                  download
                    .mutateAsync(scope)
                    .catch((e) => toast.error(extractErrorMessage(e, "Şablon indirilemedi")))
                }
              >
                {download.isPending ? "İndiriliyor…" : "Şablonu indir"}
              </Button>
            </div>
            <div className="rounded-lg border border-zinc-950/10 px-3 py-2.5 text-sm text-zinc-700">
              <strong>2.</strong> Doldurduğunuz dosyayı yükleyin — Excel .xlsx
              (en fazla {Math.round(IMPORT_MAX_FILE_BYTES / 1024 / 1024)} MB)
              veya CSV (en fazla{" "}
              {Math.round(ITEM_IMPORT_MAX_CSV_BYTES / 1024 / 1024)} MB)
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
                    `Dosya çok büyük (${(f.size / 1024 / 1024).toFixed(1)} MB) — ${
                      isCsv ? "CSV" : "Excel"
                    } için sınır ${Math.round(cap / 1024 / 1024)} MB`,
                  );
                  return;
                }
                void run(f);
              }}
              label="Excel / CSV seç"
              hint="Kendi listeniz de olabilir — başlıklar şablondakiyle aynı olmalı (Kalem Adı, Miktar, Birim…)"
            />
            {parse.isPending && file ? (
              <p className="text-sm text-zinc-500">
                <span className="font-medium text-zinc-700">{file.name}</span> okunuyor…
              </p>
            ) : null}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-800">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {result.validCount} satır hazır
              </span>
              {result.invalidCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1 font-medium text-red-700">
                  <AlertCircle className="h-4 w-4" aria-hidden />
                  {result.invalidCount} hatalı satır (aktarılmaz)
                </span>
              ) : null}
              {result.truncated > 0 ? (
                <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-800">
                  {result.truncated} satır tavan nedeniyle okunmadı (en fazla 500 kalem)
                </span>
              ) : null}
              <span className="ml-auto text-xs text-zinc-500">
                {file?.name} · sayfa: {result.sheetName}
              </span>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800"
              >
                <X className="h-3.5 w-3.5" /> Başka dosya
              </button>
            </div>

            <div className="max-h-[50vh] overflow-auto rounded-lg border border-zinc-950/10">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Satır</th>
                    {visibleColumns.map((k) => (
                      <th scope="col" key={k} className="px-3 py-2 font-medium">
                        {headerOf(k)}
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-2 font-medium">Durum</th>
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
                            {formatCell(k, r.item)}
                          </td>
                        ))}
                        <td className="px-3 py-1.5">
                          {bad ? (
                            <span className="text-xs text-red-700">{r.errors.join(" · ")}</span>
                          ) : (
                            <span className="text-xs text-emerald-700">Hazır</span>
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
                  Mevcut kalemlere ekle
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="excel-import-mode"
                    checked={mode === "replace"}
                    onChange={() => setMode("replace")}
                  />
                  Mevcut {existingCount} kalemi değiştir
                </label>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                Aktarılabilir satır yok — hataları düzeltip dosyayı yeniden yükleyin.
              </p>
            )}
          </>
        )}
      </DialogBody>

      <DialogActions>
        <Button plain disabled={busy} onClick={close}>
          Vazgeç
        </Button>
        {result ? (
          <Button disabled={busy || validItems.length === 0} onClick={apply}>
            {validItems.length} kalemi aktar
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}

function formatCell(k: ItemImportColumnKey, it: ItemImportItem): string {
  const v = it[k];
  if (v == null || v === "") return "—";
  if (k === "requiredByDate" && typeof v === "string") {
    const [y, m, d] = v.split("-");
    return y && m && d ? `${d}.${m}.${y}` : v;
  }
  if (typeof v === "number") return v.toLocaleString("tr-TR", { maximumFractionDigits: 3 });
  return String(v);
}
