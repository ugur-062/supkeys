"use client";

import { useAiSearchIntent } from "@/hooks/use-ai-search-intent";
import { extractErrorMessage } from "@/lib/tenders/error";
import type { AiSearchIntentResult, AiSearchPortal } from "@rothern/shared";
import { ArrowRightIcon, MagnifyingGlassIcon, SparklesIcon } from "@heroicons/react/20/solid";
import { BuildingOffice2Icon, CubeIcon } from "@heroicons/react/24/outline";
import { categoryVisual } from "@/lib/public/category-visual";
import Image from "next/image";
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
  titleAccent,
  lead,
  placeholder,
  action,
  chips = [],
  chipsLabel = "Popüler",
  ctaNote,
  backdrop = false,
  backdropSrc = "/hero/hero-scene.webp",
  accent = "blue",
  suggestions = [],
  onQueryChange,
  ai,
  supplierScope,
}: {
  eyebrow?: string;
  title: string;
  /**
   * Başlığın PORTAL RENGİNDEKİ ikinci satırı (kullanıcı tasarımı):
   * "Daha güçlü iş bağlantıları" + "daha büyük fırsatlar". Verilmezse eski
   * davranış: ilk sözcük koyu, kalanı renkli.
   */
  titleAccent?: string;
  lead: string;
  placeholder: string;
  /** Sonuç sayfası — `?q=` okuyan liste. */
  action: string;
  chips?: PanelHeroChip[];
  chipsLabel?: string;
  /**
   * Arama çubuğunun ALTINDAKİ küçük çıkış (2026-09-08, kullanıcı kararı):
   * "Aradığınız ürünü bulamadınız mı? → Talep aç". Sayı bandının yerine
   * geçti: sayılar bilgi veriyordu ama bir sonraki adımı söylemiyordu.
   */
  ctaNote?: { text: string; label: string; href: string };
  /**
   * DEKORATİF ARKA PLAN KATMANLARI (2026-09-08, kullanıcı varlıkları):
   * dünya haritası + depo + gemi + uçak. Yalnız görsel; içerik ve yapı
   * değişmez. Verilmezse hero eski sade zemininde kalır (satış portalı).
   */
  backdrop?: boolean;
  /** Arka plan sahnesi — verilmezse satınalma sahnesi. */
  backdropSrc?: string;
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
          /* "AI ile ara" — birincil eylemin YUMUŞAK karşılığı; çubuğun
             içinde "Ara"yla yarışmasın diye dolgusuz/soluk ton. */
          soft: "bg-blue-50 text-blue-700 hover:bg-blue-100",
          softOn: "bg-blue-100 text-blue-800",
        }
      : {
          glow: "var(--color-emerald-200)",
          eyebrow: "text-emerald-700",
          accentText: "text-emerald-700",
          // SATIŞ portalı SİYAH kalır: değişiklik yalnız satınalma için
          // istendi ve iki panelin dili ayrı kalmalı.
          btn: "bg-zinc-950 hover:bg-zinc-800 focus-visible:outline-zinc-950",
          chip: "hover:bg-zinc-950",
          soft: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
          softOn: "bg-emerald-100 text-emerald-800",
        };

  return (
    <section
      aria-label={title}
      /* BACKDROP modunda hero bir BANT: panel kenar boşluğunu negatif
         marjla iptal eder (tam genişlik), kendi boşluğunu geri verir ve
         gerçek bir yükseklik alır — köşe görselleri ancak böyle "sahne"
         kurar. `overflow-hidden` yatay kaydırmayı keser. Sade modda
         (satış) eski kompakt hero. */
      className={
        backdrop
          /* `-mt-6 lg:-mt-8`: kabuğun içerik sarmalayıcısı `py-6 lg:py-8`
             taşıyor; bant onu da iptal eder ki fotoğraf üst çubuğun HEMEN
             ALTINDA başlasın (kullanıcı: "arada boşluk olmasın"). */
          ? "relative isolate -mt-6 w-[100cqw] max-w-none ml-[calc(50%-50cqw)] overflow-hidden bg-gradient-to-b from-transparent via-transparent to-white px-4 pt-10 pb-10 sm:px-6 lg:-mt-8 lg:px-8 xl:px-10"
          : "relative isolate -mx-1 px-1 pt-2 pb-4 sm:pt-6"
      }
    >
      {/* ARKA PLAN — yumuşak renk yayılımı + ince nokta deseni. STOK
          FOTOĞRAF YOK: kaynak tasarımdaki depo/harita görseli lisanslı bir
          varlık gerektirir; desen CSS ile üretiliyor, repoya yeni bir dosya
          ve lisans borcu girmiyor. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[26rem] w-[56rem] -translate-x-1/2 rounded-full opacity-40"
        style={{ background: `radial-gradient(closest-side, ${tone.glow}, transparent)` }}
      />
      {backdrop ? (
        /* TEK SAHNE (2026-09-08, kullanıcı: "fotoğrafı hiç güzel
           yerleştirememişsin; altta beyaza gitsin, daha net olsun").

           Dört ayrı kesit (depo/gemi/uçak/harita) köşelere yapıştırılmış
           gibi duruyordu. Kaynak setteki `hero-background-clean` ZATEN tek
           doğal kompozisyon — onu tam genişlikte tek katman olarak
           kullanıyoruz; kaynağın üst/alt kenarındaki gürültü şeridi
           kırpıldı (`hero-scene.webp`).

           ALTA DOĞRU BEYAZA ERİR: maske alt %35'te saydama iner, bant zemini
           beyaz olduğu için fotoğraf kesilmiş gibi bitmez. Üstte de ince bir
           erime var — kabuk çubuğuyla arasında sert çizgi kalmasın.

           `pointer-events-none` + `-z-10` + `aria-hidden`: dekoratif. */
        <>
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 select-none">
            {/* DÜZ `<img>` — `next/image` DEĞİL (2026-09-08, canlıda ölçüldü):
                optimizasyon ucu bu dosya için `Content-Disposition:
                attachment` ile dönüyor ve tarayıcı isteği `ERR_ABORTED` ile
                düşürüyordu; görsel hiç boyanmıyordu. Dekoratif bir zemin
                için optimizasyona ihtiyaç da yok: dosya zaten webp ve 360 KB,
                tek boyutta kullanılıyor. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={backdropSrc}
              alt=""
              loading="eager"
              decoding="async"
              draggable={false}
              className="absolute inset-0 size-full object-cover object-bottom"
              /* DÖRT KENARDAN ERİME (2026-09-08, kullanıcı: "çizgi çekilmiş
                 gibi duruyor"). Tek yönlü maske yalnız altı yumuşatıyordu;
                 sol/sağ/üst kenarlar bandın sınırında sert kesiliyordu.
                 İki gradyan KESİŞTİRİLİYOR (`mask-composite: intersect`,
                 WebKit'te `source-in`): dikeyde üst %10 ve alt %30, yatayda
                 iki uçta %12 saydama iner. */
              style={{
                maskImage:
                  "linear-gradient(to bottom, black 0%, black 70%, transparent 100%), linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, black 0%, black 70%, transparent 100%), linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
                /* NETLİK (kullanıcı: "çok silik ve blurlu"): kaynak görsel
                   yumuşak bir kompozisyon; hafif kontrast/doygunluk artışı
                   onu keskinleştirir — filtre görselin KENDİSİNE uygulanır,
                   metne dokunmaz. */
                filter: "contrast(1.12) saturate(1.12) brightness(1.01)",
                maskComposite: "intersect",
                WebkitMaskComposite: "source-in",
              }}
            />
          </div>
          {/* Metin sütununun arkasında HAFİF beyaz peçe — sahne zaten açık,
              peçe yalnız kontrastı garantiler. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-[5] mx-auto h-[22rem] w-[min(60rem,94%)]"
            style={{
              background:
                "radial-gradient(52% 54% at 50% 38%, rgb(255 255 255 / 0.5) 35%, rgb(255 255 255 / 0.22) 70%, transparent 100%)",
            }}
          />
        </>
      ) : (
        /* Görsel verilmediğinde (satış portalı) eski sade doku. */
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 opacity-[0.18]"
          style={{
            backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
            backgroundSize: "18px 18px",
            color: "var(--color-blue-400)",
            maskImage: "radial-gradient(60% 80% at 50% 20%, black, transparent)",
            WebkitMaskImage: "radial-gradient(60% 80% at 50% 20%, black, transparent)",
          }}
        />
      )}

      <div className={backdrop ? "mx-auto max-w-4xl text-center" : "mx-auto max-w-2xl text-center"}>
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
          {titleAccent ? (
            <>
              {/* İlk sözcük koyu, kalanı renkli; ikinci satır tamamen renkli
                  (kaynak tasarım: "Hangi talebe / teklif vereceksiniz?"). */}
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
              <span className={`block ${tone.accentText}`}>{titleAccent}</span>
            </>
          ) : (
            (() => {
              const i = title.indexOf(" ");
              if (i < 0) return title;
              return (
                <>
                  {title.slice(0, i)}{" "}
                  <span className={tone.accentText}>{title.slice(i + 1)}</span>
                </>
              );
            })()
          )}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base/7 text-pretty text-zinc-500">{lead}</p>

        {ai ? (
          <div className="mt-7 flex items-center justify-center gap-2 text-sm">
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
          {/* KAPSAM PİLLERİ — çubuğun ÜSTÜNDE (kullanıcı tasarımı,
              2026-09-08 ikinci tur): seçili taraf mavi dolgu, diğeri sessiz
              beyaz. Açılır seçici yerine pil: iki seçenek var, tıklaması bir
              adım kısa ve hangisinin seçili olduğu bakışta okunuyor. */}
          {supplierScope && !aiActive ? (
            <div
              role="group"
              aria-label="Arama kapsamı"
              className="mx-auto mb-3 inline-flex rounded-full bg-white/70 p-1 shadow-sm ring-1 ring-zinc-950/5 backdrop-blur"
            >
              <button
                type="button"
                aria-pressed={scope === "products"}
                onClick={() => setScope("products")}
                className={`inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition ${
                  scope === "products" ? `${tone.btn} text-white shadow-sm` : "text-zinc-700 hover:text-zinc-950"
                }`}
              >
                <CubeIcon aria-hidden className="size-5" />
                Ürün
              </button>
              <button
                type="button"
                aria-pressed={scope === "suppliers"}
                onClick={() => setScope("suppliers")}
                className={`inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition ${
                  scope === "suppliers" ? `${tone.btn} text-white shadow-sm` : "text-zinc-700 hover:text-zinc-950"
                }`}
              >
                <BuildingOffice2Icon aria-hidden className="size-5" />
                {supplierScope.label ?? "Tedarikçi"}
              </button>
            </div>
          ) : null}

          {/* ARAMA ÇUBUĞU: tek beyaz hap — solda büyüteç, ortada alan, sağda
              "AI ile ara" (açık mavi) ve "Ara →" (dolu mavi). İkisi de
              ÇUBUĞUN İÇİNDE (kullanıcı tasarımı). */}
          <div
            className={`relative mx-auto flex bg-white p-2 shadow-xl shadow-zinc-950/5 ring-1 ring-inset transition focus-within:ring-2 ${
              aiActive
                ? `items-end rounded-3xl ${accent === "blue" ? "ring-blue-200 focus-within:ring-blue-500" : "ring-emerald-200 focus-within:ring-emerald-500"}`
                : `items-center rounded-full ring-zinc-950/10 ${accent === "blue" ? "focus-within:ring-blue-500" : "focus-within:ring-emerald-500"}`
            }`}
          >
            {aiActive ? (
              <SparklesIcon aria-hidden className={`pointer-events-none absolute top-5 left-5 size-5 ${tone.accentText}`} />
            ) : null}
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
              <span className="relative flex min-w-[8rem] flex-1 items-center">
                <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute left-4 size-5 text-zinc-400" />
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
                  className="h-12 w-full bg-transparent pr-3 pl-12 text-base text-zinc-950 outline-none placeholder:text-zinc-400"
                />
              </span>
            )}
            {ai ? (
              <>
                <span aria-hidden className="my-2 hidden w-px bg-zinc-200 sm:block" />
                <button
                  type="button"
                  aria-pressed={aiActive}
                  disabled={!ai.enabled}
                  title={ai.enabled ? undefined : "Silver ve üzeri paketlerde"}
                  onClick={() => ai.enabled && setAiMode(!aiMode)}
                  className={`mx-1 hidden h-12 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex ${
                    aiActive ? tone.softOn : tone.soft
                  }`}
                >
                  <SparklesIcon aria-hidden className="size-5" />
                  {aiActive ? "Aramaya dön" : "AI ile ara"}
                </button>
              </>
            ) : null}
            <button
              type="submit"
              disabled={aiActive && intent.isPending}
              className={`inline-flex h-12 shrink-0 items-center gap-2 rounded-full px-7 text-sm font-semibold text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 ${tone.btn}`}
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

        {/* SEKTÖR KISAYOLLARI — ikonlu karolar (kaynak tasarım). İkon
            segmentin kendi görsel eşlemesinden (`categoryVisual`), sayı
            gerçek envanterden; sayısı 0 olan dal çağıran tarafından hiç
            gönderilmez. */}
        {/* KÜÇÜK ÇIKIŞ — "bulamadıysan talep aç". Sayfanın birincil CTA'sı
            sol menüde; bu ikincil ve cümle içinde, hero'yu şişirmiyor. */}
        {ctaNote ? (
          <p className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm text-zinc-600">
            {ctaNote.text}
            <Link
              href={ctaNote.href}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white transition ${tone.btn}`}
            >
              {ctaNote.label}
              <ArrowRightIcon aria-hidden className="size-4" />
            </Link>
          </p>
        ) : null}

        {chips.length > 0 ? (
          <nav
            aria-label={chipsLabel}
            className="mx-auto mt-8 grid max-w-5xl grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9"
          >
            {chips.slice(0, 9).map((c) => {
              const Icon = categoryVisual([c.id]).icon;
              return (
                <Link
                  key={c.id}
                  href={c.href}
                  className="flex flex-col items-center gap-1.5 rounded-xl bg-white/90 px-2 py-3 text-center shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <Icon aria-hidden className="size-5 text-blue-600" />
                  <span className="line-clamp-2 text-[11px]/4 font-medium text-zinc-700">{c.name}</span>
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>

    </section>
  );
}
