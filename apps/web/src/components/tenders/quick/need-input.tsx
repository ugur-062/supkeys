"use client";

import { AiImportDialog } from "@/components/tenders/ai-import/ai-import-dialog";
import { CatalogPickerDialog, type PickedCatalogItem } from "@/components/tenders/wizard/catalog-picker-dialog";
import { useAiSearchIntent } from "@/hooks/use-ai-search-intent";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { cn } from "@/lib/utils";
import { tierAtLeast, type AiSearchIntentResult, type AiTenderExtractResult } from "@rothern/shared";
import { DocumentArrowUpIcon, PencilSquareIcon, SparklesIcon, Squares2X2Icon } from "@heroicons/react/20/solid";
import { Loader2 } from "lucide-react";
import { useState } from "react";

const EXAMPLES = ["1200 m 3/4 inç dikişsiz çelik boru", "500 adet M8 paslanmaz cıvata", "20 ton portland çimento"];

/**
 * "NE LAZIM?" — üç girişli ihtiyaç kutusu (2026-09-09 v2).
 *
 *  Yaz          → serbest metin; Silver+ AI (`search-intent`) ya da satır
 *                 ayrıştırıcı. AI kapalıyken de form dolar.
 *  Kataloğumdan → kalem kataloğu (sihirbazdaki `CatalogPickerDialog`).
 *  Belgeden     → şartname/teklif talebi/fotoğraf (AI-1 `AiImportDialog`).
 *
 * Kalem eklendikten sonra kutu DARALIR: odak tabloya geçer, "yeni satır"
 * ile yeniden açılır.
 */
export function NeedInput({
  onParse,
  onAi,
  onCatalog,
  onDocument,
  collapsed,
  onExpand,
}: {
  onParse: (text: string) => void;
  onAi: (r: AiSearchIntentResult, text: string) => void;
  onCatalog: (items: PickedCatalogItem[]) => void;
  onDocument: (r: AiTenderExtractResult) => void;
  collapsed?: boolean;
  onExpand?: () => void;
}) {
  const [text, setText] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const { company } = useCompanyAuth();
  const aiAvailable = !!company && tierAtLeast(company.tier, "SILVER");
  const intent = useAiSearchIntent();

  const run = async (useAi: boolean) => {
    const t = text.trim();
    if (t.length < 3) return;
    if (useAi && aiAvailable) {
      try {
        const r = await intent.mutateAsync({ text: t, portal: "satinalma" });
        onAi(r, t);
        setText("");
        return;
      } catch {
        /* AI düşerse ayrıştırıcıya düş — kullanıcı beklemesin */
      }
    }
    onParse(t);
    setText("");
  };

  if (collapsed) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onExpand} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
          <PencilSquareIcon aria-hidden className="size-4" /> Yazarak ekle
        </button>
        <button type="button" onClick={() => setCatalogOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
          <Squares2X2Icon aria-hidden className="size-4" /> Kataloğumdan
        </button>
        <button type="button" onClick={() => setDocOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
          <DocumentArrowUpIcon aria-hidden className="size-4" /> Belgeden
        </button>
        <CatalogPickerDialog open={catalogOpen} onClose={() => setCatalogOpen(false)} onPick={(items) => { setCatalogOpen(false); onCatalog(items); }} />
        <AiImportDialog open={docOpen} onClose={() => setDocOpen(false)} onResult={(r) => { setDocOpen(false); onDocument(r); }} />
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="need-input" className="sr-only">
        Ne lazım?
      </label>
      <div className="rounded-xl border border-zinc-300 bg-white transition focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/15">
        <textarea
          id="need-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void run(true);
          }}
          rows={4}
          placeholder={"Her satıra bir kalem — miktar ve birimle:\n1200 m 3/4 inç dikişsiz çelik boru\n500 adet M8 cıvata"}
          className="w-full resize-none rounded-t-xl border-0 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-zinc-400"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 px-3 py-2">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setCatalogOpen(true)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
              <Squares2X2Icon aria-hidden className="size-3.5" /> Kataloğumdan seç
            </button>
            <button type="button" onClick={() => setDocOpen(true)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
              <DocumentArrowUpIcon aria-hidden className="size-3.5" /> Belgeden doldur
            </button>
          </div>
          <div className="flex gap-2">
            {aiAvailable ? (
              <button
                type="button"
                onClick={() => void run(true)}
                disabled={intent.isPending || text.trim().length < 3}
                className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {intent.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <SparklesIcon aria-hidden className="size-4" />}
                {intent.isPending ? "Çözümleniyor…" : "Kalemlere çevir"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void run(false)}
              disabled={intent.isPending || text.trim().length < 3}
              className={cn("rounded-full px-4 py-1.5 text-sm font-semibold transition disabled:opacity-50", aiAvailable ? "border border-zinc-300 text-zinc-800 hover:bg-zinc-50" : "bg-blue-600 text-white hover:bg-blue-700")}
            >
              {aiAvailable ? "AI'sız ekle" : "Kalemlere çevir"}
            </button>
          </div>
        </div>
      </div>
      {!text ? (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
          Örnek:
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setText((t) => (t ? `${t}\n${ex}` : ex))} className="rounded-md border border-dashed border-zinc-300 px-1.5 py-0.5 text-[11px] text-zinc-700 hover:border-zinc-900">
              {ex}
            </button>
          ))}
        </p>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">{aiAvailable ? "AI kalemleri, miktarı ve kategoriyi çıkarır; siz düzeltirsiniz. Ctrl+Enter." : "Satırlar kaleme çevrilir; miktar ve birimi tabloda düzeltin."}</p>
      )}
      <CatalogPickerDialog open={catalogOpen} onClose={() => setCatalogOpen(false)} onPick={(items) => { setCatalogOpen(false); onCatalog(items); }} />
      <AiImportDialog open={docOpen} onClose={() => setDocOpen(false)} onResult={(r) => { setDocOpen(false); onDocument(r); }} />
    </div>
  );
}
