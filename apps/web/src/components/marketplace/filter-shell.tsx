"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";

import { useAccentFill } from "@/components/ui/accent-fill";
import { Sheet } from "@/components/ui/sheet";
import { AdjustmentsHorizontalIcon } from "@heroicons/react/20/solid";
import { useSearchParams } from "next/navigation";
import type { Locale } from "@rothern/i18n";
import { localizePath, stripLocale } from "@/i18n/href";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";
import {
  NAV_WATCHDOG,
  assetsLoading,
  createIdleProbe,
  currentHref,
  locationIs,
  clearDrawerReopen,
  keepResourceTimingRoom,
  markDrawerReopen,
  navFallback,
  navProbe,
  observeRscEnd,
  perfNow,
  rscSettleWait,
  takeDrawerReopen,
  type NavMode,
} from "./filter-shell-nav";
import { useScrollKeep } from "./use-scroll-keep";
import {
  activeFilterCount,
  buildProductFilterQuery,
  clearProductFilters,
  parseProductFilters,
  type ProductFilterState,
} from "@/lib/public/product-filter-params";

/**
 * SÜZGEÇ KABUĞU — URL durumu, geçiş (pending) ve mobil çekmece TEK yerde.
 *
 * Süzgeç bileşenleri durumu buradan okur ve `update()` ile yazar; yazma
 * `router.replace(url, { scroll: false })` + `startTransition` → sunucu
 * bileşeni yeniden render olurken `isPending` sonuç ızgarasını soluklaştırır
 * (spinner değil, mevcut içerik + iskelet). Tam sayfa yenileme ve scroll
 * sıfırlanması YOK (süzgeç v3, 2026-09-04).
 *
 * İki katman (2026-09-05): `FilterShellCore` durum tipinden BAĞIMSIZ çekirdek
 * (ürün süzgeci ve açık talep süzgeci aynı çekirdeği kullanır — çekmece,
 * geçiş, sayaç, "Filtrele (n)" bir kez yazılır); `FilterShell` ürün süzgecinin
 * URL kurallarını (kategori yol sayfası) taşıyan ince sarmalayıcı.
 */
interface Ctx<S> {
  state: S;
  /**
   * `opts.replace`: geçmişe YAZMADAN değiştir — kullanıcının değil sistemin
   * yaptığı değişim için (kayıtlı görünüm tercihini URL'e taşımak gibi);
   * yoksa "geri" tuşu kullanıcıyı tercihsiz adrese atıp aynı yere döndürürdü.
   */
  update: (patch: Partial<S> | ((s: S) => S), opts?: { replace?: boolean }) => void;
  clear: () => void;
  isPending: boolean;
  /**
   * Sonuç sayısı. `null` = OKUNAMADI (panel listesi yükleniyor ya da isteği
   * düştü; canlı doğrulama 2026-10-09 OUTR-1 / OUTR-3): sayı ve "… bulunamadı"
   * çizilmez — okunamayan sayı 0 değildir. Sunucuda çizilen herkese açık
   * listeler hep sayı verir.
   */
  total: number | null;
  /** Aktif süzgeç sayısı — arama/sıralama/sayfa hariç. */
  activeCount: number;
  openMobile: () => void;
  closeMobile: () => void;
  /**
   * Süzgeç yüzeyinin VURGU rengi (2026-09-08, kullanıcı kararı: "satınalmada
   * siyah kullanma"). Herkese açık pazar yeri monokrom SİYAH kalır; panelin
   * satınalma bölgesi MAVİ. Renk kabuktan geçer ki kutucuk, çip, kaydırıcı ve
   * mobil düğme tek yerden dönsün — her bileşene ayrı prop taşımak, biri
   * unutulduğunda tek siyah leke bırakırdı.
   */
  accent: FilterAccent;
}

export type FilterAccent = "default" | "blue";

/** Süzgeç yüzeyinin vurgu rengi — bağlam yoksa monokrom. */
export function useFilterAccent(): FilterAccent {
  return useContext(FilterCtx)?.accent ?? "default";
}
const FilterCtx = createContext<Ctx<unknown> | null>(null);
export function useFilters<S = ProductFilterState>(): Ctx<S> {
  const c = useContext(FilterCtx);
  if (!c) throw new Error("useFilters — FilterShell dışında");
  return c as Ctx<S>;
}

/** Mobil çekmece gövdesinin işareti — çekmece içi yardımcılar kaydırma kabını buradan bulur. */
export const FILTER_DRAWER_BODY_ATTR = "data-filter-drawer-body";

/** Öğenin en yakın dikey kaydırılabilir atası (belge kökü hariç). */
function scrollParent(el: Element | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === "auto" || oy === "scroll") return p;
  }
  return null;
}

/** Açık çekmecenin kaydırma kabı (yoksa `null`). */
function drawerScroller(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return scrollParent(document.querySelector(`[${FILTER_DRAWER_BODY_ATTR}]`));
}

/** Kaydırma kabının üst kenarı ile öğe (ya da başlığı) arasında bırakılan pay (px). */
const REVEAL_GAP_PX = 8;
/** Alanın hemen üstündeki başlık (ör. "Yakınımda") bu kadar yakınsa birlikte görünür tutulur (px). */
const REVEAL_LABEL_MAX_GAP_PX = 16;
/**
 * Alanı SARAN `<label>`ın metni alanın üstündeyse (fiyat kutuları "Min. (₺)" /
 * "Maks. (₺)") ve etiket alandan en çok bu kadar yukarıda başlıyorsa etiketle
 * birlikte görünür tutulur (px) — yoksa yazarken kutunun ne olduğu kaybolur.
 */
const REVEAL_WRAP_LABEL_MAX_PX = 48;

