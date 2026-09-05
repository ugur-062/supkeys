"use client";

import { useAiSearchIntent } from "@/hooks/use-ai-search-intent";
import { extractErrorMessage } from "@/lib/tenders/error";
import type { AiSearchIntentResult, AiSearchPortal } from "@rothern/shared";
import { MagnifyingGlassIcon, SparklesIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";

/**
 * PANEL ARAMA BLOĞU — Europages "Ne arıyorsunuz?" kalıbı (2026-09-05,
 * kullanıcı kararı): iki panelin anasayfası da herkese açık sitedeki hero
 * gibi büyük bir arama kutusuyla açılır. Kart içinde DEĞİL: tam genişlikte,
 * ferah bir bölüm; ince renk lekesi portal vurgusunu taşır.
 *
 *  · Satınalma → ürün arar (`/company/satinalma/urunler?q=`); "Ürün Ara"
 *    sol menüden KALKTI, giriş noktası bu kutu.
 *  · Satış     → açık alım taleplerini arar (`/company/satis?q=` — liste anasayfada).
 *
 * Düz `<form method="get">`: JavaScript gelmeden de çalışır (sonuç sayfası
 * `?q=` okur); JS'de `router.push` ile tam sayfa yenileme olmaz. Yazarken
 * öneri: veri ÇAĞIRANDAN gelir (`suggestions` + `onQueryChange`) — kutu
 * hangi ucun konuşulacağını bilmez, panelin kendi uçları kullanılır (herkese
 * açık `public/suggest` panelde YASAK). Çipler en dolu kategoriler.
 */
export interface PanelHeroChip {
  id: string;
  name: string;
  count: number;
  href: string;
}

export interface PanelSuggestGroup {
  label: string;
  rows: { key: string; label: string; meta?: string; href: string }[];
}

/**
 * "AI ile ara" (2026-09-05, Europages kalıbı): kutu doğal dil alır, model
 * SÜZGEÇ üretir (sonuç değil), sayfa onu listeye uygular ve "AI şöyle
 * anladı" bandını basar. Silver+ (diğer AI özellikleriyle aynı kapı);
 * altındaki paketlerde anahtar görünür ama devre dışı — özellik satışa da
 * hizmet eder.
 */
export interface PanelHeroAi {
  portal: AiSearchPortal;
  /** Silver+ ∧ koltuk rolü. */
  enabled: boolean;
  onResult: (r: AiSearchIntentResult) => void;
  placeholder?: string;
}

export function PanelHeroSearch({
  eyebrow,
  title,
  lead,
  placeholder,
  action,
  chips = [],
  chipsLabel = "Popüler",
  accent = "blue",
  suggestions = [],
  onQueryChange,
  ai,
}: {
  eyebrow?: string;
  title: string;
  lead: string;
  placeholder: string;
  /** Sonuç sayfası — `?q=` okuyan liste. */
  action: string;
  chips?: PanelHeroChip[];
  chipsLabel?: string;
  accent?: "blue" | "emerald";
  /** Yazarken öneriler — çağıran hesaplar (≥2 karakter). */
  suggestions?: PanelSuggestGroup[];
  onQueryChange?: (q: string) => void;
  ai?: PanelHeroAi;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const intent = useAiSearchIntent();
  const aiActive = !!ai && aiMode;
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const term = q.trim();
    setOpen(false);
    if (aiActive && ai) {
      if (term.length < 3 || intent.isPending) return;
      intent.mutate(
        { text: term, portal: ai.portal },
        {
          onSuccess: (r) => ai.onResult(r),
          onError: (err) => toast.error(extractErrorMessage(err, "AI araması başarısız oldu — tekrar deneyin.")),
        },
      );
      return;
    }
    // Sonuç listesi AYNI sayfadaysa (satış: açık talepler anasayfada) seçili
    // süzgeçler korunur, yalnız arama ve sayfa değişir — başka sayfaya
    // giderken temiz `?q=`.
    const keep = new URLSearchParams(action === pathname ? (sp?.toString() ?? "") : "");
    keep.delete("q");
    keep.delete("sayfa");
    const parts = [...keep.entries()].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    if (term) parts.push(`q=${encodeURIComponent(term)}`);
    router.push(parts.length ? `${action}?${parts.join("&")}` : action);
  };
  const hasSug = !aiActive && q.trim().length >= 2 && suggestions.some((g) => g.rows.length > 0);
  // Textarea'da Enter gönderir, Shift+Enter satır ekler.
  const onAiKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };
  const aiPlaceholder =
    ai?.placeholder ??
    (ai?.portal === "satis"
      ? "Ne sattığınızı anlatın: ürün, kapasite, bölge…"
      : "Ne aradığınızı anlatın: ürün, adet, şehir, teslim süresi, bütçe…");
  const tone =
    accent === "blue"
      ? { glow: "var(--color-blue-200)", eyebrow: "text-blue-700" }
      : { glow: "var(--color-emerald-200)", eyebrow: "text-emerald-700" };

  return (
    <section aria-label={title} className="relative isolate -mx-1 px-1 pt-2 pb-4 sm:pt-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[26rem] w-[56rem] -translate-x-1/2 rounded-full opacity-40"
        style={{ background: `radial-gradient(closest-side, ${tone.glow}, transparent)` }}
      />
      <div className="mx-auto max-w-2xl text-center">
        {eyebrow ? (
          <p className={`text-sm/6 font-semibold ${tone.eyebrow}`}>{eyebrow}</p>
        ) : null}
        <h2 className="mt-1 text-3xl font-semibold tracking-tight text-balance text-zinc-950 sm:text-4xl">
          {title}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base/7 text-pretty text-zinc-500">{lead}</p>

        {ai ? (
          <div className="mt-6 flex items-center justify-center gap-1 text-xs">
            <div role="group" aria-label="Arama modu" className="inline-flex rounded-full bg-zinc-100 p-0.5">
              <button
                type="button"
                aria-pressed={!aiMode}
                onClick={() => setAiMode(false)}
                className={`rounded-full px-3 py-1 font-semibold transition ${!aiMode ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600 hover:text-zinc-950"}`}
              >
                Ara
              </button>
              <button
                type="button"
                aria-pressed={aiMode}
                disabled={!ai.enabled}
                title={ai.enabled ? undefined : "Silver ve üzeri paketlerde"}
                onClick={() => ai.enabled && setAiMode(true)}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${aiMode ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600 hover:text-zinc-950"}`}
              >
                <SparklesIcon aria-hidden className="size-3.5 text-blue-600" />
                AI ile ara
              </button>
            </div>
            {!ai.enabled ? (
              <Link href="/company/ayarlar" className="ml-1 text-zinc-500 underline underline-offset-2 hover:text-zinc-950">
                Silver ile açılır
              </Link>
            ) : null}
          </div>
        ) : null}

        {/* `data-hero-search`: üst çubuk araması bu kutuyu gözler — kutu
            görünümdeyken gizli, kaydırınca ve diğer sayfalarda görünür. */}
        <form
          data-hero-search
          action={action}
          method="get"
          role="search"
          onSubmit={onSubmit}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
          }}
          className={ai ? "relative mt-4" : "relative mt-7"}
        >
          <div className="flex items-stretch gap-2">
            <div
              className={`relative flex flex-1 items-center bg-white shadow-lg shadow-zinc-950/5 ring-1 ring-inset transition focus-within:ring-2 ${
                aiActive
                  ? "rounded-3xl ring-blue-200 focus-within:ring-blue-500"
                  : "rounded-full ring-zinc-950/10 focus-within:ring-zinc-950"
              }`}
            >
              {aiActive ? (
                <SparklesIcon aria-hidden className="pointer-events-none absolute top-4 left-4 size-5 text-blue-600" />
              ) : (
                <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute left-4 size-5 text-zinc-400" />
              )}
              {aiActive ? (
                <textarea
                  name="q"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={onAiKey}
                  rows={2}
                  placeholder={aiPlaceholder}
                  aria-label="AI ile ara"
                  maxLength={500}
                  className="min-h-14 w-full resize-none rounded-3xl bg-transparent py-3.5 pr-4 pl-11 text-base text-zinc-950 outline-none placeholder:text-zinc-400"
                />
              ) : (
                <input
                  type="search"
                  name="q"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    onQueryChange?.(e.target.value);
                    setOpen(true);
                  }}
                  onFocus={() => setOpen(true)}
                  placeholder={placeholder}
                  aria-label={title}
                  autoComplete="off"
                  className="h-14 w-full rounded-full bg-transparent pr-4 pl-11 text-base text-zinc-950 outline-none placeholder:text-zinc-400"
                />
              )}
            </div>
            <button
              type="submit"
              disabled={aiActive && intent.isPending}
              className={`h-14 shrink-0 rounded-full px-7 text-sm font-semibold text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 ${
                aiActive ? "self-end bg-blue-600 hover:bg-blue-700 focus-visible:outline-blue-600" : "bg-zinc-950 hover:bg-zinc-800 focus-visible:outline-zinc-950"
              }`}
            >
              {aiActive ? (intent.isPending ? "Yorumlanıyor…" : "AI ile bul") : "Ara"}
            </button>
          </div>
          {aiActive ? (
            <p className="mt-2 text-xs text-zinc-500">
              Örnek: &ldquo;İstanbul'a teslim, 50 adet 400 kVAr kompanzasyon panosu, doğrulanmış üretici&rdquo; — AI süzgeçleri kurar, sonuçlar aşağıda listelenir.
            </p>
          ) : null}

          {open && hasSug ? (
            <div
              role="listbox"
              aria-label="Öneriler"
              className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl bg-white text-left shadow-xl ring-1 ring-zinc-950/10"
            >
              {suggestions
                .filter((g) => g.rows.length > 0)
                .map((g) => (
                  <div key={g.label} className="border-b border-zinc-950/5 py-1 last:border-b-0">
                    <p className="px-4 pt-1.5 pb-0.5 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
                      {g.label}
                    </p>
                    <ul>
                      {g.rows.map((r) => (
                        <li key={r.key}>
                          <Link
                            href={r.href}
                            role="option"
                            aria-selected={false}
                            className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
                          >
                            <span className="line-clamp-1">{r.label}</span>
                            {r.meta ? <span className="shrink-0 text-xs text-zinc-500">{r.meta}</span> : null}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          ) : null}
        </form>

        {chips.length > 0 ? (
          <nav aria-label={chipsLabel} className="mt-4 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1.5 text-xs">
            <span className="text-zinc-500">{chipsLabel}:</span>
            {chips.slice(0, 6).map((c) => (
              <Link
                key={c.id}
                href={c.href}
                className="inline-flex max-w-[15rem] items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-700 transition hover:bg-zinc-950 hover:text-white"
              >
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 text-zinc-400 tabular-nums">{c.count}</span>
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </section>
  );
}
