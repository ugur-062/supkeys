"use client";

import { useAiSearchIntent } from "@/hooks/use-ai-search-intent";
import { extractErrorMessage } from "@/lib/tenders/error";
import type { AiSearchIntentResult, AiSearchPortal } from "@rothern/shared";
import { ArrowRightIcon, MagnifyingGlassIcon, SparklesIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { rememberSearch } from "@/lib/company/recent-searches";

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
  supplierScope,
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
  /**
   * İKİNCİ ARAMA KAPSAMI — "Ürün | Tedarikçi" anahtarı (2026-09-08,
   * kullanıcı isteği, kaynak kalıp). Verilirse kutunun üstünde anahtar
   * çizilir ve "Tedarikçi" seçiliyken form BU adrese gider; verilmezse
   * anahtar yok (satış panosunun tek kapsamı var).
   *
   * AI modunda anahtar GİZLENİR: AI yorumu ürün süzgeci üretiyor, firma
   * dizininde karşılığı yok — açık bırakmak çalışmayan bir seçenek olurdu.
   */
  supplierScope?: { action: string; placeholder: string; label?: string };
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
  const [scope, setScope] = useState<"products" | "suppliers">("products");
  const intent = useAiSearchIntent();
  const aiActive = !!ai && aiMode;
  const supplierMode = !!supplierScope && !aiActive && scope === "suppliers";
  const targetAction = supplierMode ? (supplierScope as { action: string }).action : action;
  const targetPlaceholder = supplierMode ? (supplierScope as { placeholder: string }).placeholder : placeholder;
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
    // Anasayfadaki tavsiye şeridinin girdisi (tarayıcı-yerel, bkz.
    // `recent-searches.ts`). AI dalı yukarıda döndüğü için buraya yalnız
    // DÜZ arama düşer — AI yorumu bir arama terimi değil.
    if (term) rememberSearch(ai?.portal === "satis" ? "satis" : "satinalma", term);
    const keep = new URLSearchParams(targetAction === pathname ? (sp?.toString() ?? "") : "");
    keep.delete("q");
    keep.delete("sayfa");
    const parts = [...keep.entries()].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    if (term) parts.push(`q=${encodeURIComponent(term)}`);
    router.push(parts.length ? `${targetAction}?${parts.join("&")}` : targetAction);
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
      ? {
          glow: "var(--color-blue-200)",
          eyebrow: "text-blue-700",
          /* Başlığın İKİNCİ yarısı portal renginde (2026-09-08, kullanıcı
             tasarımı): "Ne" koyu, "arıyorsunuz?" mavi. */
          accentText: "text-blue-600",
          /* "Ara" düğmesi de portal rengine geçti (2026-09-07, kullanıcı:
             "siyah ağırlıklı yapma"). Eskiden siyahtı ve mavi bir hero'nun
             ortasında tek kara blok olarak duruyordu. */
          btn: "bg-blue-600 hover:bg-blue-700 focus-visible:outline-blue-600",
          chip: "hover:bg-blue-600",
        }
      : {
          glow: "var(--color-emerald-200)",
          eyebrow: "text-emerald-700",
          accentText: "text-emerald-700",
          // SATIŞ portalı SİYAH kalır: değişiklik yalnız satınalma için
          // istendi ve iki panelin dili ayrı kalmalı.
          btn: "bg-zinc-950 hover:bg-zinc-800 focus-visible:outline-zinc-950",
          chip: "hover:bg-zinc-950",
        };

  return (
    <section aria-label={title} className="relative isolate -mx-1 px-1 pt-2 pb-4 sm:pt-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[26rem] w-[56rem] -translate-x-1/2 rounded-full opacity-40"
        style={{ background: `radial-gradient(closest-side, ${tone.glow}, transparent)` }}
      />
      <div className="mx-auto max-w-2xl text-center">
        {eyebrow ? (
          /* Üst etiket: BÜYÜK HARF + geniş harf aralığı, iki yanında ince
             çizgi (kullanıcı tasarımı). */
          <p className={`flex items-center justify-center gap-3 text-[11px] font-semibold tracking-[0.2em] uppercase ${tone.eyebrow}`}>
            <span aria-hidden className="h-px w-8 bg-current opacity-40" />
            {eyebrow}
            <span aria-hidden className="h-px w-8 bg-current opacity-40" />
          </p>
        ) : null}
        {/* Sayfanın TEK h1'i (2026-09-07): panel anasayfalarının başlık
            şeridi kalktı, hero başlığı sayfanın adı oldu — h2 kalsaydı iki
            anasayfa da h1'siz gezinirdi (ekran okuyucu "sayfa başlığı"
            atlar). Hero yalnız bu iki sayfada kullanılıyor. */}
        {/* İKİ TONLU BAŞLIK: ilk sözcük koyu, kalanı portal renginde. Tek
            `<h1>` — ekran okuyucu için metin bölünmemiş olur. */}
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-balance text-zinc-950 sm:text-5xl">
          {(() => {
            const i = title.indexOf(" ");
            if (i < 0) return title;
            return (
              <>
                {title.slice(0, i)}{" "}
                <span className={tone.accentText}>{title.slice(i + 1)}</span>
              </>
            );
          })()}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base/7 text-pretty text-zinc-500">{lead}</p>

        {ai ? (
          <div className="mt-7 flex items-center justify-center gap-2 text-sm">
            {/* Mod anahtarı (kullanıcı tasarımı): seçili taraf BEYAZ hap +
                gölge, ikonlu; seçili olmayan sessiz gri. */}
            <div role="group" aria-label="Arama modu" className="inline-flex rounded-full bg-zinc-100/80 p-1">
              <button
                type="button"
                aria-pressed={!aiMode}
                onClick={() => setAiMode(false)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold transition ${
                  !aiMode ? `bg-white shadow-sm ${tone.accentText}` : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <MagnifyingGlassIcon aria-hidden className="size-4" />
                Ara
              </button>
              <button
                type="button"
                aria-pressed={aiMode}
                disabled={!ai.enabled}
                title={ai.enabled ? undefined : "Silver ve üzeri paketlerde"}
                onClick={() => ai.enabled && setAiMode(true)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  aiMode ? `bg-white shadow-sm ${tone.accentText}` : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <SparklesIcon aria-hidden className="size-4" />
                AI ile ara
              </button>
            </div>
            {/* KAPSAM ANAHTARI — "Ürün | Tedarikçi" (kaynak kalıp): aynı
                kutu iki dizine gider. AI modunda çizilmez (AI yorumu ürün
                süzgeci üretir). */}
            {supplierScope && !aiActive ? (
              <div role="group" aria-label="Arama kapsamı" className="inline-flex rounded-full bg-zinc-100/80 p-1">
                <button
                  type="button"
                  aria-pressed={scope === "products"}
                  onClick={() => setScope("products")}
                  className={`rounded-full px-4 py-2 font-semibold transition ${
                    scope === "products" ? `bg-white shadow-sm ${tone.accentText}` : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  Ürün
                </button>
                <button
                  type="button"
                  aria-pressed={scope === "suppliers"}
                  onClick={() => setScope("suppliers")}
                  className={`rounded-full px-4 py-2 font-semibold transition ${
                    scope === "suppliers" ? `bg-white shadow-sm ${tone.accentText}` : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  {supplierScope.label ?? "Tedarikçi"}
                </button>
              </div>
            ) : null}
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
          action={targetAction}
          method="get"
          role="search"
          onSubmit={onSubmit}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
          }}
          className={ai ? "relative mt-4" : "relative mt-7"}
        >
          {/* ARAMA ÇUBUĞU (kullanıcı tasarımı): tek beyaz hap — solda
              büyüteç, ortada alan, SAĞDA çubuğun İÇİNDE portal renginde
              "Ara →" düğmesi. Eskiden düğme çubuğun dışında ayrı bir
              blok olarak duruyordu; tasarımda tek parça okunuyor.
              "Filtrele" düğmesi BASILMADI (kullanıcı: gerek yok) —
              süzgeçler sonuç sayfasının kenar rayında yaşıyor. */}
          <div
            className={`relative flex bg-white p-2 shadow-xl shadow-zinc-950/5 ring-1 ring-inset transition focus-within:ring-2 ${
              aiActive
                ? "items-end rounded-3xl ring-blue-200 focus-within:ring-blue-500"
                : "items-center rounded-full ring-zinc-950/10 focus-within:ring-blue-500"
            }`}
          >
            {aiActive ? (
              <SparklesIcon aria-hidden className="pointer-events-none absolute top-5 left-5 size-5 text-blue-600" />
            ) : (
              <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute left-5 size-5 text-zinc-400" />
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
                className="min-h-14 w-full flex-1 resize-none bg-transparent py-3 pr-3 pl-11 text-base text-zinc-950 outline-none placeholder:text-zinc-400"
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
                placeholder={targetPlaceholder}
                aria-label={title}
                autoComplete="off"
                className="h-12 w-full flex-1 bg-transparent pr-3 pl-11 text-base text-zinc-950 outline-none placeholder:text-zinc-400"
              />
            )}
            <button
              type="submit"
              disabled={aiActive && intent.isPending}
              className={`inline-flex h-12 shrink-0 items-center gap-2 rounded-full px-6 text-sm font-semibold text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 ${tone.btn}`}
            >
              {aiActive ? (intent.isPending ? "Yorumlanıyor…" : "AI ile bul") : "Ara"}
              {!aiActive ? <ArrowRightIcon aria-hidden className="size-4" /> : null}
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
                className={`inline-flex max-w-[15rem] items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-700 transition hover:text-white ${tone.chip}`}
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