/**
 * ÇEKMECEDEKİ YAZI ALANINI KABIN ÜSTÜNE TAŞI (mobil denetim g02 "Yakınımda",
 * doğrulama 2026-10-15): ekran klavyesi açılınca çekmece kısalıyor, alanın
 * altında açılan öneri listesi altlığın ve klavyenin arkasında kalıyordu.
 * Alan (hemen üstünde başlığı varsa onunla birlikte) çekmece gövdesinin
 * üstüne kaydırılır — liste alanın ALTINDA görünür yere açılır. Yalnız mobil
 * çekmecede (masaüstü kenar rayı ve sayfa kaydırılmaz); kab kaydırılamıyorsa
 * (içerik kısa) olabildiği kadar.
 */
export function revealInFilterDrawer(el: HTMLElement | null): void {
  if (!el || !el.isConnected || !el.closest(`[${FILTER_DRAWER_BODY_ATTR}]`)) return;
  const scroller = scrollParent(el);
  if (!scroller) return;
  const top = el.getBoundingClientRect().top;
  let anchorTop = top;
  const prev = el.previousElementSibling;
  if (prev instanceof HTMLElement && /^(LABEL|P|SPAN|LEGEND)$/.test(prev.tagName)) {
    const pr = prev.getBoundingClientRect();
    if (pr.bottom <= top + 1 && top - pr.bottom <= REVEAL_LABEL_MAX_GAP_PX) anchorTop = pr.top;
  } else if (el.parentElement instanceof HTMLLabelElement) {
    const wr = el.parentElement.getBoundingClientRect();
    if (wr.top < top && top - wr.top <= REVEAL_WRAP_LABEL_MAX_PX) anchorTop = wr.top;
  }
  const delta = anchorTop - scroller.getBoundingClientRect().top - REVEAL_GAP_PX;
  if (Math.abs(delta) < 1) return;
  scroller.scrollTop = Math.max(0, scroller.scrollTop + delta);
}

