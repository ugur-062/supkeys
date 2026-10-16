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
import { QueryClientContext } from "@tanstack/react-query";
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import dynamic from "next/dynamic";
import { greetingCoversControl, useFabSuppression } from "./fab-suppression";
import {
  LAUNCHER_NODE_PROPS,
  PAGE_MUTATION_OPTIONS,
  greetingZone,
  isPageMutation,
  watchPageSettle,
} from "./greeting-settle";

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
/** İlk deneme kabuk bağlandıktan bu kadar sonra (sayfa oturmadıysa oturunca). */
const GREET_FIRST_TRY_MS = 800;
/** Düğme çekilmişken ya da balonun yeri bir kontrolün üstündeyken balon bu
 *  aralıkla yeniden denenir. */
const GREET_RETRY_MS = 1_000;
/** Sayfada bu kadar beklenip açılamadıysa o sayfada vazgeçilir (ms). */
const GREET_GIVE_UP_MS = 31_000;
/** "Görüldü" balon bu kadar süre KESİNTİSİZ görünür kalınca yazılır (ms). */
const GREET_SEEN_AFTER_MS = 2_000;
/** Açık balonun altı kaydırma durunca bu kadar sonra yeniden yoklanır (ms). */
const GREET_RECHECK_MS = 160;

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
// Arayüz testi son tur S-SELL: bilgi talebi yanıt ekranında balon yanıt
// kutusunu, talep detayında kalem tablosunun HEDEF FİYAT sütununu örtüyordu
// → ikisi de sessiz (yazışma ekranı / yoğun veri tablosu).
const QUIET_ROUTE =
  /\/(yeni|duzenle|teklif-ver|mesajlar|bilgi-talepleri|bilgi-taleplerim)(\/|$)|\/ilan\/[^/]+\/?$/;
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
        // Mobil denetim g05/g08: alt çekmecenin paneli (`fixed inset-x-0
        // bottom-0 max-h-[88vh]`) çubuk sayılıyor, düğme üst çubuğun üstüne
        // zıplıyordu. Diyalog içindeki öğe çubuk DEĞİLDİR (diyalog açıkken
        // düğme zaten gizli — `fab-suppression.ts`).
        if (el.closest('[role="dialog"], [role="alertdialog"]')) continue;
        const r = el.getBoundingClientRect();
        // lg:hidden çubuk masaüstünde 0 boyutludur; ekran altına yapışmayan
        // öğe çubuk sayılmaz.
        if (r.width <= 0 || r.height <= 0) continue;
        // Ekranın yarısına yaklaşan öğe çubuk değil paneldir (diyalog dışı bir
        // alt çekmece olsa da düğme üst çubuğa zıplamasın).
        if (r.height > window.innerHeight * 0.4) continue;
        // `bottom-0` çubuk bir `space-y-*` kabının son olmayan çocuğuysa
        // margin-bottom alır ve ekran altından o kadar yukarıda durur
        // (yeniden doğrulama webC-01): alt boşluk margin ile birlikte ölçülür.
        const mb = parseFloat(window.getComputedStyle(el).marginBottom) || 0;
        if (r.bottom + mb < window.innerHeight - 2) continue;
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
  // Karşılama balonu: "probe" = yeri ölçülüyor (görünmez çizilir, altında
  // kontrol var mı bakılır), "on" = görünür.
  const [greet, setGreet] = useState<"off" | "probe" | "on">("off");
  const greetRef = useRef<HTMLDivElement>(null);
  const greetProbeRef = useRef<{ ok: () => void; fail: () => void } | null>(null);
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
  // Mobil denetim 2026-10: modal açıkken, telefonda yazarken ya da düğme
  // durduğu yerde bir kontrolün üstündeyken çekilir (`fab-suppression.ts`).
  const fabRef = useRef<HTMLButtonElement>(null);
  const { suppressed, recheck } = useFabSuppression({
    enabled: eligible,
    fabRef,
    panelOpen: open,
    // Metin kuralı yalnız sayfanın ilk görünümünde; rota değişince yeniden başlar.
    routeKey: pathname ?? "",
  });
  const barHeightRef = useRef(barHeight);
  useEffect(() => {
    barHeightRef.current = barHeight;
  }, [barHeight]);
  const suppressedRef = useRef(suppressed);
  useEffect(() => {
    suppressedRef.current = suppressed;
  }, [suppressed]);
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
  // "Görüldü" işareti balon fiilen GÖSTERİLDİKTEN sonra yazılır (StrictMode'un çift
  // effect koşusu balonu hiç göstermeden işaretlemesin). Dar ekranda, form/
  // yazışma sayfasında ya da yapışkan alt çubuk varken balon AÇILMAZ ve
  // işaret yazılmaz — kullanıcı uygun bir sayfaya geçince gösterilir (bu
  // yüzden her sayfa geçişinde yeniden denenir; kabuk sayfalar arasında
  // yeniden mount edilmez — doğrulama turu g06: masaüstü panelde düğme ilk
  // yüklemede karusel okunun üstünde çekili kalınca 30 sn'lik bekleme
  // bitiyor, balon oturum boyunca bir daha denenmiyordu).
  // Depolama yazılamasa da (kota) balon bu kabuk ömründe bir kez gösterilir.
  // Balon bir KONTROLÜN üstüne düşecekse de açılmaz (mobil denetim 2026-10,
  // üçüncü tur: 1280×800 satınalma anasayfasında "Tümünü gör" bağlantısını 6
  // sn örtüyor, tıklama asistanı açıyordu): önce görünmez çizilip altı yoklanır
  // (`greetingCoversControl`), kontrol varsa düğmenin çekilmesi gibi beklenir.
  // Düğmeyle aynı kural: küçük kontrol ve düğme her örtüşmede, kart / kategori
  // kutusu / liste satırı gibi yüzeyler görünen alanlarının %25'inden fazlası
  // örtülecekse engel (beşinci tur: yüzey hiç sayılmazken balon bir kategori
  // kutusunun %80'ini örtüyordu).
  // SAYFA OTURMADAN YOKLANMAZ (mobil denetim 2026-10, dördüncü doğrulama
  // s1-fab#v4new0): yoklama, satınalma anasayfasının şeritleri ya da Şirketim'in
  // iş listesi hâlâ iskeletken koşuyor, balon açılıp içerik altına geliyordu.
  // Önce balonun yerinde sayfa oturmalı (`watchPageSettle`: 600 ms değişiklik
  // yok, iskelet / `aria-busy` yok, süren veri isteği yok); en geç 31 sn
  // beklenir, sonra o sayfada vazgeçilir.
  // "GÖRÜLDÜ" balon 2 sn kesintisiz görününce yazılır (aynı denetim): erken
  // kapanan (altına kontrol geldi, sessiz sayfaya geçildi) balon sonraki
  // sayfada yeniden denenir. Kapatma X'i ve paneli açmak hemen yazar.
  const greetShownRef = useRef(false);
  const greetStateRef = useRef(greet);
  useEffect(() => {
    greetStateRef.current = greet;
  }, [greet]);
  const markGreetSeen = useCallback(() => {
    greetShownRef.current = true;
    try {
      sessionStorage.setItem(GREET_SEEN_KEY, "1");
    } catch {
      /* depolama kapalı — balon yine bu kabuk ömründe bir kez gösterilir */
    }
  }, []);
  const queryClient = useContext(QueryClientContext);
  useEffect(() => {
    // Balon açıkken (sayfa geçişi) yeni deneme başlamaz.
    if (!eligible || quietRoute || greetShownRef.current || greetStateRef.current !== "off") return;
    // Dar ekranda balon açılmaz (deneme de ilk koşusunda bırakırdı): sayfa
    // izleyicisi hiç kurulmaz — telefonda balon hiç "görülmediği" için her
    // sayfa geçişinde boşuna DOM gözlemi ve ölçümü olmasın.
    if (window.innerWidth < WIDE_MIN_PX) return;
    try {
      if (sessionStorage.getItem(GREET_SEEN_KEY)) return;
    } catch {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    // Deneme sayfanın oturmasını bekliyor (oturunca izleyici yeniden çağırır).
    let waiting = false;
    const stop = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      clearTimeout(giveUp);
      settle.dispose();
    };
    const later = (ms: number) => {
      if (!stopped) timer = setTimeout(tryShow, ms);
    };
    const tryShow = () => {
      timer = undefined;
      waiting = false;
      if (stopped) return;
      if (greetShownRef.current || window.innerWidth < WIDE_MIN_PX || barHeightRef.current > 0) {
        stop();
        return;
      }
      if (!settle.isSettled()) {
        waiting = true;
        return;
      }
      // Düğme o an çekilmişse (masaüstünde de bir kontrolün üstünde durabilir
      // — doğrulama turu g06) balon görünmezdi: düğme geri gelene dek beklenir.
      if (suppressedRef.current) {
        later(GREET_RETRY_MS);
        return;
      }
      // Yer yoklaması (aşağıdaki yerleşim etkisi) sonucu bildirir.
      greetProbeRef.current = {
        ok: () => {
          stop();
          setGreet("on");
        },
        fail: () => later(GREET_RETRY_MS),
      };
      setGreet("probe");
    };
    const settle = watchPageSettle({
      zone: () => greetingZone(window),
      isBusy: () => (queryClient?.isFetching() ?? 0) > 0,
      onSettled: () => {
        if (waiting) tryShow();
      },
    });
    const giveUp = setTimeout(() => {
      stop();
      greetProbeRef.current = null;
    }, GREET_GIVE_UP_MS);
    later(GREET_FIRST_TRY_MS);
    return () => {
      stop();
      greetProbeRef.current = null;
    };
  }, [eligible, quietRoute, pathname, queryClient]);

  // Yer yoklaması: balon görünmez çizildi (boyaması yok, tıklanamaz); altında
  // kontrol yoksa görünür olur, varsa kaldırılır ve sonra yeniden denenir.
  useLayoutEffect(() => {
    if (greet !== "probe") return;
    const probe = greetProbeRef.current;
    greetProbeRef.current = null;
    const el = greetRef.current;
    if (probe && el && !greetingCoversControl(el, fabRef.current)) {
      probe.ok();
      return;
    }
    setGreet("off");
    probe?.fail();
  }, [greet]);

  // Balon YENİDEN görünür olunca (düğme çekilip geri geldi) yeri yeniden
  // yoklanır; bir kontrolün üstüne düşecekse açılmaz, kapanır (mobil denetim
  // 2026-10, beşinci tur: 1280×800 Şirketim'de düğme kaydırmayla çekilip
  // sayfa sonunda geri gelince balon "Davetli Ekle" bağlantılarının üstünde
  // yeniden belirdi — aşağıdaki kaydırma yoklaması o an balon çizili olmadığı
  // için hiçbir şey ölçmemişti). Yerleşim etkisi: balon kontrolün üstünde bir
  // kare bile boyanmaz. Yer yoklamasının hemen ardından gelen "açıldı" çizimi
  // aynı yerde zaten ölçüldü, yeniden ölçülmez.
  const greetVisible = greet === "on" && !open && !suppressed;
  const greetCommitRef = useRef<{ visible: boolean; greet: typeof greet }>({ visible: false, greet: "off" });
  useLayoutEffect(() => {
    const last = greetCommitRef.current;
    greetCommitRef.current = { visible: greetVisible, greet };
    if (!greetVisible || last.visible || last.greet === "probe") return;
    const el = greetRef.current;
    if (el && greetingCoversControl(el, fabRef.current)) setGreet("off");
  }, [greetVisible, greet]);

  // Balon 2 sn KESİNTİSİZ görününce "görüldü" (yukarıda).
  useEffect(() => {
    if (!greetVisible || greetShownRef.current) return;
    const seen = setTimeout(markGreetSeen, GREET_SEEN_AFTER_MS);
    return () => clearTimeout(seen);
  }, [greetVisible, markGreetSeen]);

  // Açık balonun altına sayfa kaydırılınca, boyut ya da sayfa içeriği
  // değişince bir kontrol gelirse balon kapanır — örtülü bağlantı 6 sn
  // tıklanamaz kalmasın. İçerik / boyut değişiminde yoklama BİR SONRAKİ
  // KAREDE ve kapanış o kare boyanmadan (`flushSync`): eskiden her değişiklik
  // 160 ms'lik bekleyişi yeniden başlatıyor, akan içerik balonu 1 sn'ye dek
  // yeni kontrollerin üstünde tutuyordu (dördüncü doğrulama s1-fab#v4new0).
  // Kaydırmada yoklama kaydırma durunca (her karede ızgara yoklaması pahalı).
  useEffect(() => {
    if (greet !== "on") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;
    const check = () => {
      raf = 0;
      const el = greetRef.current;
      if (el && greetingCoversControl(el, fabRef.current)) flushSync(() => setGreet("off"));
    };
    const nextFrame = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    const afterScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(nextFrame, GREET_RECHECK_MS);
    };
    document.addEventListener("scroll", afterScroll, { capture: true, passive: true });
    window.addEventListener("resize", nextFrame);
    // DOM değişmeden kayan yerleşim (görsel yüklenince uzayan sayfa) ya da
    // sonradan gelen içerik de balonun altına bir kontrol getirebilir.
    const mo = new MutationObserver((records) => {
      if (records.some(isPageMutation)) nextFrame();
    });
    mo.observe(document.body, PAGE_MUTATION_OPTIONS);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(nextFrame) : null;
    ro?.observe(document.body);
    return () => {
      if (timer) clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
      mo.disconnect();
      ro?.disconnect();
      document.removeEventListener("scroll", afterScroll, { capture: true });
      window.removeEventListener("resize", nextFrame);
    };
  }, [greet]);

  // Açılan balon 6 sn sonra kendiliğinden kapanır. Ayrı effect: sayfa geçişi
  // yukarıdaki effect'i yeniden koşturunca süre iptal olup balon açık
  // kalmasın.
  useEffect(() => {
    if (greet !== "on") return;
    const hide = setTimeout(() => setGreet("off"), GREET_HIDE_MS);
    return () => clearTimeout(hide);
  }, [greet]);

  // Sessiz sayfaya geçilince açık balon kapanır.
  useEffect(() => {
    if (quietRoute || barHeight > 0) setGreet("off");
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

  // Kullanıcı asistanı açtı: karşılamaya gerek kalmadı.
  const openPanel = () => {
    markGreetSeen();
    setGreet("off");
    setOpen(true);
  };
  const dismissGreeting = () => {
    markGreetSeen();
    setGreet("off");
  };

  return (
    <>
      {/* Karşılama balonu — tıklayınca panel açılır. C58/C8: yalnız görünürken
          MOUNT edilir — gizliyken DOM'da odaklanabilir görünmez butonlar
          bırakıyordu ve viewport sağ-altındaki tıklamaları yutabiliyordu. */}
      {greet !== "off" && !open && !suppressed ? (
        <div
          ref={greetRef}
          {...LAUNCHER_NODE_PROPS}
          // Yoklanırken görünmez: boyanmaz, tıklanamaz, odak almaz.
          aria-hidden={greet === "probe" ? true : undefined}
          // Güvenli alan: düğme gibi ana ekran çizgisi / yatay çentik payı kadar
          // içeride (alt çubuk varken konum çubuğun ölçüsünden gelir, o pay içerir).
          className={cn(
            "fixed bottom-24 right-5 z-40 mr-(--safe-right) max-w-[260px]",
            barHeight > 0 ? "" : "mb-(--safe-bottom)",
            greet === "probe" && "invisible",
          )}
          style={
            barHeight > 0
              ? { bottom: barHeight + BAR_GAP_PX + GREET_ABOVE_FAB_PX }
              : undefined
          }
        >
          <div className="relative rounded-2xl rounded-br-sm border border-brand-200 bg-white p-3.5 shadow-xl shadow-brand-900/10">
            {/* Kapatma alanı 28 px (simge 14 px'ti; mobil denetim 2026-10 ≥24 px). */}
            <button
              type="button"
              aria-label={t("karsilamaMesajiniKapat")}
              onClick={dismissGreeting}
              className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-700"
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
        ref={fabRef}
        {...LAUNCHER_NODE_PROPS}
        type="button"
        aria-label={t("aiAsistan")}
        // Neden çekildiği (test ve arayüz denetimi için; çekilmemişse yok).
        data-suppressed={suppressed ?? undefined}
        onClick={openPanel}
        // Konum geçişi (alt çubuğa kalkma) bitince örtüşme yeniden ölçülür.
        onTransitionEnd={recheck}
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
          // TELEFON (mobil denetim 2026-10, sm altı): düğme küçük (44 px) ve
          // köşeye yakın (12 px); halka orada çizilmez (pay yayılımdan küçük).
          // sm ve üstü yukarıdaki gibi — o geometriyi kaynaktan okuyan testler
          // var (`listing-email-invites.test` N6), bu yüzden telefon sınıfları
          // `max-sm:` ile ayrı yazılır.
          "max-sm:bottom-3 max-sm:right-3 max-sm:size-11",
          // GÜVENLİ ALAN (her genişlikte): ana ekran çizgisi / yatay çentik
          // payı `mb`/`mr` ile eklenir (sabit konumlu öğeyi o kadar içeri
          // iter; `bottom-*` sınıfları ve N6 geometrisi aynı kalır, kabuk
          // içeriği de alttan aynı payı alır). Alt çubuk varken konum çubuğun
          // ölçüsünden gelir — çubuk payı zaten içerir, ikinci kez eklenmez.
          "mr-(--safe-right)",
          barHeight > 0 ? "" : "mb-(--safe-bottom)",
          // Çekildiğinde görünmez ve dokunulmaz; yer (ölçüm için) korunur.
          // Örtüşmede (doğrulama turu g06/g08) `invisible` YOK: klavyeyle
          // odaklanabilir kalır, odak gelince görünür olur (asistanın başka
          // giriş noktası yok).
          suppressed === "covers"
            ? "pointer-events-none opacity-0"
            : suppressed
              ? "pointer-events-none invisible opacity-0"
              : "",
        )}
      >
        {/* Nefes alan halka — buton kapalıyken sürekli, dikkat çekmeden */}
        {!open ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 -z-10 animate-ping rounded-full [animation-duration:2.5s] max-sm:hidden",
              accent === "blue" ? "bg-blue-500/40" : accent === "emerald" ? "bg-emerald-500/40" : "bg-brand-500/40",
            )}
          />
        ) : null}
        <Sparkles
          className={cn(
            "size-5 transition-transform duration-300 sm:size-6",
            "group-hover:rotate-12 group-hover:scale-110",
            greet === "on" ? "animate-bounce" : "",
          )}
        />
      </button>

      {/* YAN ÇEKMECE, MODAL DEĞİL (2026-09-17, kullanıcı: "asistan açıkken sol
          taraf kullanılabilir olmalı, tamamen blurlu oluyor"): arka plan
          perdesi ve odak kilidi yok; panel sağda durur, sayfa tıklanabilir.
          Kapatma: X düğmesi ya da Escape. */}
      {open ? (
        <aside
          {...LAUNCHER_NODE_PROPS}
          role="complementary"
          aria-label={t("rothernAsistani")}
          className={cn(
            // Güvenli alan: başlık durum çubuğunun, yazma kutusu ana ekran
            // çizgisinin altında kalmaz; yatay telefonda çentik tarafı pay alır.
            "fixed inset-y-0 right-0 z-50 flex w-screen flex-col border-l border-zinc-950/10 bg-white pt-(--safe-top) pr-(--safe-right) pb-(--safe-bottom) shadow-2xl",
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
