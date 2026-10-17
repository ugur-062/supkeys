/**
 * SÜZGEÇ KABUĞUNUN GEZİNME YARDIMCILARI (mobil denetim 2026-10, g02-01 / g02-10).
 *
 * İki iş, ikisi de `FilterShellCore`a bağlı ve React'ten bağımsız (saf, test
 * edilebilir):
 *
 *  1. GEZİNME BEKÇİSİ — süzgeç/sayfa geçişi işlenmezse önce aynı gezinmeyi
 *     YENİDEN gönderir, o da işlenmezse tam gezinmeye düşer.
 *
 *     KÖK NEDEN (2026-10-15; üretim derlemesinde React kökü ve Next eylem
 *     kuyruğu okunarak ölçüldü). İki ayrı belirti "takılma" diye görünüyordu:
 *
 *     a) KAYIP UYANDIRMA (gerçek kilitlenme). Sunucu verisi ÖNBELLEKTE YOKKEN
 *        (ilk kez istenen süzgeç birleşimi; doğrulamada her yeni birleşim)
 *        RSC yanıtı parça parça akar: kök satırı önce, sayfa satırları API
 *        yanıtından sonra (~0,1 sn). Next gezinmeyi kök satırıyla işler, React
 *        geçişi henüz gelmemiş satırlarda askıya alır. Satırlar birkaç ms sonra
 *        gelir ama React'e haber gitmez: kök şeritleri `suspended`, `pinged` 0,
 *        zamanlanmış iş yok; Next'in eylem kuyruğu boş ve son durum (sayfa
 *        verisi dahil) eksiksiz. Geçiş süresiz bekler (ölçüldü: 30 sn+), ardından
 *        gelen her yeni birleşim aynı yoldan yine takılır ("sonraki tıklar da
 *        takılıyor", ilk denetimde 5 dk+). Önbellekteki birleşim tek parçada
 *        gelir ve takılmaz (önbellek sıcakken 250+ tıkta 0). Next'in iki gezinme
 *        yolunda da (takma adlı tembel kesim + `ACTION_SERVER_PATCH`, ya da tam
 *        ön-getirme) aynı. Takılan geçişte AYNI gezinmeyi yeniden göndermek —
 *        YENİ istek olmadan, önbellekteki aynı veriyle — onu ANINDA işletiyor:
 *        veri hazır, eksik olan yalnız yeni bir güncellemedir. Uygulama kodunda
 *        düzeltilebilecek bir askı yok (Next 15.5.25'in gömülü React 19.2
 *        kanarya sürümü); kabuk bunu ölçülü bir dürtüyle kapatır.
 *     b) YAVAŞ ÇİZİM (kilitlenme değil). RSC yanıtı ~0,1 sn'de gelse de
 *        çekmece açıkken sayfanın yeniden çizimi meşgul işlemcide (4× CPU
 *        kısıtı + sunucu yükü) 1,5-3 sn sürüyor; eski bekçi "yanıt geldi, ağ
 *        2 sn sustu" diye 4. saniyede sayfayı baştan yüklüyordu — ağ susar
 *        ama React hâlâ çalışır.
 *
 *     Doğrulandı: takılan geçişte ilgisiz bir durum güncellemesi (bir süzgeç
 *     grubunu açıp kapamak) 4/4 kez geçişi anında işletti; aynı gezinmeyi
 *     yeniden göndermek de (yeni istek olmadan) 6/6.
 *
 *     KARAR: hedefin RSC yanıtı BİTTİĞİNDE (`observeRscEnd` anında haber verir,
 *     yoklama yedek) ağ `settleMs` sustu, JS/CSS inmiyor (`assetsLoading`) ve
 *     ana iş parçacığı `idleMs` BOŞTA (`createIdleProbe`; React çiziyorsa
 *     meşguldür — (b) beklenir) ama adres hâlâ eskiyse üç basamak:
 *       1. DÜRTÜ — kabuktaki boş bir yaprağın durumu artırılır (`navProbe`
 *          gözler): React yeni bir güncelleme görür, hazır ağacı işler. (a)
 *          yanıtın bitiminden ~0,3 sn sonra işlenir; sayfa yenilenmez,
 *          kaydırma ve çekmece yerinde kalır.
 *       2. YENİDEN GÖNDER — yine `idleMs` boşta ve adres eski: aynı gezinme
 *          bir kez daha gönderilir.
 *       3. TAM GEZİNME — `retryIdleMs` daha boşta ve adres eski: aynı adrese
 *          tam yükleme (son çare; sayfa ve çekmece konumu taşınır).
 *     `requestIdleCallback` olmayan tarayıcıda (WebKit: Safari, iOS kabuğu)
 *     boşta ölçümü YOKLAMAYLA yapılır (`createIdleProbe` → `TICK_PROBE`): her
 *     ~50 ms'de bir zamanlayıcı + `MessageChannel` mesajı. React bir geçişi
 *     çizerken görevleri 5 ms'lik dilimlerle kuyruğa koyar; mesaj bir dilimin
 *     arkasında bekler (ölçüldü, WebKit 390: çizim sırasında 5-18 ms, boşta
 *     1-2 ms), uzun görev zamanlayıcıyı geciktirir. Böylece kayıp uyandırma
 *     yanıtın bitiminden ~0,5 sn sonra dürtülür (eski süre tabanlı yolda
 *     1,4-1,9 sn), çizim sürerken yine beklenir. Hiç ölçüm kurulamazsa süre
 *     tabanlı (`quietMs` / `retryQuietMs`). Yavaş ağda (yanıt henüz bitmemiş)
 *     müdahale YOK; en geç `hardLimitMs`te tam gezinme.
 *
 *     WEBKIT İNCE AYARI (mobil denetim r2-filter-hang, 2026-10-15; yamalı
 *     paketle 94 tık izlendi): kayıp uyandırma 3 tıkta görüldü, dürtü her
 *     seferinde işe yaradı ama yanıtın bitiminden ~0,55 sn sonra geldi —
 *     ilk denetimde boşta süresi eşiğin ~50 ms altında kalıyor, karar bir
 *     yoklama aralığı (250 ms) ertesine kalıyordu. Artık denetim koşulun
 *     dolacağı ana kurulur (`wakeSlackMs`; üst sınır `recheckMs`). "Ağ sakin"
 *     hesabı geçişi bekletemeyecek kaynakları (görsel, işaret, başka adresin
 *     `_rsc` ön-getirmesi) saymaz (`rscSettleWait`). Yanıttan sonra 1 sn'yi
 *     aşan kalan tıklar meşgul iş parçacığıdır (React zaman dilimli çiziyor;
 *     sayfa açılışından sonraki ilk tıkta bağlantı ön-getirmeleri ve JS
 *     parçaları iniyor) — orada bekçi bilerek bekler.
 *
 *  2. ÇEKMECEYİ YENİDEN AÇ — kategori/şehir/ülke açılış sayfasında yoldaki
 *     süzgeç değişince (`FilterShell.toUrl` sorgu şemasına geçer) BAŞKA bir
 *     rotaya gidilir, kabuk yeniden bağlanır ve mobil çekmece kapanırdı;
 *     kullanıcı yukarı kaydırıp "Süzgeçler"i yeniden açmak zorunda kalıyordu.
 *     Rota değiştiren gezinmeden önce kısa ömürlü bir işaret yazılır, yeni
 *     kabuk bağlanınca okur ve çekmeceyi açık başlatır. Bekçinin tam gezinmesi
 *     de aynı işareti kullanır ve sayfa ile çekmecenin kaydırma konumunu da
 *     taşır (tam yüklemeden sonra kullanıcı en başa atılmasın).
 *
 *  3. KAYDIRMA KORUMASI — süzgeç gezinmesi `{ scroll: false }` ile gider ama
 *     Next 15.5.25 bunu bir yolda YOK SAYIYOR (mobil denetim r2, 2026-10-15;
 *     masaüstünde her süzgeç tıkı sayfayı en başa atıyordu, telefonda çekmecenin
 *     arkasındaki sayfayı). Kök neden: hedefin kendi ön-getirme kaydı yokken
 *     `router.replace/push` aynı yolun SORGUSUZ ön-getirme kaydını (üst
 *     çubuktaki "Ürünler" bağlantısı) takma adla kullanır;
 *     `handleAliasedPrefetchEntry` (`aliased-prefetch-navigations.js`)
 *     `mutable.scrollableSegments` yazar ama `mutable.shouldScroll`u YAZMAZ,
 *     `handleMutable` onu varsayılan `true` sayar → `focusAndScrollRef.apply`
 *     açılır ve sayfa kesiminin `InnerScrollAndFocusHandler`ı işleme anında
 *     `documentElement.scrollTop = 0` yazar. Uygulama kodunda kapatılacak bir
 *     ayar yok; kabuk gezinmeden önce konumu yakalar (`captureScroll`) ve
 *     hedef işlendiği an geri koyar (`restoreScrollAfterCommit`). React
 *     tarafı TEK kanca: `use-scroll-keep.ts` `useScrollKeep` — aynı yolda
 *     `scroll: false` ile gezinen her bileşen (AI arama bandının çipleri
 *     dahil) onu kullanır.
 */

