"use client";

import {
  useAiProductExtract,
  useCommitProductImport,
  useParseProductImport,
  type ProductImportRow,
} from "@/hooks/use-company-items";
import { companyApi } from "@/lib/company-auth/api";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import {
  ArrowDownTrayIcon,
  DocumentArrowUpIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import { useRef, useState } from "react";
import { toast } from "sonner";

/**
 * TOPLU ÜRÜN İÇE AKTARMA — İKİ KAYNAK, TEK ÖNİZLEME.
 *
 *   · Excel şablonu  → deterministik, AI yok, her pakete açık.
 *   · Katalog (AI)   → kullanıcının YÜKLEDİĞİ PDF/fotoğraf, Silver+.
 *
 * İkisi de aynı `ProductImportRow[]` üretir ve aynı `commit` ucundan geçer:
 * iki ayrı yazma yolu olsaydı biri diğerinin kuralını kaçırırdı.
 *
 * Akış — üç adım, hiçbiri diğerine güvenmez:
 *   şablon indir → dosya seç (ÖNİZLEME, hiçbir şey yazılmaz) → onayla (yaz).
 *
 * Önizlemede satır-satır sorunlar gösterilir ama sorunlu satır DÜŞMEZ:
 * 400 satırlık dosyadan sessizce eksiltmek yerine kullanıcıya düzeltme şansı
 * veriyoruz. Ürünler TASLAK doğar — görsel eklenmeden vitrine çıkmaz.
 */
export function ImportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<{
    rows: ProductImportRow[];
    notices: string[];
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const aiRef = useRef<HTMLInputElement>(null);
  const parse = useParseProductImport();
  const aiExtract = useAiProductExtract();
  const commit = useCommitProductImport();
  const busy = parse.isPending || aiExtract.isPending;

  const downloadTemplate = async () => {
    try {
      const res = await companyApi.get("/company/items/import/template", {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rothern-urun-sablonu.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Şablon indirilemedi");
    }
  };

  const fail = (e: unknown, fallback: string) => {
    const msg =
      (e as { response?: { data?: { message?: string } } })?.response?.data
        ?.message ?? fallback;
    toast.error(msg);
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPreview(await parse.mutateAsync(file));
    } catch (e) {
      fail(e, "Dosya okunamadı");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const pickCatalog = async (files: FileList | null) => {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    try {
      setPreview(await aiExtract.mutateAsync(list));
    } catch (e) {
      fail(e, "Katalog okunamadı");
    } finally {
      if (aiRef.current) aiRef.current.value = "";
    }
  };

  const save = async () => {
    if (!preview) return;
    try {
      const r = await commit.mutateAsync(preview.rows);
      toast.success(
        `${r.created} ürün eklendi${r.updated > 0 ? `, ${r.updated} güncellendi` : ""} — taslak olarak`,
      );
      setPreview(null);
      onClose();
    } catch {
      toast.error("Kaydedilemedi");
    }
  };

  const withIssues = preview?.rows.filter((r) => r.issues.length > 0) ?? [];

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-zinc-950/40" aria-hidden />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl">
          <div className="flex items-start justify-between gap-4 border-b border-zinc-950/5 p-6">
            <div>
              <DialogTitle className="text-lg font-semibold tracking-tight text-zinc-950">
                Toplu ürün ekle
              </DialogTitle>
              <p className="mt-1 text-sm text-zinc-500">
                Şablonu doldurun ya da kendi katalog dosyanızı yükleyin.
                Ürünler taslak olarak eklenir; görsel ekleyip panelden
                yayımlarsınız.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-m-1 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Kapat"
            >
              <XMarkIcon aria-hidden className="size-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {!preview ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => inputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300 px-4 py-10 text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700 disabled:opacity-50"
                  >
                    <DocumentArrowUpIcon aria-hidden className="size-8" />
                    <span className="text-sm font-medium text-zinc-800">
                      {parse.isPending ? "Okunuyor…" : "Excel veya CSV"}
                    </span>
                    <span className="text-xs">
                      Şablon · en fazla 500 ürün
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => aiRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300 px-4 py-10 text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700 disabled:opacity-50"
                  >
                    <SparklesIcon aria-hidden className="size-8 text-brand-600" />
                    <span className="text-sm font-medium text-zinc-800">
                      {aiExtract.isPending
                        ? "Katalog okunuyor…"
                        : "Katalogdan oku (AI)"}
                    </span>
                    <span className="text-xs">
                      Kendi katalog PDF&apos;iniz veya fotoğrafı
                    </span>
                  </button>
                </div>

                {/* Butonun İÇİNE konmadı: iç içe tıklanabilir öğe hem ekran
                    okuyucuda hem klavyede belirsiz olurdu. */}
                <button
                  type="button"
                  onClick={() => void downloadTemplate()}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-600"
                >
                  <ArrowDownTrayIcon aria-hidden className="size-4" />
                  Excel şablonunu indir
                </button>

                <p className="text-xs/5 text-zinc-500">
                  Dosya yalnızca <strong>önizlenir</strong> — onaylamadan hiçbir
                  şey kaydedilmez. Aynı stok kodu ikinci kez yüklenirse mevcut
                  ürün güncellenir, kopya oluşmaz. Katalogdaki görseller
                  aktarılamaz; ürünler taslak kalır.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  {preview.rows.length} ürün okundu
                  {withIssues.length > 0 ? (
                    <span className="ml-2 font-normal text-amber-700">
                      · {withIssues.length} satırda düzeltilecek nokta var
                    </span>
                  ) : null}
                </p>

                {preview.notices.map((n) => (
                  <p
                    key={n}
                    className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-600/20"
                  >
                    <ExclamationTriangleIcon
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0"
                    />
                    {n}
                  </p>
                ))}

                <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-zinc-950/5">
                  <table className="w-full min-w-[40rem] text-left text-sm">
                    <thead className="bg-zinc-50 text-xs tracking-wide text-zinc-500 uppercase">
                      <tr>
                        <th className="py-2.5 pr-3 pl-4 font-medium">Satır</th>
                        <th className="py-2.5 pr-3 font-medium">Ürün</th>
                        <th className="py-2.5 pr-3 font-medium">Birim</th>
                        <th className="py-2.5 pr-3 font-medium">Kategori</th>
                        <th className="py-2.5 pr-3 font-medium">Fiyat</th>
                        <th className="py-2.5 pr-4 font-medium">Not</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-950/5 bg-white">
                      {preview.rows.slice(0, 100).map((r) => (
                        <tr key={r.rowNumber} className="align-top">
                          <td className="py-2 pr-3 pl-4 text-zinc-400">
                            {r.rowNumber}
                          </td>
                          <td className="py-2 pr-3">
                            <p className="font-medium text-zinc-900">{r.name}</p>
                            {r.code ? (
                              <p className="text-xs text-zinc-500">{r.code}</p>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 text-zinc-600">{r.unit}</td>
                          <td className="py-2 pr-3 whitespace-nowrap text-zinc-600">
                            {r.categoryId ?? (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap text-zinc-600">
                            {r.priceMode === "FIXED" && r.price != null
                              ? `${r.price.toLocaleString("tr-TR")} ${r.currency ?? "TRY"}`
                              : r.priceMode === "TIERED"
                                ? "Kademeli"
                                : "Teklif isteyin"}
                          </td>
                          <td className="py-2 pr-4">
                            {r.issues.length > 0 ? (
                              <span className="text-xs text-amber-700">
                                {r.issues.join(" · ")}
                              </span>
                            ) : (
                              <span className="text-xs text-zinc-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.rows.length > 100 ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    İlk 100 satır gösteriliyor; tamamı kaydedilecek.
                  </p>
                ) : null}
              </div>
            )}
          </div>

          {preview ? (
            <div className="flex items-center justify-end gap-3 border-t border-zinc-950/5 p-6">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-full px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900"
              >
                Başka dosya seç
              </button>
              <button
                type="button"
                disabled={commit.isPending}
                onClick={() => void save()}
                className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
              >
                {commit.isPending
                  ? "Kaydediliyor…"
                  : `${preview.rows.length} ürünü ekle`}
              </button>
            </div>
          ) : null}

          <input
            ref={aiRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.xlsx,.csv"
            hidden
            onChange={(e) => void pickCatalog(e.target.files)}
          />
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </DialogPanel>
      </div>
    </Dialog>
  );
}
