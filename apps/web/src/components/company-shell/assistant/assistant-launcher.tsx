"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import {
  hasAnySeatPermission,
  hasBuySeatPermission,
  hasSellSeatPermission,
} from "@/lib/company/permissions";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { cn } from "@/lib/utils";
import { useButtonAccent } from "@/components/ui/button-accent";
import { BUYING_TIER, tierAtLeast } from "@rothern/shared";
import { Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

/**
 * Perf turu (denetim P10 Dalga B): launcher firma kabuğunda, yani HER
 * kimlikli sayfada mount ediliyor; panel içeriği yalnız açılınca render
 * ediliyordu ama import STATİKTİ → sohbet paneli, markdown/araç izleri ve
 * bağımlılıkları hiç açılmasa da her sayfanın ilk yükünde geliyordu.
 */
const AssistantPanel = dynamic(
  () => import("./assistant-panel").then((m) => m.AssistantPanel),
  { ssr: false },
);

/** Karşılama balonu oturumda BİR KEZ gösterilir (sayfa geçişlerinde tekrar
 *  çıkıp rahatsız etmesin); ~6sn sonra kendiliğinden kaybolur (Faz 8.2:
 *  12sn'lik balon sağ-alt KPI kartının hover/tıklamasını uzun süre
 *  yutuyordu — süre kısaldı, kapatma X'i zaten var). */
const GREET_SEEN_KEY = "ai-assistant-greeted";
const GREET_HIDE_MS = 6_000;

/**
 * YAPIŞKAN ALT ÇUBUKLAR (arayüz testi Y-01): mobil teklif formu, hızlı talep
 * ve profil kaydet çubuğu ekranın altına `fixed inset-x-0 bottom-0` ile
 * yapışır; yuvarlak düğme bunların birincil düğmesini (Teklif Gönder /
 * Yayınla) örtüyordu. Düğme, görünür bir alt çubuk varsa onun ÜSTÜNE kalkar.
 * Çubuğu çizen sayfalara dokunmadan algılanır; yeni çubuklar açıkça
 * `data-sticky-cta` ile de işaretlenebilir.
 */
const BOTTOM_BAR_SELECTOR = ".fixed.inset-x-0.bottom-0, [data-sticky-cta]";
/** Çubuk ile düğme arasındaki boşluk (px). */
const BAR_GAP_PX = 16;
/** Karşılama balonu düğmenin üstünde durur (düğme 56px + boşluk). */
const GREET_ABOVE_FAB_PX = 80;

/**
 * Karşılama balonunun KENDİLİĞİNDEN açılmadığı sayfalar (arayüz testi D-099,
 * Y-07): form ve yazışma ekranlarında balon ~6sn boyunca sağ raydaki
 * satırları ya da Gönder düğmesini örtüyordu. Düğme yine görünür.
 */
const QUIET_ROUTE = /\/(yeni|duzenle|teklif-ver|mesajlar)(\/|$)/;
/** lg kırılımı — altında balon kendiliğinden açılmaz (dar ekran). */
const WIDE_MIN_PX = 1024;

/** Görünür alt çubukların ekran altından kapladığı en büyük yükseklik (px). */
function useBottomBarHeight(enabled: boolean): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let observed: Element[] = [];
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => schedule())
        : null;
    const measure = () => {
      raf = 0;
      const bars = Array.from(
        document.querySelectorAll<HTMLElement>(BOTTOM_BAR_SELECTOR),
      );
      let max = 0;
      for (const el of bars) {
        const r = el.getBoundingClientRect();
        // lg:hidden çubuk masaüstünde 0 boyutludur; ekran altına yapışmayan
        // öğe çubuk sayılmaz.
        if (r.width <= 0 || r.height <= 0) continue;
        if (r.bottom < window.innerHeight - 2) continue;
        max = Math.max(max, window.innerHeight - r.top);
      }
      setHeight(Math.round(max));
      // Yalnız çubuk kümesi değişince yeniden gözlenir (observe ilk geri
      // çağrıyı tetikler; her ölçümde yeniden bağlamak döngü kurardı).
      if (
        ro &&
        (bars.length !== observed.length || bars.some((b, i) => b !== observed[i]))
      ) {
        ro.disconnect();
        bars.forEach((b) => ro.observe(b));
        observed = bars;
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      mo.disconnect();
      ro?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [enabled]);
  return enabled ? height : 0;
}