export function FilterShellCore<S extends { page: number }>({
  state,
  toUrl,
  clearState,
  total,
  activeCount,
  accent = "default",
  drawer,
  drawerHideAt = "lg",
  pushFilters = false,
  children,
}: {
  state: S;
  /** Durum → hedef URL (yol + sorgu). */
  toUrl: (next: S) => string;
  /** "Tümünü temizle" sonrası durum. */
  clearState: (s: S) => S;
  /** `null` = sayı okunamadı (bkz. `Ctx.total`). */
  total: number | null;
  activeCount: number;
  /** Mobil çekmecede çizilecek süzgeç ağacı (masaüstü aside ile aynı bileşen, ikinci örnek). */
  drawer?: ReactNode;
  /**
   * Çekmecenin kapandığı (kenar rayının açıldığı) kırılım — kabuğun kendi
   * `aside` kırılımıyla AYNI olmalı. Herkese açık listelerde `lg`; PANEL
   * pazarında `xl`, çünkü orada ekranı sol menü de paylaşıyor: 1024 px'te
   * menü (256) + ray (256) ekranın yarısını yiyor ve sonuç sütunu tek
   * karta düşüyordu. Ayrışırsa 1024-1280 arasında ne ray ne çekmece
   * görünür — süzgeçler tamamen erişilemez olur.
   */
  drawerHideAt?: "lg" | "xl";
  /**
   * Süzgeç değişimi GEÇMİŞE yazılsın mı (2026-09-07, kullanıcı kararı).
   *
   * Varsayılan `false` (`replace`) — açık talep süzgecinin bugünkü davranışı;
   * o listede tıklar hızlı ve ardışıktır, her biri geçmişe girseydi "geri"
   * tuşu listeden çıkamaz hâle gelirdi. Ürün dizininde `true`: 9 grup var ve
   * kullanıcı yanlış kutucuğu geri almak için geri tuşunu bekliyor.
   */
  pushFilters?: boolean;
  /** Vurgu rengi — panel satınalma `blue`, herkese açık pazar yeri monokrom. */
  accent?: FilterAccent;
  children: ReactNode;
}) {
  const router = useRouter();
  // Bekçinin zamanlayıcıları ve belge dinleyicisi güncel yönlendiriciyi okur.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  const pathname = usePathname();
  const locale = useLocale() as Locale;
  const [isPending, startTransition] = useTransition();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Bekçi ve rota değişimi çekmecenin O ANKİ hâlini okur (efekt kapanışı eski kalmasın).
  const mobileOpenRef = useRef(false);
  useEffect(() => {
    mobileOpenRef.current = mobileOpen;
  }, [mobileOpen]);
  /** Yeniden açılan çekmecenin geri yüklenecek kaydırması (bekçinin tam gezinmesinden). */
  const [drawerRestore, setDrawerRestore] = useState(0);

  /**
   * ÇEKMECE ROTA DEĞİŞİMİNDE AÇIK KALIR (mobil denetim g02-10): açılış
   * sayfasında yoldaki süzgeç değişince başka rotaya gidilir ve kabuk yeniden
   * bağlanır; önceki kabuk çekmece açıkken işaret bıraktıysa (bkz.
   * `navigate`, bekçi) yeni kabuk çekmeceyi açık başlatır. Bekçinin tam
   * gezinmesinden sonra sayfa ve çekmece kaldıkları yerden sürer (doğrulama
   * 2026-10-15: ikisi de en başa dönüyordu). Yalnız montajda.
   */
  useEffect(() => {
    const reopen = takeDrawerReopen(pathname);
    if (!reopen) return;
    // Sayfa konumu çekmece AÇILMADAN: açık çekmece sayfa kaydırmasını kilitler.
    if (reopen.page > 0) {
      try {
        window.scrollTo(0, reopen.page);
      } catch {
        /* jsdom / eski tarayıcı */
      }
    }
    if (reopen.open) {
      setDrawerRestore(reopen.drawer);
      setMobileOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız montajda okunur
  }, []);

  /**
   * BEKLEYEN DURUM (arayüz testi O-014). Süzgeç yazımı bir GEÇİŞ: URL ve
   * dolayısıyla `state`, sunucu yanıtı gelene dek ESKİ kalır. Eskiden ikinci
   * tık da eski URL'den kuruluyordu — "Üretici"yi işaretleyip 150 ms sonra
   * "Distribütör"ü işaretleyen kullanıcının ilk seçimi sessizce düşüyordu.
   * Gönderilen son durum ref'te tutulur (art arda gelen olaylar render
   * beklemeden okur), sonraki güncellemeler onun üstüne kurulur ve kutucuklar
   * da onu gösterir (iyimser). Geçiş bitince (URL yetişti ya da gezinme
   * başka yerde sonlandı) yeniden URL kaynak olur.
   */
  const pendingRef = useRef<S | null>(null);
  const [pending, setPending] = useState<S | null>(null);

  /**
   * GEZİNME BEKÇİSİ (mobil denetim g02-01; kök neden ve süreler
   * `filter-shell-nav.ts`). `watchRef` izlenen hedefi tutar: `transition` = bu
   * kabuğun süzgeç/sayfa geçişi (`isPending` bitince düşer), `link` = sonuç
   * alanındaki sayfalama bağlantısı (`data-filter-nav`; adres hedefe gelince
   * düşer). `url` hedefin DIŞ adresi (adres çubuğuyla karşılaştırılır), `href`
   * İÇ yolu (yeniden gönderim yönlendiriciye verir). `since` İLK takılan
   * gezinmenin anı — art arda tıklar üst sınırı ertelemez. `arrivedAt`:
   * hedefin RSC yanıtının geldiğinin ilk görüldüğü an; `stage`/`stageAt`:
   * toparlanma basamağı (0 bekliyor → 1 dürtüldü → 2 yeniden gönderildi) ve
   * o basamağa geçilen an. `stalled`: adres hedefe gelmiş ama
   * geçiş hâlâ bitmemiş — "Güncelleniyor…" süresiz kalmasın diye bekleme
   * görünümü bırakılır.
   */
  type NavWatch = {
    kind: "transition" | "link";
    url: string;
    href: string;
    path: string;
    mode: NavMode;
    since: number;
    perfAt: number;
    from: string;
    arrivedAt: number | null;
    stage: 0 | 1 | 2;
    stageAt: number | null;
    /** Yanıt geldikten sonra JS/CSS indirmesinin ilk görüldüğü an. */
    chunkSince: number | null;
  };
  const watchRef = useRef<NavWatch | null>(null);
  /** Kayıp uyandırmada ilk basamak: `RenderNudge`un güncellemesi (kök neden (a)). */
  const nudgeRef = useRef<(() => void) | null>(null);
  const [watchSeq, setWatchSeq] = useState(0);
  const [stalled, setStalled] = useState(false);
  const isPendingRef = useRef(false);
  const arm = (kind: NavWatch["kind"], url: string, href: string, path: string, mode: NavMode) => {
    // Önceki izleme yalnız HÂLÂ takılıysa (adres hedefine gelmemiş) zamanını
    // devreder; az önce sorunsuz biten sayfa bağlantısının izi (denetim henüz
    // koşmadı) yeni süzgeç tıkının üst sınırını öne çekmesin.
    const prev = watchRef.current;
    watchRef.current = {
      kind,
      url,
      href,
      path,
      mode,
      since: prev && !locationIs(prev.url) ? prev.since : Date.now(),
      perfAt: perfNow(),
      from: currentHref(),
      arrivedAt: null,
      stage: 0,
      stageAt: null,
      chunkSince: null,
    };
    setStalled(false);
    setWatchSeq((n) => n + 1);
  };
  const armRef = useRef(arm);
  useEffect(() => {
    armRef.current = arm;
  });

  useEffect(() => {
    isPendingRef.current = isPending;
    if (!isPending) {
      if (pendingRef.current) {
        pendingRef.current = null;
        setPending(null);
      }
      if (watchRef.current?.kind === "transition") watchRef.current = null;
      setStalled(false);
    }
  }, [isPending]);

  /**
   * KAYDIRMA KORUMASI (mobil denetim r2, 2026-10-15): süzgeç gezinmesi
   * `scroll: false` ile gider ama Next 15.5.25 takma adlı ön-getirme yolunda
   * bunu yok sayıp sayfayı işleme anında en başa atıyordu (kök neden
   * `filter-shell-nav.ts` 3. iş) — masaüstünde tıklanan seçenek ekranın altına
   * düşüyor, telefonda çekmecenin arkasındaki sayfa başa dönüyordu. Gezinmeden
   * önce konum yakalanır (`navigate`), beklerken kullanıcı kaydırırsa izlenir;
   * hedef işlendiği an (kancanın yerleşim efekti — hedef adres ve geçmiş kaydı
   * yazılmış) Next'in kaydırmasından hemen sonra, boyamadan önce geri konur.
   * Yalnız aynı yolda (rota değiştiren süzgeç yeni sayfayı baştan açar);
   * sayfalama bağlantıları dokunulmaz (Next'in olağan kaydırması).
   * Uygulama `useScrollKeep` (AI arama bandı da aynı kancayı kullanır).
   */
  const scrollKeep = useScrollKeep();

  useEffect(() => {
    const w = watchRef.current;
    if (!w) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const probe = (navProbe.idleProbe ?? createIdleProbe)();
    /** Son çare: aynı adrese TAM gezinme (sayfa ve çekmece konumu taşınır). */
    const fail = (cur: NavWatch) => {
      watchRef.current = null;
      scrollKeep.clear();
      probe.dispose();
      if (cur.kind === "transition") {
        markDrawerReopen(cur.path, {
          open: mobileOpenRef.current,
          page: window.scrollY,
          drawer: mobileOpenRef.current ? (drawerScroller()?.scrollTop ?? 0) : 0,
        });
      }
      navFallback.go(cur.url, cur.mode);
    };
    /**
     * Aynı gezinmeyi YENİDEN gönder (kök neden (a), `filter-shell-nav.ts`):
     * veri hazır, React'e yalnız yeni bir güncelleme gerekiyor — ölçüldü,
     * yeni istek olmadan anında işleniyor; sayfa yenilenmez, kaydırma ve
     * çekmece yerinde kalır.
     */
    const retry = (cur: NavWatch) => {
      const r = routerRef.current;
      try {
        if (cur.kind === "transition") startTransition(() => r[cur.mode](cur.href, { scroll: false }));
        else r.push(cur.href);
      } catch {
        fail(cur);
      }
    };
    const check = () => {
      const cur = watchRef.current;
      // İzleme bitti (yeni tık, geçiş bitti): boşta ölçümü de durur.
      if (cur !== w) return probe.dispose();
      if (locationIs(cur.url)) {
        // Adres geldi: Next işledi. Geçiş hâlâ "bekliyor" görünüyorsa bırak.
        watchRef.current = null;
        probe.dispose();
        if (cur.kind === "transition" && isPendingRef.current) setStalled(true);
        return;
      }
      if (currentHref() !== cur.from) {
        // Kullanıcı başka yere gitti (Geri, başka bağlantı) — izlenecek bir şey kalmadı.
        watchRef.current = null;
        scrollKeep.clear();
        probe.dispose();
        return;
      }
      const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      const now = Date.now();
      /**
       * Sonraki denetime kalan süre: bekleyen koşul (ağın sakin sayılması,
       * işlemcinin boşta eşiği) ne zaman dolacaksa o an (+ `wakeSlackMs`),
       * en çok `recheckMs` (WebKit ölçümü r2-filter-hang: sabit aralık dürtüyü
       * bir aralık geciktiriyordu).
       */
      let nextIn: number = NAV_WATCHDOG.recheckMs;
      if (!hidden) {
        if (now - cur.since >= NAV_WATCHDOG.hardLimitMs) return fail(cur);
        if (cur.arrivedAt === null) {
          const settleIn = rscSettleWait(cur.url, cur.perfAt);
          if (settleIn === 0) cur.arrivedAt = now;
          else if (settleIn !== null) nextIn = settleIn + NAV_WATCHDOG.wakeSlackMs;
        }
        const waitingChunk = cur.arrivedAt !== null && assetsLoading();
        if (waitingChunk) cur.chunkSince ??= now;
        else cur.chunkSince = null;
        if (waitingChunk && now - cur.chunkSince! < NAV_WATCHDOG.chunkWaitMs) {
          // Yeni istemci bileşeninin JS parçası / CSS'i iniyor: geçiş meşru
          // biçimde bekliyor (en çok `chunkWaitMs`). Boşta süresi indikten
          // SONRA yeniden birikmeli.
          probe.reset();
          if (cur.stageAt === null) cur.arrivedAt = now;
          else cur.stageAt = now;
        } else if (cur.arrivedAt !== null) {
          // Yanıt geldi, ağ sustu. İşlemci de BOŞTAYSA geçiş takılmıştır; meşgulse
          // React hâlâ çiziyordur (yavaş cihaz) — beklenir. Ölçüm: Chromium'da
          // `requestIdleCallback`, WebKit'te yoklama (`TICK_PROBE`); hiçbiri kurulamazsa süre.
          const last = cur.stage === 2;
          let settled: boolean;
          if (probe.supported) {
            const need = last ? NAV_WATCHDOG.retryIdleMs : NAV_WATCHDOG.idleMs;
            const idle = probe.idleFor();
            settled = idle >= need;
            // Boşta süresi birikiyor: eşiğin dolacağı ana kur. Meşgulse (0) olağan
            // aralık — her `recheckMs` penceresinde bir denetim düştüğü için boşta
            // başlayınca eşik yine tam vaktinde yakalanır.
            if (!settled && idle > 0) nextIn = need - idle + NAV_WATCHDOG.wakeSlackMs;
          } else {
            const need = last ? NAV_WATCHDOG.retryQuietMs : NAV_WATCHDOG.quietMs;
            const quiet = now - (cur.stageAt ?? cur.arrivedAt);
            settled = quiet >= need;
            if (!settled) nextIn = need - quiet + NAV_WATCHDOG.wakeSlackMs;
          }
          if (settled) {
            if (last) return fail(cur);
            cur.stage = cur.stage === 0 ? 1 : 2;
            cur.stageAt = now;
            probe.reset();
            if (cur.stage === 1) {
              navProbe.onNudge();
              nudgeRef.current?.();
            } else retry(cur);
          }
        }
      }
      // Gizli sekmede üst sınır dolmuş olsa da yoklama `recheckMs` aralığında
      // kalır (kalan süre 0 → 0 ms'lik sıkı döngü olurdu); görünür olunca karar verilir.
      const left = Math.max(0, cur.since + NAV_WATCHDOG.hardLimitMs - Date.now());
      const wait = Math.max(NAV_WATCHDOG.wakeSlackMs, Math.min(nextIn, NAV_WATCHDOG.recheckMs));
      timer = setTimeout(check, hidden ? NAV_WATCHDOG.recheckMs : Math.min(wait, left));
    };
    const untilHard = Math.max(0, w.since + NAV_WATCHDOG.hardLimitMs - Date.now());
    timer = setTimeout(check, Math.min(NAV_WATCHDOG.firstCheckMs, untilHard));
    // Hedefin RSC yanıtı bittiği an denetimi öne çek: takılan geçiş yanıtın
    // bitişinden ~`settleMs` sonra (işlemci boşsa) dürtülür.
    const stopObserving = observeRscEnd(w.url, w.perfAt, () => {
      if (watchRef.current !== w) return;
      clearTimeout(timer);
      timer = setTimeout(check, NAV_WATCHDOG.settleMs + NAV_WATCHDOG.wakeSlackMs);
    });
    return () => {
      clearTimeout(timer);
      stopObserving();
      probe.dispose();
    };
  }, [watchSeq, scrollKeep]);

  // Sonuç alanındaki SAYFALAMA BAĞLANTILARI (`data-filter-nav` içindeki <a>)
  // da Next geçişidir ve aynı biçimde takılabiliyordu ("Sonraki sayfa" 12 sn
  // tepkisiz). Yakalama evresinde dinlenir: Next `Link` kendi işleyicisinde
  // `preventDefault` çağırır, kabarcık evresinde her tık "engellenmiş" görünürdü.
  useEffect(() => {
    keepResourceTimingRoom();
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("[data-filter-nav] a[href]") : null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      let u: URL;
      try {
        u = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (u.origin !== window.location.origin || locationIs(u.href)) return;
      const outer = `${u.pathname}${u.search}`;
      // Sayfalama konumu kendisi yönetir (Next'in olağan kaydırması): bekleyen süzgeç koruması düşer.
      scrollKeep.clear();
      armRef.current("link", outer, stripLocale(outer), u.pathname, "push");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [scrollKeep]);

  /**
   * SÜZGEÇ değişimi `replace` (her tık geçmişe girmesin — "geri" tuşu on
   * kutucuk geri gitmemeli), SAYFA değişimi `push` (2. sayfadan "geri"
   * 1. sayfaya dönmeli). İkisi de `scroll: false`: konumu sayfalama
   * kendi yönetir, süzgeçte sayfa başına zıplamak istenmiyor. Next bunu bir
   * yolda yok saydığı için konum ayrıca korunur (`useScrollKeep`).
   */
  const navigate = (next: S, mode: NavMode = "replace") => {
    const href = toUrl(next);
    const path = href.split(/[?#]/)[0] || "/";
    const outer = localizePath(href, locale);
    pendingRef.current = next;
    setPending(next);
    // Başka rotaya geçiş (açılış sayfası → sorgu şeması) kabuğu yeniden
    // bağlar; çekmece açıksa yeni kabuk onu açık başlatsın (g02-10).
    if (mobileOpen && path !== pathname) markDrawerReopen(path);
    if (path === pathname) scrollKeep.capture(outer);
    else scrollKeep.clear();
    arm("transition", outer, href, path, mode);
    startTransition(() => router[mode](href, { scroll: false }));
  };
  const update: Ctx<S>["update"] = (patch, opts) => {
    const base = pendingRef.current ?? state;
    const next = typeof patch === "function" ? patch(base) : { ...base, ...patch };
    // Süzgeç değişince 1. sayfaya dönülür; sayfa YALNIZ açıkça istenince
    // korunur (eskiden `update({ page })` da 1'e düşüyordu — panel ürün
    // dizininde "Sonraki" çalışmıyordu).
    const explicitPage = typeof patch === "function" ? next.page !== base.page : "page" in patch;
    navigate(
      explicitPage ? next : { ...next, page: 1 },
      !opts?.replace && (explicitPage || pushFilters) ? "push" : "replace",
    );
  };
  const clear = () => navigate(clearState(pendingRef.current ?? state));
  // Kullanıcı çekmeceyi kapattıysa bekleyen "yeni rotada yeniden aç" işareti de düşer.
  // Kararlı kimlik: çekmecenin kırılım dinleyicisi her çizimde yeniden kurulmasın.
  const closeMobile = useCallback(() => {
    clearDrawerReopen();
    setDrawerRestore(0);
    setMobileOpen(false);
  }, []);

  const value: Ctx<S> = {
    state: pending ?? state,
    update,
    clear,
    isPending: isPending && !stalled,
    total,
    activeCount,
    openMobile: () => setMobileOpen(true),
    closeMobile,
    accent,
  };
  return (
    <FilterCtx.Provider value={value as Ctx<unknown>}>
      {children}
      <RenderNudge nudgeRef={nudgeRef} />
      <MobileDrawer
        open={mobileOpen}
        onClose={closeMobile}
        hideAt={drawerHideAt}
        restoreScroll={drawerRestore}
        onScrollRestored={() => setDrawerRestore(0)}
      >
        {drawer}
      </MobileDrawer>
    </FilterCtx.Provider>
  );
}

/**
 * DÜRTÜ (gezinme bekçisi, kök neden (a) `filter-shell-nav.ts`): hiçbir şey
 * çizmeyen, yalnız kendi durumunu artıran yaprak. Takılan geçişte React
 * verisi hazır ağacı işlemek için YENİ bir güncelleme bekliyor; ölçüldü —
 * herhangi bir güncelleme (ör. bir süzgeç grubunu açıp kapamak) geçişi
 * anında işletiyor. Yaprakta tutulur ki dürtü yalnız bu bileşeni yeniden
 * çizsin (süzgeç bağlamının tüketicileri çizilmez).
 */
function RenderNudge({ nudgeRef }: { nudgeRef: RefObject<(() => void) | null> }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    nudgeRef.current = () => setTick((n) => n + 1);
    return () => {
      nudgeRef.current = null;
    };
  }, [nudgeRef]);
  return null;
}

/**
 * ÜRÜN süzgeç kabuğu. `basePath`: herkese açık `/urunler` ya da panel
 * `/company/satinalma/urunler`. Kategori yol sayfasından
 * (`/urunler/kategori/…`) ilk etkileşimde sorgu şemasına geçilir — yol
 * sayfası SEO girişi, etkileşim sorguda.
 */
export function FilterShell({
  basePath,
  fixedCategory,
  fixedCity,
  fixedCountry,
  total,
  drawer,
  drawerHideAt,
  pushFilters,
  accent,
  children,
}: {
  basePath: string;
  /** Kategori yol sayfasında yoldan gelen kod. */
  fixedCategory?: string;
  /**
   * Şehir/ülke açılış sayfasında YOLDAN gelen süzgeç (2026-09-27): durumun
   * parçası sayılır (sayaç, çip, işaretli kutu) ve sıralama/görünüm/sayfa
   * boyutu değişince açılış yolunda kalınır; yoldaki değer kaldırılır ya da
   * başka şehir/ülke eklenirse sorgu şemasına (`/urunler?…`) geçilir.
   */
  fixedCity?: string;
  fixedCountry?: string;
  /** `null` = sayı okunamadı (bkz. `Ctx.total`). */
  total: number | null;
  drawer?: ReactNode;
  /** Bkz. `FilterShellCore` — panel pazarında `xl`. */
  drawerHideAt?: "lg" | "xl";
  /** Bkz. `FilterShellCore` — ürün dizininde `true`. */
  pushFilters?: boolean;
  /** Bkz. `FilterShellCore` — panel satınalmada `blue`. */
  accent?: FilterAccent;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = new URLSearchParams(sp?.toString() ?? "");
  if (fixedCity) current.set("sehir", fixedCity);
  if (fixedCountry) current.set("ulke", fixedCountry);
  const state = parseProductFilters(current, fixedCategory);

  const only = (list: string[], value: string) => list.length === 1 && list[0] === value;
  const toUrl = (next: ProductFilterState) => {
    // Yol sayfasındaysak (kategori/şehir/ülke) ve yoldaki süzgeç AYNEN
    // duruyorsa mevcut yolda kal (kanonik yol); değiştiyse/genişlediyse
    // sorgu şemasına geç.
    const onPathPage = (!!fixedCategory || !!fixedCity || !!fixedCountry) && pathname !== basePath;
    const keepPath =
      onPathPage &&
      (!fixedCategory || next.category === fixedCategory) &&
      (!fixedCity || only(next.cities, fixedCity)) &&
      (!fixedCountry || only(next.countries, fixedCountry));
    const target = keepPath ? pathname : basePath;
    return `${target}${buildProductFilterQuery(
      keepPath
        ? {
            ...next,
            category: fixedCategory ? undefined : next.category,
            cities: fixedCity ? [] : next.cities,
            countries: fixedCountry ? [] : next.countries,
          }
        : next,
    )}`;
  };

  return (
    <FilterShellCore
      state={state}
      toUrl={toUrl}
      clearState={clearProductFilters}
      total={total}
      activeCount={activeFilterCount(state)}
      drawer={drawer}
      drawerHideAt={drawerHideAt}
      pushFilters={pushFilters}
      accent={accent}
    >
      {children}
    </FilterShellCore>
  );
}

/** Sonuç alanı: geçişte soluk + tıklanamaz; içerik yerinde kalır. */
export function FilterResults({ children }: { children: ReactNode }) {
  const { isPending } = useFilters();
  return (
    <div aria-busy={isPending} className={isPending ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"}>
      {children}
    </div>
  );
}

/**
 * "N ürün bulundu" — ekran okuyucuya canlı bildirilir.
 *
 * `loading`: İLK yükleme (veri henüz hiç gelmedi). `isPending` yalnız
 * süzgeç GEÇİŞİNİ kapsar, ilk isteği değil — o yüzden sayfa açılırken
 * "0" görünüyor ve başlıkta "firma bulunamadı" yazıyordu; iskeletler hâlâ
 * dönerken sayfa boş olduğunu ilan ediyordu.
 */
/**
 * Sonuç sayısı — `aria-live` bölgesi (süzgeç değişince ekran okuyucuya kaç
 * sonuç kaldığını söyler).
 *
 * `quiet` (2026-09-07): sayı SAYFA BAŞLIĞINDA da yazılıyorsa metin
 * görsel olarak gizlenir, canlı bölge KALIR. İki yerde aynı sayıyı basmak
 * kullanıcının bu oturumda tekrar tekrar işaret ettiği "aynı içerik iki
 * yerde" hatasıydı; `sr-only`ye almak yerine bileşeni kaldırmak ise
 * duyuruyu tümden susturur ve süzgeç değişimi sessiz kalırdı.
 * "Güncelleniyor…" `quiet` modda da GÖRÜNÜR — bekleme geri bildirimi
 * gözle görülmeli.
 */
/** Sayılan şey — "N … bulundu" cümlesi dil başına ICU çoğuluyla tek mesajda. */
export type ResultCountKind =
  | "product"
  | "company"
  | "buyingRequest"
  | "openRequest"
  /** Satış paneli Açık Talepler › Durum: Geçmiş (arayüz testi D-116). */
  | "pastRequest"
  /** Satış paneli Açık Talepler › Durum: Tümü. */
  | "request";

const FOUND_KEY = {
  product: "foundProduct",
  company: "foundCompany",
  buyingRequest: "foundBuyingRequest",
  openRequest: "foundOpenRequest",
  pastRequest: "foundPastRequest",
  request: "foundRequest",
} as const satisfies Record<ResultCountKind, string>;

/**
 * Liste tarama tavanına dayandığında sayı ALT SINIRDIR ("200+") — tavanlı
 * kaynağı olan türler (D-116: geçmiş talepler 200'de kırpılıyordu, metin
 * kesin sayı gibi okunuyordu).
 */
const FOUND_AT_LEAST_KEY = {
  openRequest: "foundOpenRequestAtLeast",
  pastRequest: "foundPastRequestAtLeast",
  request: "foundRequestAtLeast",
} as const satisfies Partial<Record<ResultCountKind, string>>;

function foundKey(kind: ResultCountKind, atLeast: boolean) {
  if (atLeast && kind in FOUND_AT_LEAST_KEY) {
    return FOUND_AT_LEAST_KEY[kind as keyof typeof FOUND_AT_LEAST_KEY];
  }
  return FOUND_KEY[kind];
}

/** "… bulunamadı" da tür başına TAM cümle — isim parçası cümleye eklenmez (RU/EN çekimi tutmaz). */
const NOT_FOUND_KEY = {
  product: "notFoundProduct",
  company: "notFoundCompany",
  buyingRequest: "notFoundBuyingRequest",
  openRequest: "notFoundOpenRequest",
  pastRequest: "notFoundPastRequest",
  request: "notFoundRequest",
} as const satisfies Record<ResultCountKind, string>;

export function ResultCount({
  kind,
  loading = false,
  quiet = false,
  atLeast = false,
}: {
  kind: ResultCountKind;
  loading?: boolean;
  quiet?: boolean;
  /** Sayı tarama tavanında — "N+" yazılır. */
  atLeast?: boolean;
}) {
  const t = useTranslations("web.marketplace.filters");
  const { total, isPending } = useFilters();
  const busy = loading || isPending;
  // Sayı okunamadı ve beklenen bir şey de yok (istek düştü): "… bulunamadı"
  // demek yalan olur — canlı bölge susar, hata kartı sayfanın kendisinde.
  if (!busy && total == null) return null;
  return (
    <p aria-live="polite" className={quiet && !busy ? "sr-only" : "text-sm text-zinc-600"}>
      {busy
        ? t("updating")
        : total != null && total > 0
          ? t(foundKey(kind, atLeast), { total })
          : t(NOT_FOUND_KEY[kind])}
    </p>
  );
}

/**
 * Mobil: "Filtrele (n)" düğmesi. `hideAt` kabuğun kenar rayı kırılımıyla
 * AYNI olmalı (bkz. `FilterShellCore.drawerHideAt`) — sınıflar birebir
 * yazılır, `lg`/`xl` farklı varyant olduğu için twMerge onları birleştiremez.
 */
export function MobileFilterButton({ hideAt = "lg" }: { hideAt?: "lg" | "xl" }) {
  const t = useTranslations("web.marketplace.filters");
  const { activeCount, openMobile } = useFilters();
  return (
    <button
      type="button"
      onClick={openMobile}
      // `shrink-0 whitespace-nowrap` (mobil denetim g02-13): RU "Фильтры (3)"
      // uzun sonuç cümlesinin yanında iki satıra bölünüp 54 px'lik garip bir
      // hap oluyordu; sarması gereken yandaki sayı cümlesidir.
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-300 px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap text-zinc-900 ${
        hideAt === "xl" ? "xl:hidden" : "lg:hidden"
      }`}
    >
      <AdjustmentsHorizontalIcon aria-hidden className="size-4" />
      {t("filterButton")}{activeCount > 0 ? ` (${activeCount})` : ""}
    </button>
  );
}

/** Ekran klavyesi açtığı yazı alanları (kutucuk, radyo, kaydırıcı değil). */
const TEXT_ENTRY_TYPES = new Set(["", "text", "search", "email", "tel", "url", "number", "password"]);
function isTextEntry(el: Element | null): el is HTMLElement {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return TEXT_ENTRY_TYPES.has(el.type) && !el.readOnly && !el.disabled;
  return el instanceof HTMLElement && el.isContentEditable;
}

/** Görünür alan en az bu kadar kısalınca ekran klavyesi açık sayılır (px). */
export const KEYBOARD_MIN_PX = 120;

function viewportHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

/** Bir sonraki kare (rAF yoksa kısa zamanlayıcı); iptal fonksiyonu döner. */
function nextFrame(cb: () => void): () => void {
  if (typeof window.requestAnimationFrame === "function") {
    const id = window.requestAnimationFrame(cb);
    return () => window.cancelAnimationFrame(id);
  }
  const id = setTimeout(cb, 16);
  return () => clearTimeout(id);
}

/**
 * ÇEKMECEDE YAZARKEN (mobil denetim g02 "Yakınımda", doğrulama 2026-10-15):
 * çekmecedeki bir yazı alanı odaktayken ekran klavyesi açıksa (görünür alan
 * `KEYBOARD_MIN_PX` kısaldı) `true` döner — altlık o sürede gizlenir, gövdeye
 * yer kalır. Aynı sürede odaktaki alan gövdenin ÜSTÜNE taşınır
 * (`revealInFilterDrawer`) ve içerik büyüdükçe (öneri listesi açıldı) ya da
 * klavye boyu değiştikçe yeniden taşınır: listeler alanın altına açılır,
 * klavyenin ve altlığın arkasında kalmaz. Klavyesiz odakta (fiziksel klavye)
 * hiçbir şey değişmez.
 */
function useDrawerKeyboard(open: boolean, body: RefObject<HTMLDivElement | null>): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!open || typeof window === "undefined") {
      setTyping(false);
      return;
    }
    // Klavyesiz en büyük görünür yükseklik; genişlik değişince (döndürme) yeniden ölçülür.
    let base = viewportHeight();
    let width = window.innerWidth;
    let typingNow = false;
    let cancel: (() => void) | null = null;
    // İçerik büyüyünce (öneri listesi, süzülen liste) alan yeniden üste taşınır.
    // Panel portalda ilk karelerden sonra bağlanır: gözlem gövde görününce kurulur.
    const ro =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            if (typingNow && isTextEntry(document.activeElement)) revealInFilterDrawer(document.activeElement);
          })
        : null;
    let observed: Element | null = null;
    const evaluate = () => {
      cancel?.();
      // Odak `focusout` anında henüz yeni alana geçmemiştir; bir kare sonra bakılır.
      cancel = nextFrame(() => {
        cancel = null;
        if (ro && body.current && observed !== body.current) {
          if (observed) ro.unobserve(observed);
          ro.observe(body.current);
          observed = body.current;
        }
        const h = viewportHeight();
        if (window.innerWidth !== width) {
          width = window.innerWidth;
          base = h;
        }
        if (h > base) base = h;
        const el = document.activeElement;
        typingNow = isTextEntry(el) && !!body.current?.contains(el) && base - h >= KEYBOARD_MIN_PX;
        setTyping(typingNow);
        if (typingNow) revealInFilterDrawer(el as HTMLElement);
      });
    };
    const vv = window.visualViewport;
    document.addEventListener("focusin", evaluate);
    document.addEventListener("focusout", evaluate);
    window.addEventListener("resize", evaluate);
    vv?.addEventListener("resize", evaluate);
    evaluate();
    return () => {
      cancel?.();
      document.removeEventListener("focusin", evaluate);
      document.removeEventListener("focusout", evaluate);
      window.removeEventListener("resize", evaluate);
      vv?.removeEventListener("resize", evaluate);
      ro?.disconnect();
    };
  }, [open, body]);
  return open && typing;
}

function MobileDrawer({
  open,
  onClose,
  hideAt,
  restoreScroll = 0,
  onScrollRestored,
  children,
}: {
  open: boolean;
  onClose: () => void;
  hideAt: "lg" | "xl";
  /** Açılınca geri yüklenecek gövde kaydırması (bekçinin tam gezinmesinden; 0 = yok). */
  restoreScroll?: number;
  onScrollRestored?: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("web.marketplace.filters");
  const fmt = useFormatter();
  // Mavi olmayan yüzeyde portal bağlamı (public tedarikçi yüzü yeşil; 2026-09-18).
  const ctxFill = useAccentFill();
  const { total, clear, isPending, accent } = useFilters();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const typing = useDrawerKeyboard(open, bodyRef);
  // Tam gezinmeden sonra çekmece kaldığı yerden açılır: panel ilk karelerde
  // bağlanır ve içerik o anda yerleşir — kaydırılabilir olana dek birkaç kare denenir.
  const restoredRef = useRef(onScrollRestored);
  useEffect(() => {
    restoredRef.current = onScrollRestored;
  });
  useEffect(() => {
    if (!open || restoreScroll <= 0) return;
    let frames = 0;
    let cancel: (() => void) | null = null;
    const attempt = () => {
      const scroller = scrollParent(bodyRef.current);
      if (scroller && scroller.scrollHeight > scroller.clientHeight) {
        scroller.scrollTop = restoreScroll;
        restoredRef.current?.();
        return;
      }
      if (++frames < 60) cancel = nextFrame(attempt);
      else restoredRef.current?.();
    };
    cancel = nextFrame(attempt);
    return () => cancel?.();
  }, [open, restoreScroll]);
  // KIRILIMI GEÇİNCE KAPAN (arayüz testi D-322): panel `lg:hidden`/`xl:hidden`
  // ile gizleniyor ama Dialog açık kalıyordu — pencere genişletilince
  // karartma ve kaydırma kilidi duruyor, sayfa tıklanamıyordu. Eşik
  // Tailwind'in varsayılan `lg` (64rem) / `xl` (80rem) kırılımıyla aynı.
  useEffect(() => {
    if (!open || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(`(min-width: ${hideAt === "xl" ? "80rem" : "64rem"})`);
    if (mq.matches) {
      onClose();
      return;
    }
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) onClose();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open, hideAt, onClose]);
  // Sözlük primitive'i (PROMPT 3): alt çekmece, başlıkta "Temizle", altlıkta canlı sayaç.
  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="bottom"
      title={t("filtersTitle")}
      className={hideAt === "xl" ? "xl:hidden" : "lg:hidden"}
      header={
        <div className="flex flex-1 items-center justify-between gap-3">
          {/* Dokunma alanı görünümü değiştirmeden büyür (mobil denetim g02-08):
              55×20 px'ti; sözde öğe başlık satırının dolgusuna taşar. */}
          <button
            type="button"
            onClick={clear}
            className="relative text-sm font-medium text-zinc-600 after:absolute after:-inset-x-2 after:-inset-y-3 hover:text-zinc-950"
          >
            {t("clear")}
          </button>
          <p className="text-sm font-semibold text-zinc-900">{t("filtersTitle")}</p>
        </div>
      }
      footer={
        // Klavye açıkken yazarken altlık gizlenir (`useDrawerKeyboard`): yer
        // gövdeye ve öneri listesine kalır; klavye kapanınca geri gelir.
        typing ? undefined : (
          <button
            type="button"
            onClick={onClose}
            className={`w-full rounded-full px-4 py-2.5 text-sm font-semibold text-white ${
              accent === "blue" ? "bg-blue-600 hover:bg-blue-700" : ctxFill
            }`}
          >
            {isPending
              ? t("updating")
              : total == null
                ? t("showResultsPlain")
                : t("showResults", { total: fmt.number(total) })}
          </button>
        )
      }
    >
      {/* `data-filter-drawer-body` = `FILTER_DRAWER_BODY_ATTR`. */}
      <div ref={bodyRef} data-filter-drawer-body="">
        {children}
      </div>
    </Sheet>
  );
}
