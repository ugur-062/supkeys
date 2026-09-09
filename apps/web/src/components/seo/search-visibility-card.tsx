"use client";

import type { AiSeoEnrichResult, SeoReadiness } from "@rothern/shared";
import { CheckCircleIcon, SparklesIcon } from "@heroicons/react/20/solid";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * ARAMA GÖRÜNÜRLÜĞÜ KARTI — ürün formu, Profilim ve talep sihirbazı (Parça 8).
 *
 * Üç şey gösterir: (1) puan + eksikler (ne yapmalı, tek cümle), (2) Google
 * parçacığı önizlemesi — sayfanın GERÇEK şablonunun üreteceği başlık/açıklama
 * (`lib/seo/entities.ts`, aynı fonksiyon), (3) isteğe bağlı "AI ile
 * güçlendir": taslak gelir, kullanıcı uygular ya da atar.
 *
 * Yönlendirir, ZORLAMAZ: yayın kapısı burada değil. Renk ÇAĞIRANDAN gelir
 * (`accent`): satınalma mavi, diğerleri siyah — bileşen portal bilmez.
 */

export interface SnippetPreview {
  title: string;
  description: string;
  url: string;
}

export interface EnrichControls {
  run: () => Promise<AiSeoEnrichResult>;
  apply: (r: AiSeoEnrichResult) => void;
  /** Silver+ ve koltuk izni; değilse düğme pasif + gerekçe. */
  available: boolean;
  unavailableReason?: string;
}

const LEVEL_LABEL: Record<SeoReadiness["level"], string> = {
  weak: "Zayıf",
  fair: "Orta",
  good: "İyi",
};

export function SearchVisibilityCard({
  readiness,
  snippet,
  enrich,
  accent = "zinc",
  className,
}: {
  readiness: SeoReadiness;
  snippet: SnippetPreview;
  enrich?: EnrichControls;
  accent?: "zinc" | "blue";
  className?: string;
}) {
  const [draft, setDraft] = useState<AiSeoEnrichResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bar = accent === "blue" ? "bg-blue-600" : "bg-zinc-900";
  const button =
    accent === "blue"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : "bg-zinc-900 text-white hover:bg-zinc-800";

  const runEnrich = async () => {
    if (!enrich || busy) return;
    setBusy(true);
    setError(null);
    try {
      setDraft(await enrich.run());
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(", ") : msg || "AI taslak üretemedi — tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Arama görünürlüğü"
      className={cn("rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-950">Arama görünürlüğü</h3>
        <p className="text-sm text-zinc-600">
          <span className="text-lg font-semibold text-zinc-950">%{readiness.score}</span> · {LEVEL_LABEL[readiness.level]}
        </p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100" aria-hidden>
        <div className={cn("h-full rounded-full transition-[width] duration-500", bar)} style={{ width: `${readiness.score}%` }} />
      </div>
      <p className="mt-2 text-xs/5 text-zinc-500">
        Arama motorları ve yapay zekâ asistanları bu sayfayı ne kadar kolay bulur ve alıntılar. Yayını engellemez, yönlendirir.
      </p>

      {readiness.missing.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {readiness.missing.slice(0, 4).map((m) => (
            <li key={m.key} className="text-sm">
              <p className="font-medium text-zinc-900">
                {m.label} <span className="text-xs font-normal text-zinc-500">+{m.points}</span>
              </p>
              <p className="text-xs/5 text-zinc-600">{m.hint}</p>
            </li>
          ))}
          {readiness.missing.length > 4 ? (
            <li className="text-xs text-zinc-500">+{readiness.missing.length - 4} madde daha</li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircleIcon aria-hidden className="size-4" />
          Arama için hazır
        </p>
      )}

      {/* Parçacık önizlemesi — sayfanın gerçek şablonundan (aynı fonksiyon). */}
      <div className="mt-5 border-t border-zinc-950/5 pt-4">
        <p className="text-xs font-medium text-zinc-600">Google'da böyle görünür</p>
        <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <p className="truncate text-xs text-emerald-800">{snippet.url}</p>
          <p className="mt-0.5 line-clamp-2 text-base/6 text-blue-800">{snippet.title}</p>
          <p className="mt-0.5 line-clamp-3 text-sm/5 text-zinc-700">{snippet.description}</p>
        </div>
      </div>

      {enrich ? (
        <div className="mt-5 border-t border-zinc-950/5 pt-4">
          {draft ? (
            <div className="space-y-3">
              <p className="text-xs font-medium text-zinc-600">AI taslağı — kontrol edin, uygun görürseniz uygulayın</p>
              {draft.titleSuggestion ? (
                <p className="text-sm text-zinc-800">
                  <span className="text-xs text-zinc-500">Ad önerisi: </span>
                  {draft.titleSuggestion}
                </p>
              ) : null}
              <p className="whitespace-pre-line rounded-xl bg-zinc-50 p-3 text-sm/6 text-zinc-800 ring-1 ring-zinc-200">
                {draft.description}
              </p>
              {draft.keywords.length ? (
                <p className="flex flex-wrap gap-1.5">
                  {draft.keywords.map((k) => (
                    <span key={k} className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700">
                      {k}
                    </span>
                  ))}
                </p>
              ) : null}
              {draft.missingFacts.length ? (
                <p className="text-xs/5 text-zinc-600">
                  <span className="font-medium">Ekleyebileceğiniz olgular:</span> {draft.missingFacts.join(" · ")}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    enrich.apply(draft);
                    setDraft(null);
                  }}
                  className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", button)}
                >
                  Uygula
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  Vazgeç
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void runEnrich()}
                disabled={!enrich.available || busy}
                title={enrich.available ? undefined : enrich.unavailableReason}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <SparklesIcon aria-hidden className="size-4" />}
                {busy ? "Taslak hazırlanıyor…" : "AI ile açıklamayı güçlendir"}
              </button>
              {!enrich.available && enrich.unavailableReason ? (
                <p className="mt-1.5 text-xs text-zinc-500">{enrich.unavailableReason}</p>
              ) : null}
              {error ? <p className="mt-1.5 text-xs text-red-700">{error}</p> : null}
              <p className="mt-1.5 text-xs/5 text-zinc-500">
                Yalnız yazdığınız olguları tam cümlelere çevirir; ölçü, standart ya da fiyat uydurmaz. Kaydetmeden önce siz onaylarsınız.
              </p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