export type NavMode = "push" | "replace";

/** Bekçi süreleri (ms). Testler okur; değerleri değiştirmek davranış kararıdır. */
export const NAV_WATCHDOG = {
  /** İlk yoklama (yanıtın bitişi gözlenemiyorsa yedek; gözlenince denetim hemen kurulur). */
  firstCheckMs: 1000,
  /**
   * Sonraki denetimlerin aralığı ÜST SINIRI (ucuz: Resource Timing taraması +
   * boşta ölçümü). Bekleyen koşulun ne zaman dolacağı biliniyorsa (ağın sakin
   * sayılmasına ya da boşta eşiğine kalan süre) denetim o ana kurulur — bkz.
   * `wakeSlackMs`.
   */
  recheckMs: 250,
  /**
   * Koşulun dolacağı ana kurulan denetime eklenen pay (zamanlayıcı kayması,
   * yoklama hükmünün gecikmesi). WebKit ölçümü (r2-filter-hang, 2026-10-15):
   * sabit 250 ms'lik yoklamada boşta eşiği ilk denetimde ~50 ms eksik
   * kalıyordu ve dürtü bir aralık (~250 ms) gecikiyordu; kayıp uyandırma
   * yanıtın bitiminden ~0,55 sn sonra dürtülüyordu.
   */
  wakeSlackMs: 20,
  /** Hedefin RSC yanıtı bittikten sonra ağın susması gereken süre. */
  settleMs: 250,
  /** Yanıt bittikten sonra (ve dürtüden sonra) ana iş parçacığı bu kadar kesintisiz boştaysa → sonraki basamak (dürtü, yeniden gönder). */
  idleMs: 250,
  /** Yeniden gönderimden sonra bu kadar daha boşta ve adres eski → tam gezinme. */
  retryIdleMs: 1200,
  /** Hiç boşta ölçümü kurulamazsa (`IdleProbe.kind === "none"`): dürtü ve yeniden gönderim basamakları arasındaki süre. */
  quietMs: 800,
  /** Hiç boşta ölçümü kurulamazsa: yeniden gönderimden sonra tam gezinmeye dek beklenen süre. */
  retryQuietMs: 2000,
  /**
   * İnen JS parçası / CSS (`assetsLoading`) en çok bu kadar meşru bekleme
   * sayılır; sonra yok sayılır — takılan bir yükleme bekçiyi üst sınıra dek
   * susturmasın (tam yükleme onu yeniden ister).
   */
  chunkWaitMs: 3000,
  /** Yanıt hiç görünmese de (zaman damgası tamponu dolu, ağ çok yavaş) en geç burada tam gezinme. */
  hardLimitMs: 15000,
} as const;