/**
 * Faz AI-2 — sağ-alt floating launcher + sağdan slide-over asistan paneli.
 * Yalnız Silver+ ∧ SA/ST kullanıcıda görünür (AI-0 erişim kapısıyla aynı; asıl
 * güvenlik backend'de — bu UX katmanı). Panel açık değilken içerik mount edilmez.
 */
export function AssistantLauncher() {
  const t = useTranslations("web.panel.shell.assistantLauncher");
  const accent = useButtonAccent();
  const { user, company } = useCompanyAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // §4.4: genişletme seçeneği — dar sohbet / geniş okuma.
  const [wide, setWide] = useState(false);
  const [greet, setGreet] = useState(false);
  // Faz 8.2 — FAB scroll'da küçülür: grafik/tablo son kolonuna daha az biner.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 160);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const eligible =
    !!user &&
    !!company &&
    tierAtLeast(company.tier, "SILVER") &&
    hasAnySeatPermission(user);
  const barHeight = useBottomBarHeight(eligible);
  const barHeightRef = useRef(barHeight);
  useEffect(() => {
    barHeightRef.current = barHeight;
  }, [barHeight]);
  // Karşılama metni role ve pakete göre (arayüz testi O-054/D-099): satın
  // alma talebi açmayı yalnız alım koltuğu + satınalma paketi (GOLD) olan
  // kullanıcıya vaat eder; asistan panelindeki kapıyla aynı türetme.
  const canBuy =
    !!company &&
    hasBuySeatPermission(user) &&
    tierAtLeast(company.tier, BUYING_TIER);
  const canSell = hasSellSeatPermission(user);
  const quietRoute = QUIET_ROUTE.test(pathname ?? "");

  // İlk girişte karşılama balonu — kısa gecikmeyle belirir, 6sn sonra gider.
  // "Görüldü" işareti balon fiilen GÖSTERİLİNCE yazılır (StrictMode'un çift
  // effect koşusu balonu hiç göstermeden işaretlemesin). Dar ekranda, form/
  // yazışma sayfasında ya da yapışkan alt çubuk varken balon AÇILMAZ ve
  // işaret yazılmaz — kullanıcı uygun bir sayfaya geçince gösterilir.
  useEffect(() => {
    if (!eligible || quietRoute) return;
    try {
      if (sessionStorage.getItem(GREET_SEEN_KEY)) return;
    } catch {
      return;
    }
    let hide: ReturnType<typeof setTimeout> | undefined;
    const show = setTimeout(() => {
      if (window.innerWidth < WIDE_MIN_PX || barHeightRef.current > 0) return;
      try {
        sessionStorage.setItem(GREET_SEEN_KEY, "1");
      } catch {
        /* depolama kapalı — balon yine bir kez gösterilir */
      }
      setGreet(true);
      hide = setTimeout(() => setGreet(false), GREET_HIDE_MS);
    }, 800);
    return () => {
      clearTimeout(show);
      if (hide) clearTimeout(hide);
    };
  }, [eligible, quietRoute]);

  // Sessiz sayfaya geçilince açık balon kapanır.
  useEffect(() => {
    if (quietRoute || barHeight > 0) setGreet(false);
  }, [quietRoute, barHeight]);

  // Escape ile kapat — modal olmadığı için Headless'ın kapatma davranışı yok.
  // Arayüz testi D-359: asistan açıkken bir diyalogda (Şikayet Et vb.)
  // Escape yalnız diyaloğu kapatmalı. Açık bir modal varsa ya da olay başka
  // bir bileşen tarafından işlenmişse (menü/liste kapatma) panel kapanmaz.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (
        document.querySelector(
          '[role="dialog"][aria-modal="true"], [role="alertdialog"]',
        )
      ) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!eligible) return null;

  const openPanel = () => {
    setGreet(false);
    setOpen(true);
  };

  return (
    <>
      {/* Karşılama balonu — tıklayınca panel açılır. C58/C8: yalnız görünürken
          MOUNT edilir — gizliyken DOM'da odaklanabilir görünmez butonlar
          bırakıyordu ve viewport sağ-altındaki tıklamaları yutabiliyordu. */}
      {greet && !open ? (
        <div
          className="fixed bottom-24 right-5 z-40 max-w-[260px]"
          style={
            barHeight > 0
              ? { bottom: barHeight + BAR_GAP_PX + GREET_ABOVE_FAB_PX }
              : undefined
          }
        >
          <div className="relative rounded-2xl rounded-br-sm border border-brand-200 bg-white p-3.5 shadow-xl shadow-brand-900/10">
            <button
              type="button"
              aria-label={t("karsilamaMesajiniKapat")}
              onClick={() => setGreet(false)}
              className="absolute right-2 top-2 text-zinc-300 hover:text-zinc-500"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={openPanel}
              aria-label={t("asistanPaneliniAc")}
              className="text-left"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-brand-700">
                <Sparkles className="h-4 w-4" /> {t("rothernAsistani")}
              </p>
              <p className="mt-1 pr-3 text-sm text-zinc-600">
                {user.firstName ? t("merhaba", { firstName: user.firstName }) : t("merhaba2")}{" "}
                {canBuy
                  ? t("yardimMetni")
                  : canSell
                    ? t("yardimMetniSatis")
                    : t("yardimMetniGenel")}
              </p>
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        aria-label={t("aiAsistan")}
        onClick={openPanel}
        // Y-01: yapışkan alt çubuk varken düğme çubuğun üstüne kalkar.
        style={barHeight > 0 ? { bottom: barHeight + BAR_GAP_PX } : undefined}
        className={cn(
          "group fixed z-40 flex items-center justify-center rounded-full",
          // Portal rengi (2026-09-17): siyah yuvarlak düğme istenmiyor —
          // satınalmada mavi, satışta emerald (ButtonAccent ile aynı kaynak).
          accent === "blue"
            ? "bg-gradient-to-br from-blue-500 to-blue-700"
            : accent === "emerald"
              ? "bg-gradient-to-br from-emerald-500 to-emerald-700"
              : "bg-gradient-to-br from-brand-500 to-brand-700",
          "text-white shadow-lg ring-1 ring-white/20",
          "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl",
          // Faz 8.2: scroll'da küçülüp köşeye yaklaşır — tablo son kolonunu
          // daha az kapatır (içerikte pb-24 nefes payı zaten var). B3: küçük
          // modda yarı saydam — geniş tablonun sağ kenarı okunur kalır.
          // KENAR PAYI = HALKA YAYILIMI (2026-09-07): `animate-ping` öğeyi
          // 2 katına büyütür, yani buton yarıçapı kadar dışarı taşar (56 px
          // butonda 28 px). Pay daha küçükken halka görünür alanı aşıyor ve
          // SİTENİN TAMAMINDA yatay kaydırma çubuğu çıkıyordu (kullanıcı
          // bulgusu). Pay halka yayılımından büyük tutulur.
          compact
            ? "bottom-6 right-6 h-11 w-11 opacity-60 hover:opacity-100 focus-visible:opacity-100"
            : "bottom-8 right-8 h-14 w-14",
        )}
      >
        {/* Nefes alan halka — buton kapalıyken sürekli, dikkat çekmeden */}
        {!open ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 -z-10 animate-ping rounded-full [animation-duration:2.5s]",
              accent === "blue" ? "bg-blue-500/40" : accent === "emerald" ? "bg-emerald-500/40" : "bg-brand-500/40",
            )}
          />
        ) : null}
        <Sparkles
          className={cn(
            "h-6 w-6 transition-transform duration-300",
            "group-hover:rotate-12 group-hover:scale-110",
            greet ? "animate-bounce" : "",
          )}
        />
      </button>

      {/* YAN ÇEKMECE, MODAL DEĞİL (2026-09-17, kullanıcı: "asistan açıkken sol
          taraf kullanılabilir olmalı, tamamen blurlu oluyor"): arka plan
          perdesi ve odak kilidi yok; panel sağda durur, sayfa tıklanabilir.
          Kapatma: X düğmesi ya da Escape. */}
      {open ? (
        <aside
          role="complementary"
          aria-label={t("rothernAsistani")}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-screen flex-col border-l border-zinc-950/10 bg-white shadow-2xl",
            wide ? "max-w-2xl" : "max-w-md",
          )}
        >
          {/* Başlık paneldedir (markalı kimlik + aksiyonlar tek satırda) */}
          <div className="min-h-0 flex-1">
            <AssistantPanel
              onClose={() => setOpen(false)}
              wide={wide}
              onToggleWide={() => setWide((w) => !w)}
            />
          </div>
        </aside>
      ) : null}
    </>
  );
}
