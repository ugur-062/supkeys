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
  useAiBidPriceExtract,
  useDownloadBidTemplate,
  useParseBidTemplate,
} from "@/hooks/use-bid-import";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import {
  bidDeliveryTimeLabel,
  type BidImportConfidence,
  type BidImportMatch,
  type BidImportResult,
} from "@rothern/shared";
import { AlertTriangle, Download, FileSpreadsheet, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export type BidImportVariant = "excel" | "ai";

/** Forma uygulanacak kalem değerleri — teklif sayfası itemState'e yazar. */
export interface BidImportApplyRow {
  itemId: string;
  unitPrice: number;
  currency: string | null;
  deliveryTime: string | null;
}

/**
 * Teklif fiyatı içe aktarma (Faz 2, 2026-08-22) — iki varyant, TEK önizleme:
 *  - excel: ihaleye özel şablon indir → doldur → yükle (AI yok, kesin eşleme)
 *  - ai:    fiyat listesi / proforma (PDF/foto/Excel) → AI okur → eşleştirme
 * Önizleme: kalem | belgede bulunan | fiyat | güven rozeti; düşük güvende
 * eşleşmeyen belge satırından elle seç; "Forma uygula" yalnız formu doldurur.
 */
export function BidImportDialog({
  open,
  onClose,
  variant,
  listingId,
  currencyLabel,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  variant: BidImportVariant;
  listingId: string;
  /** Teklifin ana para birimi (null currency satırlarında gösterilir). */
  currencyLabel: string;
  onApply: (rows: BidImportApplyRow[]) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<BidImportResult | null>(null);
  /** Kalem → seçilen belge satırı id'si (elle eşleme) veya "" (boş bırak). */
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const download = useDownloadBidTemplate(listingId);
  const parse = useParseBidTemplate(listingId);
  const ai = useAiBidPriceExtract(listingId);
  const busy = parse.isPending || ai.isPending || download.isPending;
  const isAi = variant === "ai";

  const reset = () => {
    setFiles([]);
    setResult(null);
    setOverrides({});
    setExcluded(new Set());
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const run = async (picked: File[]) => {
    try {
      const r = isAi ? await ai.mutateAsync(picked) : await parse.mutateAsync(picked[0]!);
      setResult(r);
      setFiles(picked);
    } catch (err) {
      setFiles([]);
      toast.error(extractErrorMessage(err, isAi ? "Belge işlenemedi" : "Dosya okunamadı"));
    }
  };

  // Satırın efektif değeri: elle eşleme (override) > motor eşleşmesi.
  const effective = useMemo(() => {
    if (!result) return [];
    const byDoc = new Map(result.unmatchedDocRows.map((d) => [d.id, d] as const));
    return result.matches.map((m) => {
      const ov = overrides[m.itemId];
      if (ov === undefined) return { m, unitPrice: m.unitPrice, currency: m.currency, deliveryTime: m.deliveryTime, source: m.source, confidence: m.confidence, manual: false };
      if (ov === "") return { m, unitPrice: null, currency: null, deliveryTime: null, source: null, confidence: "none" as BidImportConfidence, manual: true };
      const d = byDoc.get(ov);
      return {
        m,
        unitPrice: d?.unitPrice ?? null,
        currency: d?.currency ?? null,
        deliveryTime: d?.deliveryTime ?? null,
        source: d?.text ?? null,
        confidence: "exact" as BidImportConfidence, // kullanıcı elle seçti
        manual: true,
      };
    });
  }, [result, overrides]);

  const applicable = effective.filter(
    (e) => e.unitPrice != null && e.m.errors.length === 0 && !excluded.has(e.m.itemId),
  );

  const apply = () => {
    onApply(
      applicable.map((e) => ({
        itemId: e.m.itemId,
        unitPrice: e.unitPrice!,
        currency: e.currency,
        deliveryTime: e.deliveryTime,
      })),
    );
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} size={result ? "5xl" : "lg"}>
      <DialogTitle>
        <span className="flex items-center gap-2">
          {isAi ? <Sparkles className="h-5 w-5" /> : <FileSpreadsheet className="h-5 w-5" />}
          {isAi ? "Belgeden Fiyatla (AI)" : "Excel Şablonu ile Fiyatla"}
        </span>
      </DialogTitle>
      <DialogDescription>
        {isAi
          ? "Fiyat listenizi, proformanızı ya da teklif mektubunuzu yükleyin — AI satırları okur, sistem ihale kalemleriyle eşleştirir; siz kontrol edip uygularsınız. Teklifi her zaman SİZ gönderirsiniz."
          : "Bu ihaleye özel şablonu indirin, fiyat/teslim sütunlarını doldurun ve yükleyin — kalemler birebir eşleşir (AI kullanılmaz). Teklifi her zaman SİZ gönderirsiniz."}
      </DialogDescription>

      <DialogBody className="space-y-4">
        {!result ? (
          <>
            {!isAi ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-950/10 bg-zinc-50 px-3 py-2.5">
                <Download className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                <div className="min-w-0 flex-1 text-sm text-zinc-700">
                  <strong>1.</strong> Bu ihalenin teklif şablonunu indirin (kalemler hazır; siz fiyat/teslim doldurursunuz)
                </div>
                <Button
                  outline
                  disabled={busy}
                  onClick={() =>
                    download
                      .mutateAsync()
                      .catch((e) => toast.error(extractErrorMessage(e, "Şablon indirilemedi")))
                  }
                >
                  {download.isPending ? "İndiriliyor…" : "Şablonu indir"}
                </Button>
              </div>
            ) : null}
            <div className="rounded-lg border border-zinc-950/10 px-3 py-2.5 text-sm text-zinc-700">
              <strong>{isAi ? "" : "2. "}</strong>
              {isAi
                ? "Belgenizi yükleyin (tek PDF, tek Excel/CSV ya da birden çok fotoğraf)"
                : "Doldurduğunuz şablonu yükleyin (.xlsx)"}
            </div>
            <Dropzone
              accept={isAi ? ".pdf,.jpg,.jpeg,.png,.webp,.heic,.xlsx,.csv" : ".xlsx,.csv"}
              multiple={isAi}
              disabled={busy}
              onFiles={(fs) => {
                if (fs.length === 0) return;
                void run(isAi ? fs.slice(0, 20) : [fs[0]!]);
              }}
              label={isAi ? "PDF, fotoğraf veya Excel seç" : "Doldurulmuş şablonu seç"}
              hint={isAi ? "En fazla 20 dosya · fiyatlar KDV hariç okunur" : "Yalnız bu ihalenin şablonu kabul edilir"}
            />
            {busy && files.length === 0 ? (
              <p className="text-sm text-zinc-500">
                {isAi ? "Belge işleniyor — AI satırları okuyor, bu birkaç saniye sürebilir…" : "Şablon okunuyor…"}
              </p>
            ) : null}
          </>
        ) : (
          <Preview
            result={result}
            effective={effective}
            overrides={overrides}
            setOverrides={setOverrides}
            excluded={excluded}
            setExcluded={setExcluded}
            currencyLabel={currencyLabel}
            fileNames={files.map((f) => f.name)}
            onReset={reset}
          />
        )}
      </DialogBody>

      <DialogActions>
        <Button plain disabled={busy} onClick={close}>
          Vazgeç
        </Button>
        {result ? (
          <Button disabled={busy || applicable.length === 0} onClick={apply}>
            {applicable.length} kalemin fiyatını uygula
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}

type EffectiveRow = {
  m: BidImportMatch;
  unitPrice: number | null;
  currency: string | null;
  deliveryTime: string | null;
  source: string | null;
  confidence: BidImportConfidence;
  manual: boolean;
};

function Preview({
  result,
  effective,
  overrides,
  setOverrides,
  excluded,
  setExcluded,
  currencyLabel,
  fileNames,
  onReset,
}: {
  result: BidImportResult;
  effective: EffectiveRow[];
  overrides: Record<string, string>;
  setOverrides: (v: Record<string, string>) => void;
  excluded: Set<string>;
  setExcluded: (v: Set<string>) => void;
  currencyLabel: string;
  fileNames: string[];
  onReset: () => void;
}) {
  const priced = effective.filter((e) => e.unitPrice != null && e.m.errors.length === 0).length;
  const hasDocRows = result.unmatchedDocRows.length > 0;
  const toggleExclude = (id: string) => {
    const n = new Set(excluded);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setExcluded(n);
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-800">
          {priced} / {effective.length} kalem fiyatlandı
        </span>
        {result.mode === "ai" ? (
          <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
            AI okudu · eşleştirmeyi sistem yaptı — rozetleri kontrol edin
          </span>
        ) : (
          <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-600">Şablon · birebir eşleşme</span>
        )}
        <span className="ml-auto truncate text-xs text-zinc-500">{fileNames.join(", ")}</span>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800"
        >
          <X className="h-3.5 w-3.5" /> Başka dosya
        </button>
      </div>

      {result.notices.length > 0 ? (
        <ul className="space-y-1">
          {result.notices.map((n, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="max-h-[50vh] overflow-auto rounded-lg border border-zinc-950/10">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="sticky top-0 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Uygula</th>
              <th className="px-3 py-2 font-medium">İhale kalemi</th>
              <th className="px-3 py-2 font-medium">{result.mode === "ai" ? "Belgede bulunan" : "Kaynak"}</th>
              <th className="px-3 py-2 font-medium text-right">Birim fiyat</th>
              <th className="px-3 py-2 font-medium">Teslim</th>
              <th className="px-3 py-2 font-medium">Güven</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {effective.map((e) => {
              const bad = e.m.errors.length > 0;
              const medium = e.confidence === "medium";
              const none = e.unitPrice == null;
              const off = excluded.has(e.m.itemId);
              return (
                <tr
                  key={e.m.itemId}
                  className={cn(bad && "bg-red-50/60", !bad && medium && "bg-amber-50/60", off && "opacity-50")}
                >
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`${e.m.itemName} uygula`}
                      checked={!off && !none && !bad}
                      disabled={none || bad}
                      onChange={() => toggleExclude(e.m.itemId)}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="font-medium text-zinc-900">
                      <span className="text-zinc-400">#{e.m.lineNo}</span> {e.m.itemName}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {e.m.itemQuantity} {e.m.itemUnit}
                    </div>
                    {bad ? <div className="text-xs text-red-700">{e.m.errors.join(" · ")}</div> : null}
                    {e.m.warnings.length > 0 && !bad ? (
                      <div className="text-xs text-amber-700">{e.m.warnings.join(" · ")}</div>
                    ) : null}
                  </td>
                  <td className="max-w-[260px] px-3 py-1.5">
                    {result.mode === "ai" && (medium || none || hasDocRows) ? (
                      <select
                        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs"
                        aria-label={`${e.m.itemName} için belge satırı seç`}
                        value={overrides[e.m.itemId] ?? (e.m.source ? "__auto" : "")}
                        onChange={(ev) => {
                          const v = ev.target.value;
                          const next = { ...overrides };
                          if (v === "__auto") delete next[e.m.itemId];
                          else next[e.m.itemId] = v;
                          setOverrides(next);
                        }}
                      >
                        {e.m.source ? <option value="__auto">{e.m.source} (otomatik)</option> : null}
                        <option value="">— eşleştirme (boş bırak)</option>
                        {result.unmatchedDocRows.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.text}
                            {d.unitPrice != null ? ` · ${fmt(d.unitPrice)}` : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="block truncate text-zinc-700">{e.source ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-900">
                    {e.unitPrice != null ? `${fmt(e.unitPrice)} ${e.currency ?? currencyLabel}` : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-zinc-700">{bidDeliveryTimeLabel(e.deliveryTime) ?? "—"}</td>
                  <td className="px-3 py-1.5">
                    <ConfidenceBadge c={e.confidence} manual={e.manual} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">
        Uygula yalnız formdaki kalem fiyatlarını doldurur; teklifi göndermeden önce tüm alanları kontrol edin.
      </p>
    </>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ConfidenceBadge({ c, manual }: { c: BidImportConfidence; manual: boolean }) {
  if (manual && c === "exact") {
    return <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[11px] font-medium text-white">Elle</span>;
  }
  const map: Record<BidImportConfidence, { label: string; cls: string; dots: string }> = {
    exact: { label: "Kesin", cls: "bg-emerald-100 text-emerald-800", dots: "●●●" },
    high: { label: "Yüksek", cls: "bg-emerald-50 text-emerald-700", dots: "●●○" },
    medium: { label: "Emin misiniz?", cls: "bg-amber-100 text-amber-800", dots: "●○○" },
    none: { label: "Eşleşmedi", cls: "bg-zinc-100 text-zinc-500", dots: "—" },
  };
  const v = map[c];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium", v.cls)}>
      <span aria-hidden>{v.dots}</span> {v.label}
    </span>
  );
}