/**
 * İki boşta geri çağrısı arasında bundan uzun ara = arada ana iş parçacığı
 * çalıştı (React'in zaman dilimli çizimi görevleri art arda kuyruğa koyar,
 * tarayıcı o sırada boşta dönemi AÇMAZ). Boştaki sayfada geri çağrılar en çok
 * ~50 ms arayla gelir.
 */
export const IDLE_GAP_MS = 120;

/**
 * `requestIdleCallback` olmayan tarayıcıda (WebKit) boşta YOKLAMASI (bkz.
 * `createIdleProbe`). Bir yoklama BOŞTA sayılır: zamanlayıcısı en çok
 * `lateMs` gecikti (arada uzun görev — React'in işlemesi — yok) VE gönderdiği
 * `MessageChannel` mesajı en çok `pingMs` bekledi (React'in 5 ms'lik çizim
 * dilimleri kuyrukta değil). Ölçüldü (WebKit 390, Chromium 4× CPU): çizim
 * sırasında mesaj 5-18 ms, boşta 0-2 ms bekliyor.
 */
export const TICK_PROBE = {
  intervalMs: 50,
  lateMs: 15,
  pingMs: 4,
  /** Zamanlayıcı geç KALMADAN bu kadar yoklamanın mesajı dönmezse kanal bozuk sayılır, yalnız gecikme ölçülür. */
  maxStalls: 3,
} as const;

/** Ana iş parçacığı boşta ölçümü — bkz. `createIdleProbe`. */
export interface IdleProbe {
  /**
   * `idle-callback`: `requestIdleCallback` (Chromium, Firefox); `ticks`:
   * yoklama (`TICK_PROBE`, WebKit); `none`: ölçüm kurulamadı — süre tabanlı
   * karar verilir.
   */
  readonly kind: "idle-callback" | "ticks" | "none";
  /** `false` = `kind === "none"`. */
  readonly supported: boolean;
  /** Şu ana dek kesintisiz boşta geçen süre (ms); şu an meşgulse 0. */
  idleFor(): number;
  /** Ölçümü sıfırlar (yeniden gönderimden sonra yeni boşta dönemi beklenir). */
  reset(): void;
  dispose(): void;
}

/**
 * ANA İŞ PARÇACIĞI BOŞTA MI (gezinme bekçisi, kök neden (b)). Tarayıcı boşta
 * dönemlerinde `requestIdleCallback` geri çağrısını çalıştırır; React bir
 * geçişi çizerken görevleri kesintisiz kuyruğa koyduğundan geri çağrılar
 * durur (yalnız zaman aşımıyla, `didTimeout` ile gelir). Ardışık geri çağrılar
 * `IDLE_GAP_MS`ten sık geliyorsa iş parçacığı o aralıkta boştu.
 * `requestIdleCallback` yoksa (WebKit) yoklama (`createTickProbe`), o da
 * kurulamazsa ölçüm yok (`kind: "none"`).
 */
