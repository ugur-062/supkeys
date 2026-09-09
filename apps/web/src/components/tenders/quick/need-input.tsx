"use client";

import { useAiSearchIntent } from "@/hooks/use-ai-search-intent";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { cn } from "@/lib/utils";
import { tierAtLeast, type AiSearchIntentResult } from "@rothern/shared";
import { SparklesIcon } from "@heroicons/react/20/solid";
import { Loader2 } from "lucide-react";
import { useState } from "react";

/**
 * "NE LAZIM?" — tek giriş noktası (2026-09-09, hızlı talep).
 *
 * Serbest metin ya da yapıştırılmış liste. Silver+ ise AI (`search-intent`)
 * niyeti kalem/kategori/başlığa çevirir; değilse ya da AI kapalıysa satır
 * ayrıştırıcı çalışır (`onParse`). AI kapalıyken bile form dolar — ağa
 * bağımlı tek adım yok.
 */
export function NeedInput({
  onParse,
  onAi,
  compact,
}: {
  onParse: (text: string) => void;
  onAi: (r: AiSearchIntentResult, text: string) => void;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
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
        return;
      } catch {
        /* AI düşerse ayrıştırıcıya düş — kullanıcı beklemesin */
      }
    }
    onParse(t);
  };

  return (
    <div className={cn("rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5", compact ? "p-4" : "p-5")}>
      <label htmlFor="need-input" className="text-sm font-semibold text-zinc-950">
        Ne lazım?
      </label>
      <p className="mt-0.5 text-xs text-zinc-500">
        Bir cümle ya da her satıra bir kalem: <span className="text-zinc-700">“1.200 m ¾ inç dikişsiz çelik boru, İzmir’e, 2 haftaya”</span>
      </p>
      <textarea
        id="need-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void run(true);
        }}
        rows={compact ? 2 : 3}
        placeholder="Örn. 1200 m çelik boru 3/4 inç dikişsiz&#10;500 adet M8 cıvata&#10;20 kg conta"
        className="mt-3 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          {aiAvailable ? "AI kalemleri, miktarı ve kategoriyi çıkarır; siz düzeltirsiniz." : "Satırlar kaleme çevrilir; miktar ve birimi tabloda düzeltin."}
        </p>
        <div className="flex gap-2">
          {aiAvailable ? (
            <button
              type="button"
              onClick={() => void run(true)}
              disabled={intent.isPending || text.trim().length < 3}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {intent.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <SparklesIcon aria-hidden className="size-4" />}
              {intent.isPending ? "Çözümleniyor…" : "Kalemlere çevir"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void run(false)}
            disabled={intent.isPending || text.trim().length < 3}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50",
              aiAvailable ? "border border-zinc-300 text-zinc-800 hover:bg-zinc-50" : "bg-blue-600 text-white hover:bg-blue-700",
            )}
          >
            {aiAvailable ? "AI'sız ekle" : "Kalemlere çevir"}
          </button>
        </div>
      </div>
    </div>
  );
}