export function createIdleProbe(win: Window | undefined = typeof window !== "undefined" ? window : undefined): IdleProbe {
  const w = win as (Window & { requestIdleCallback?: Window["requestIdleCallback"]; cancelIdleCallback?: Window["cancelIdleCallback"] }) | undefined;
  if (!w) return NO_IDLE_PROBE;
  if (typeof w.requestIdleCallback !== "function" || typeof w.cancelIdleCallback !== "function") {
    return createTickProbe(w);
  }
  let start: number | null = null;
  let last = Number.NEGATIVE_INFINITY;
  let handle: number | null = null;
  let alive = true;
  const tick = (deadline: IdleDeadline) => {
    if (!alive) return;
    const now = perfNow();
    if (deadline.didTimeout) start = null;
    else if (start === null || now - last > IDLE_GAP_MS) start = now;
    last = now;
    handle = w.requestIdleCallback!(tick, { timeout: 500 });
  };
  try {
    handle = w.requestIdleCallback(tick, { timeout: 500 });
  } catch {
    return createTickProbe(w);
  }
  return {
    kind: "idle-callback",
    supported: true,
    idleFor: () => {
      if (start === null) return 0;
      const now = perfNow();
      // Son geri çağrıdan bu yana uzun süre geçtiyse iş parçacığı ŞU AN meşgul.
      return now - last > IDLE_GAP_MS ? 0 : now - start;
    },
    reset: () => {
      start = null;
      last = Number.NEGATIVE_INFINITY;
    },
    dispose: () => {
      alive = false;
      if (handle !== null) {
        try {
          w.cancelIdleCallback!(handle);
        } catch {
          /* yok */
        }
      }
    },
  };
}

/** Ölçüm yok — bekçi süre tabanlı karar verir (`NAV_WATCHDOG.quietMs`). */
export const NO_IDLE_PROBE: IdleProbe = Object.freeze({
  kind: "none" as const,
  supported: false,
  idleFor: () => 0,
  reset: () => {},
  dispose: () => {},
});

/**
 * YOKLAMAYLA BOŞTA ÖLÇÜMÜ (WebKit; `TICK_PROBE`). Her `intervalMs`de bir
 * zamanlayıcı koşar ve kendine bir `MessageChannel` mesajı gönderir; mesaj
 * dönünce yoklamanın hükmü verilir (bkz. `TICK_PROBE`). Ardışık boşta
 * hükümler `IDLE_GAP_MS`ten sık geliyorsa iş parçacığı o aralıkta boştu —
 * `requestIdleCallback` yoklamasıyla aynı anlam (`idleFor`). Kanal yoksa ya da
 * bozulduysa yalnız zamanlayıcı gecikmesi ölçülür.
 */
function createTickProbe(w: Window): IdleProbe {
  if (typeof w.setTimeout !== "function" || typeof w.clearTimeout !== "function") return NO_IDLE_PROBE;
  const MC = (w as Window & { MessageChannel?: typeof MessageChannel }).MessageChannel;
  let channel: MessageChannel | null = null;
  try {
    channel = typeof MC === "function" ? new MC() : null;
  } catch {
    channel = null;
  }
  let start: number | null = null;
  let last = Number.NEGATIVE_INFINITY;
  let alive = true;
  let timer: number | null = null;
  let due = 0;
  let pingAt: number | null = null;
  let pingLate = false;
  let stalls = 0;
  // Her mesaj sıra numarası taşır: geç dönen ESKİ mesaj (bir aralık boyunca
  // dönmeyip sonra gelen) yeni yoklamanın hükmünü vermesin — yoksa yeni
  // mesajın gönderildiği andan ölçülür ve meşgul iş parçacığı boşta görünürdü.
  let seq = 0;

  const mark = (busy: boolean, at: number) => {
    if (busy) {
      start = null;
      return;
    }
    if (start === null || at - last > IDLE_GAP_MS) start = at;
    last = at;
  };
  const closeChannel = () => {
    if (!channel) return;
    try {
      channel.port1.onmessage = null;
      channel.port1.close();
      channel.port2.close();
    } catch {
      /* kapandı */
    }
    channel = null;
  };
  const onPong = (e: MessageEvent) => {
    if (!alive || pingAt === null || e.data !== seq) return;
    const now = perfNow();
    const waited = now - pingAt;
    pingAt = null;
    stalls = 0;
    mark(pingLate || waited > TICK_PROBE.pingMs, now);
  };
  const tick = () => {
    timer = null;
    if (!alive) return;
    const now = perfNow();
    const late = now - due > TICK_PROBE.lateMs;
    if (pingAt !== null) {
      // Önceki mesaj bir aralık boyunca dönmedi: arada iş vardı. Zamanlayıcı
      // geç kalmadan üst üste dönmüyorsa kanal bozuktur — yalnız gecikme ölçülür.
      pingAt = null;
      mark(true, now);
      if (!late && ++stalls >= TICK_PROBE.maxStalls) closeChannel();
    }
    if (channel) {
      pingLate = late;
      pingAt = perfNow();
      try {
        channel.port2.postMessage(++seq);
      } catch {
        pingAt = null;
        closeChannel();
        mark(late, now);
      }
    } else mark(late, now);
    due = perfNow() + TICK_PROBE.intervalMs;
    timer = w.setTimeout(tick, TICK_PROBE.intervalMs);
  };
  if (channel) channel.port1.onmessage = onPong;
  try {
    due = perfNow() + TICK_PROBE.intervalMs;
    timer = w.setTimeout(tick, TICK_PROBE.intervalMs);
  } catch {
    closeChannel();
    return NO_IDLE_PROBE;
  }
  return {
    kind: "ticks",
    supported: true,
    idleFor: () => {
      if (start === null) return 0;
      const now = perfNow();
      // Son boşta hükümden bu yana uzun süre geçtiyse yoklama durmuş: iş parçacığı ŞU AN meşgul.
      return now - last > IDLE_GAP_MS ? 0 : now - start;
    },
    reset: () => {
      start = null;
      last = Number.NEGATIVE_INFINITY;
    },
    dispose: () => {
      alive = false;
      if (timer !== null) {
        try {
          w.clearTimeout(timer);
        } catch {
          /* yok */
        }
      }
      timer = null;
      closeChannel();
    },
  };
}

/**
 * Tam gezinme — `push` geçmişe yazar (sayfa değişimi), `replace` yazmaz
 * (süzgeç değişimi; "geri" on kutucuk geri gitmesin). Testler `go`yu değiştirir.
 */
export const navFallback = {
  go(url: string, mode: NavMode): void {
    if (mode === "push") window.location.assign(url);
    else window.location.replace(url);
  },
};

/** Dürtü basamağının gözlemcisi (bkz. 1. basamak) — testler değiştirir; çalışma zamanında boş. */
export const navProbe: { onNudge(): void; idleProbe: (() => IdleProbe) | null } = {
  onNudge(): void {},
  /** Bekçinin boşta ölçümü — testler değiştirir (ör. hiç ölçüm yok); `null` = `createIdleProbe()`. */
  idleProbe: null,
};

/** `performance.now()` — ortam yoksa 0 (sunucu, eski jsdom). */
export function perfNow(): number {
  try {
    return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : 0;
  } catch {
    return 0;
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * İki adres aynı sayfa mı — köken + çözülmüş yol + sıralanmış sorgu. Next
 * adresi yazdığı gibi tutar, tarayıcı ise `,`/`%2C` gibi farkları korur;
 * metin karşılaştırması aynı adresi farklı sanardı. Parça (#) yok sayılır.
 */
export function sameUrl(a: string, b: string, base?: string): boolean {
  try {
    const origin = base ?? (typeof window !== "undefined" ? window.location.href : "http://localhost/");
    const x = new URL(a, origin);
    const y = new URL(b, origin);
    if (x.origin !== y.origin) return false;
    if (safeDecode(x.pathname).replace(/\/+$/, "") !== safeDecode(y.pathname).replace(/\/+$/, "")) return false;
    const qx = new URLSearchParams(x.search);
    const qy = new URLSearchParams(y.search);
    qx.sort();
    qy.sort();
    return qx.toString() === qy.toString();
  } catch {
    return false;
  }
}

/** Tarayıcı şu an bu adreste mi (yol + sorgu). */
export function locationIs(url: string): boolean {
  if (typeof window === "undefined") return false;
  return sameUrl(window.location.href, url);
}

/** Şu anki adres (yol + sorgu) — "kullanıcı başka yere mi gitti" denetimi için. */
export function currentHref(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}

/** Süzgeç gezinmesinde korunan sayfa kaydırması (bkz. başlık, 3. iş). */
export interface ScrollKeep {
  /**
   * Bekleyen hedeflerin DIŞ adresleri (yol + sorgu), tık sırasıyla: konum
   * yalnız bunlardan biri işlenince geri konur. Art arda tıklarda önceki hedef
   * sonrakinden önce işlenebilir (Next onda da kaydırır) — hepsi tutulur.
   */
  urls: string[];
  x: number;
  y: number;
  /** Yakalandığı an (`Date.now`). */
  at: number;
  /**
   * Yakalandığı andaki `history.state`. Next her işlemede geçmiş kaydını
   * yeniden yazar (yeni nesne); hedef şu anki adresle aynıysa (kutucuğu
   * işaretleyip hemen geri almak) "işlendi" kararı buna bakar.
   */
  state: unknown;
}

/** Bundan eski koruma yok sayılır: hiç işlenmeyen gezinmenin konumu sonradan dayatılmasın. */
export const SCROLL_KEEP_TTL_MS = NAV_WATCHDOG.hardLimitMs;

function historyState(): unknown {
  try {
    return window.history.state;
  } catch {
    return null;
  }
}

/**
 * Gezinmeden ÖNCEKİ sayfa konumu — `url` (ya da hâlâ bekleyen önceki hedefler)
 * işlenince geri konur. Konum her zaman ŞU ANKİ konumdur (önceki hedef
 * işlendiyse o zaten geri konmuştur).
 */
export function captureScroll(url: string, pending?: ScrollKeep | null): ScrollKeep | null {
  if (typeof window === "undefined") return null;
  const now = Date.now();
  const urls = pending && now - pending.at <= SCROLL_KEEP_TTL_MS ? [...pending.urls.filter((u) => u !== url), url] : [url];
  return { urls, x: window.scrollX || 0, y: window.scrollY || 0, at: now, state: historyState() };
}

/**
 * Korumanın hedeflerinden biri İŞLENDİ mi (adres o hedefte VE geçmiş kaydı
 * yakalamadan beri yeniden yazıldı). İşlendiyse geri konacak konum ve
 * (sonraki tıkların hedefleri hâlâ bekliyorsa) kalan koruma; değilse `null`.
 */
export function takeCommittedKeep(keep: ScrollKeep): { restore: ScrollKeep; rest: ScrollKeep | null } | null {
  if (typeof window === "undefined") return null;
  const state = historyState();
  if (state === keep.state) return null;
  const i = keep.urls.findIndex((u) => locationIs(u));
  if (i < 0) return null;
  const rest = keep.urls.slice(i + 1);
  return {
    restore: { ...keep, urls: keep.urls.slice(0, i + 1) },
    rest: rest.length ? { ...keep, urls: rest, state } : null,
  };
}

/** Kullanıcının kendi kaydırma girişi — geri koyma bunlardan birini görünce durur. */
const USER_SCROLL_INPUTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * HEDEF İŞLENİRKEN KONUMU GERİ KOY. Kabuğun yerleşim efektinden, hedef adres
 * işlendiği an çağrılır. Next'in kaydırması (bkz. başlık, 3. iş) AYNI
 * işlemenin sonunda gelir — sayfa kesiminin `componentDidUpdate`i kabuğun
 * efektinden SONRA koşar (React önce çocukların efektlerini çalıştırır) — bu
 * yüzden geri koyma bir mikro görevde: işleme biter bitmez, tarayıcı
 * boyamadan önce (atlama görünmez). Bir sonraki karede sayfa yine en baştaysa
 * bir kez daha konur; kullanıcı o arada kaydırdıysa / tuşa bastıysa dokunulmaz.
 * Konum zaten yerindeyse hiçbir şey yazılmaz. Dönen fonksiyon iptal eder.
 */
export function restoreScrollAfterCommit(keep: ScrollKeep, win: Window = window): () => void {
  let cancelled = false;
  let userMoved = false;
  let frame: number | null = null;
  const onInput = () => {
    userMoved = true;
  };
  const cleanup = () => {
    for (const t of USER_SCROLL_INPUTS) win.removeEventListener(t, onInput, true);
  };
  const restore = () => {
    if (cancelled || userMoved) return;
    if (Math.abs(win.scrollY - keep.y) < 1 && Math.abs(win.scrollX - keep.x) < 1) return;
    try {
      win.scrollTo(keep.x, keep.y);
    } catch {
      /* jsdom / eski tarayıcı */
    }
  };
  for (const t of USER_SCROLL_INPUTS) win.addEventListener(t, onInput, { capture: true, passive: true });
  const later = typeof queueMicrotask === "function" ? queueMicrotask : (cb: () => void) => void Promise.resolve().then(cb);
  later(() => {
    restore();
    if (cancelled) return;
    if (typeof win.requestAnimationFrame !== "function") return cleanup();
    frame = win.requestAnimationFrame(() => {
      frame = null;
      // Yalnız Next'in imzası: sayfa en başa atıldı (içerik kısaldıysa tarayıcının sınırlaması kalır).
      if (win.scrollY < 1 && keep.y >= 1) restore();
      cleanup();
    });
  });
  return () => {
    cancelled = true;
    if (frame !== null) {
      try {
        win.cancelAnimationFrame(frame);
      } catch {
        /* yok */
      }
    }
    cleanup();
  };
}

/**
 * Gezinmenin işlenmesini BEKLETEMEYECEK kaynak — "ağ sakin mi" hesabına girmez
 * (WebKit ölçümü, mobil denetim r2-filter-hang 2026-10-15: sayfa kaydırılınca
 * inen ürün görselleri ve üst çubuk bağlantılarının ön-getirmeleri kayıp
 * uyandırmanın dürtüsünü yüzlerce ms erteliyordu):
 *  - görsel (`<img>`, `/_next/image`): React bu sürümde işlemeyi yalnız stil
 *    dosyası için bekletir, görsel için değil;
 *  - işaret isteği (`sendBeacon`, `<a ping>`);
 *  - BAŞKA adresin `_rsc` isteği (bağlantı ön-getirmesi) — hedefin kendi
 *    yanıtı ayrıca aranır.
 * JS parçası, stil dosyası, API isteği ve tanınmayan her kaynak SAYILIR.
 */
const NON_BLOCKING_INITIATORS = new Set(["img", "image", "imageset", "beacon", "ping"]);
function resourceRole(e: PerformanceResourceTiming, url: string): "target" | "ignore" | "other" {
  if (NON_BLOCKING_INITIATORS.has(e.initiatorType ?? "")) return "ignore";
  let u: URL;
  try {
    u = new URL(e.name);
  } catch {
    return "other";
  }
  if (u.searchParams.has("_rsc")) {
    u.searchParams.delete("_rsc");
    return sameUrl(u.href, url) ? "target" : "ignore";
  }
  return u.pathname.startsWith("/_next/image") ? "ignore" : "other";
}

/**
 * Hedefin RSC yanıtı geldi mi ve ağ ne zaman SAKİN sayılacak (Resource
 * Timing): `sincePerf`ten sonra başlayan bir `_rsc=` isteği hedef adrese
 * (parametre atılınca) eşit ve bitmiş olmalı; ayrıca o andan sonra başlayan,
 * geçişi bekletebilecek HİÇBİR kaynak (yeni rotanın JS parçaları, stil, API;
 * bkz. `resourceRole`) son `settleMs` içinde bitmemiş olmalı — yavaş ağda
 * yanıt gelmiş ama parçalar hâlâ iniyorsa geçiş meşru biçimde bekliyordur.
 * Dönüş: `null` = hedefin yanıtı henüz görülmedi (ya da ölçüm yok — karar
 * üst sınıra kalır); sayı = ağın sakin sayılmasına kalan süre (ms, 0 = sakin).
 * Bekçi bir sonraki denetimini buna göre kurar (yoklama aralığını beklemez).
 */
export function rscSettleWait(url: string, sincePerf: number, settleMs: number = NAV_WATCHDOG.settleMs): number | null {
  try {
    if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") return null;
    const now = perfNow();
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    let found = false;
    let lastEnd = 0;
    for (const e of entries) {
      if (e.startTime < sincePerf || !e.responseEnd) continue;
      const role = resourceRole(e, url);
      if (role === "ignore") continue;
      if (e.responseEnd > lastEnd) lastEnd = e.responseEnd;
      if (role === "target") found = true;
    }
    if (!found) return null;
    return Math.max(0, settleMs - (now - lastEnd));
  } catch {
    /* zaman ölçümü yok — üst sınır karar verir */
  }
  return null;
}

/** Hedefin RSC yanıtı geldi ve ağ SAKİN mi — `rscSettleWait(...) === 0`. */
export function rscArrived(url: string, sincePerf: number, settleMs: number = NAV_WATCHDOG.settleMs): boolean {
  return rscSettleWait(url, sincePerf, settleMs) === 0;
}

/**
 * Yeni rotanın JS parçası ya da CSS'i şu an iniyor mu. Webpack parça betiğini
 * `data-webpack` öznitelikli `<script>` olarak ekler ve yüklenince/düşünce
 * kaldırır; React yeni stil dosyasını yüklenene dek işlemeyi bekletir
 * (`<link rel=stylesheet>` henüz `sheet`siz). Bu sürede geçiş meşru biçimde
 * bekler (işlemci boşta, Resource Timing'de kayıt henüz yok) — bekçi bunu
 * takılma saymaz.
 */
export function assetsLoading(doc: Document | undefined = typeof document !== "undefined" ? document : undefined): boolean {
  try {
    if (!doc) return false;
    if (doc.querySelector("script[data-webpack]")) return true;
    // Yalnız uygulamanın kendi stil dosyaları (yüklenemeyen yabancı bir dosya bekçiyi oyalamasın).
    for (const l of doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="/_next/"]')) {
      if (!l.sheet && !l.disabled) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Hedefin RSC yanıtı BİTTİĞİ AN haber ver (`PerformanceObserver`, Resource
 * Timing). Bekçi yoklamayı beklemeden denetimi öne çeker — kayıp uyandırmada
 * (kök neden (a)) toparlanma yanıtın bitişinden ölçülür. Gözlemci yoksa
 * (eski tarayıcı, jsdom) hiçbir şey yapmaz; yoklama yedektir.
 */
export function observeRscEnd(url: string, sincePerf: number, onEnd: () => void): () => void {
  try {
    if (typeof PerformanceObserver === "undefined") return () => {};
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceResourceTiming[]) {
        if (e.startTime < sincePerf || !e.responseEnd) continue;
        let u: URL;
        try {
          u = new URL(e.name);
        } catch {
          continue;
        }
        if (!u.searchParams.has("_rsc")) continue;
        u.searchParams.delete("_rsc");
        if (sameUrl(u.href, url)) {
          onEnd();
          return;
        }
      }
    });
    po.observe({ type: "resource" });
    return () => po.disconnect();
  } catch {
    return () => {};
  }
}

/** Zaman ölçümü tamponunun büyüyebileceği üst sınır (kayıt sayısı). */
export const RESOURCE_TIMING_MAX = 2000;
let resourceTimingLimit = 250;
let resourceTimingHooked = false;

/**
 * Zaman ölçümü tamponu dolunca büyütür. Tarayıcı varsayılanı 250 kayıt; dolu
 * tampona yeni kayıt YAZILMAZ ve `rscArrived` hedefin yanıtını hiç göremez —
 * görsel ağırlıklı sonuç sayfalarında birkaç süzgeç tıkından sonra bekçi ilk
 * denetimi kaybedip üst sınırı (15 sn) beklerdi. Olay işleyicisinde boyut
 * artırılınca ikincil tampondaki kayıtlar da aktarılır. Sayfa başına bir kez.
 */
export function keepResourceTimingRoom(max: number = RESOURCE_TIMING_MAX): void {
  if (resourceTimingHooked) return;
  try {
    if (
      typeof performance === "undefined" ||
      typeof performance.addEventListener !== "function" ||
      typeof performance.setResourceTimingBufferSize !== "function"
    ) {
      return;
    }
    resourceTimingHooked = true;
    performance.addEventListener("resourcetimingbufferfull", () => {
      if (resourceTimingLimit >= max) return;
      resourceTimingLimit = Math.min(max, resourceTimingLimit * 2);
      performance.setResourceTimingBufferSize(resourceTimingLimit);
    });
  } catch {
    /* zaman ölçümü yok — karar üst sınıra kalır */
  }
}

/** Çekmeceyi yeniden açma işareti — yol değiştiren gezinmeden önce yazılır. */
export const DRAWER_REOPEN_KEY = "rothern.filters.reopenDrawer";
/** İşaret bu kadar yaşlıysa yok sayılır (başka bir ziyarette çekmece kendiliğinden açılmasın). */
export const DRAWER_REOPEN_TTL_MS = 20_000;

/**
 * Yeniden açılırken geri yüklenecek kaydırma konumları (bekçinin TAM
 * gezinmesi; mobil denetim g02-01 doğrulaması: tam yüklemeden sonra çekmece
 * en başa, sayfa `scrollY` 0'a dönüyordu). Rota değiştiren süzgeç gezinmesi
 * konum taşımaz — yeni rotanın sonuçları baştan okunur.
 */
export interface DrawerReopen {
  /** Çekmece açık başlasın mı (bekçinin tam gezinmesi çekmece kapalıyken yalnız sayfa konumunu taşır). */
  open: boolean;
  /** Sayfanın dikey kaydırması (px). */
  page: number;
  /** Çekmece gövdesinin dikey kaydırması (px). */
  drawer: number;
}

const scrollValue = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/** `path`: hedefin İÇ yolu (sorgusuz) — yalnız o yolda bağlanan kabuk işareti kullanır. */
export function markDrawerReopen(path: string, state?: Partial<DrawerReopen>): void {
  try {
    window.sessionStorage.setItem(
      DRAWER_REOPEN_KEY,
      JSON.stringify({
        path,
        at: Date.now(),
        open: state?.open ?? true,
        page: scrollValue(state?.page),
        drawer: scrollValue(state?.drawer),
      }),
    );
  } catch {
    /* depolama yok — çekmece eskisi gibi kapalı açılır */
  }
}

/** Kullanıcı çekmeceyi kapattı — bekleyen işaret düşer (yeni rotada kendiliğinden açılmasın). */
export function clearDrawerReopen(): void {
  try {
    window.sessionStorage.removeItem(DRAWER_REOPEN_KEY);
  } catch {
    /* depolama yok */
  }
}

/**
 * İşareti TÜKETİR (her durumda siler); yol tutuyor ve taze ise çekmecenin
 * açıklığı ve geri yüklenecek kaydırma konumları (eski biçimli işarette açık +
 * 0 konum), değilse `null`.
 */
export function takeDrawerReopen(path: string): DrawerReopen | null {
  try {
    const raw = window.sessionStorage.getItem(DRAWER_REOPEN_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(DRAWER_REOPEN_KEY);
    const v = JSON.parse(raw) as { path?: unknown; at?: unknown; open?: unknown; page?: unknown; drawer?: unknown };
    const age = typeof v.at === "number" ? Date.now() - v.at : Number.POSITIVE_INFINITY;
    if (v.path !== path || age < 0 || age >= DRAWER_REOPEN_TTL_MS) return null;
    return { open: v.open !== false, page: scrollValue(v.page), drawer: scrollValue(v.drawer) };
  } catch {
    return null;
  }
}
