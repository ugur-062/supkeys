// @vitest-environment jsdom
/**
 * SÜZGEÇ KABUĞU — gezinme bekçisi (mobil denetim g02-public-marketplace-01)
 * ve rota değişiminde açık kalan çekmece (g02-public-marketplace-10).
 *
 * Gerçek Next'te takılan geçiş: `router.push` sözü hiç çözülmez, `isPending`
 * açık kalır, adres değişmez. Sahte yönlendirici bunu çözülmeyen sözle taklit
 * eder; bekçi süreleri sahte saatle ilerletilir, yeniden gönderim sahte
 * `push` çağrılarından, tam gezinme `navFallback.go` üzerinden gözlenir (jsdom
 * gerçek gezinme yapmaz). Ana iş parçacığının boşta ölçümü sahte
 * `requestIdleCallback` (`fakeIdle`, Chromium) ya da sahte `MessageChannel`
 * yoklaması (`fakeTicks`, WebKit) ile sürülür; varsayılan "ölçüm yok"
 * (`NO_IDLE_PROBE` → süre tabanlı yol). Kaydırma koruması (`keepRef`) için
 * sayfa konumu sahte `scrollY` + `scrollTo` ile, Next'in işleme anındaki
 * "başa at"ı kabuğun ÜSTÜNDEKİ bir bileşenin yerleşim efektiyle taklit edilir
 * (gerçekte sayfa kesiminin `componentDidUpdate`i — çocuklardan sonra koşar).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useLayoutEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/urunler", search: "", push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, prefetch: nav.prefetch }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => nav.pathname,
}));

import { FilterShell, MobileFilterButton, useFilters } from "../filter-shell";
import {
  DRAWER_REOPEN_KEY,
  IDLE_GAP_MS,
  NAV_WATCHDOG,
  NO_IDLE_PROBE,
  SCROLL_KEEP_TTL_MS,
  TICK_PROBE,
  assetsLoading,
  captureScroll,
  createIdleProbe,
  markDrawerReopen,
  navFallback,
  navProbe,
  observeRscEnd,
  restoreScrollAfterCommit,
  rscArrived,
  rscSettleWait,
  sameUrl,
  takeCommittedKeep,
  takeDrawerReopen,
} from "../filter-shell-nav";
import type { ProductFilterState } from "@/lib/public/product-filter-params";

let ctx: ReturnType<typeof useFilters<ProductFilterState>> | null = null;
function Probe() {
  ctx = useFilters<ProductFilterState>();
  return null;
}

const go = vi.fn();
const realGo = navFallback.go;
const nudged = vi.fn();
const realNudge = navProbe.onNudge;
let finishers: Array<() => void> = [];
let entries: Array<Partial<PerformanceResourceTiming>> = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  nav.pathname = "/urunler";
  nav.search = "";
  nav.push.mockReset();
  nav.replace.mockReset();
  nav.prefetch.mockReset();
  finishers = [];
  entries = [];
  // Takılan geçiş: söz test sonunda çözülür (açık söz sonraki testleri bekletirdi).
  const hang = () => new Promise<void>((r) => finishers.push(r));
  nav.push.mockImplementation(hang);
  nav.replace.mockImplementation(hang);
  go.mockReset();
  navFallback.go = go;
  nudged.mockReset();
  navProbe.onNudge = nudged;
  // Varsayılan: ölçüm yok (süre tabanlı yol); `fakeIdle` / `fakeTicks` gerçek ölçümü açar.
  navProbe.idleProbe = () => NO_IDLE_PROBE;
  ctx = null;
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/urunler");
  // Zaman ölçümü sahte saatle aynı eksende (bekçi `performance.now` okur).
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
  vi.spyOn(performance, "getEntriesByType").mockImplementation(((type: string) =>
    type === "resource" ? (entries as PerformanceEntry[]) : []) as typeof performance.getEntriesByType);
});

afterEach(async () => {
  await act(async () => finishers.forEach((f) => f()));
  vi.unstubAllGlobals();
  observers = [];
  const w = window as unknown as { requestIdleCallback?: unknown; cancelIdleCallback?: unknown };
  delete w.requestIdleCallback;
  delete w.cancelIdleCallback;
  (window as unknown as { MessageChannel?: unknown }).MessageChannel = realMessageChannel;
  page.restore();
  navFallback.go = realGo;
  navProbe.onNudge = realNudge;
  navProbe.idleProbe = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const realMessageChannel = (window as unknown as { MessageChannel?: unknown }).MessageChannel;

/**
 * Sahte sayfa kaydırması (jsdom yerleşim yapmaz): `scrollY` okunur/yazılır,
 * `scrollTo` onu değiştirir ve `scroll` olayı yayar (tarayıcıdaki gibi sonra).
 */
const page = (() => {
  let y = 0;
  let installed = false;
  let yDesc: PropertyDescriptor | undefined;
  let xDesc: PropertyDescriptor | undefined;
  return {
    install(start = 0) {
      y = start;
      if (!installed) {
        yDesc = Object.getOwnPropertyDescriptor(window, "scrollY");
        xDesc = Object.getOwnPropertyDescriptor(window, "scrollX");
        Object.defineProperty(window, "scrollY", { configurable: true, get: () => y });
        Object.defineProperty(window, "scrollX", { configurable: true, get: () => 0 });
        installed = true;
      }
      return vi.spyOn(window, "scrollTo").mockImplementation(((a: number | ScrollToOptions, b?: number) => {
        y = typeof a === "number" ? (b ?? 0) : (a.top ?? y);
      }) as typeof window.scrollTo);
    },
    /** Kullanıcı kaydırması: konum değişir ve `scroll` olayı yayılır. */
    userScroll(to: number) {
      y = to;
      window.dispatchEvent(new Event("scroll"));
    },
    /** Next'in `documentElement.scrollTop = 0`ı (olay yok — olay sonradan gelir). */
    jumpTop() {
      y = 0;
    },
    get y() {
      return y;
    },
    restore() {
      if (!installed) return;
      if (yDesc) Object.defineProperty(window, "scrollY", yDesc);
      else delete (window as unknown as { scrollY?: unknown }).scrollY;
      if (xDesc) Object.defineProperty(window, "scrollX", xDesc);
      else delete (window as unknown as { scrollX?: unknown }).scrollX;
      installed = false;
    },
  };
})();

function renderShell() {
  return render(
    <FilterShell basePath="/urunler" total={0} pushFilters drawer={<p>çekmece içeriği</p>}>
      <Probe />
      <MobileFilterButton />
    </FilterShell>,
  );
}

// Test bağlantıları düz <a>: Next `Link` jsdom'da gezinmeye çalışırdı; gezinmeyi
// `preventDefault` taklit eder (Link'in istemci gezinmesi gibi).
const NEXT_PAGE = "/urunler?sayfa=2";
const OTHER_PAGE = "/hakkimizda";

/** Hedefin RSC yanıtı `ago` ms önce bitmiş gibi bir Resource Timing kaydı (istek 150 ms sürmüş). */
function rscEntry(url: string, ago = NAV_WATCHDOG.settleMs + 50) {
  const now = performance.now();
  entries.push({ name: `http://localhost:3000${url}${url.includes("?") ? "&" : "?"}_rsc=abc`, startTime: now - ago - 150, responseEnd: now - ago });
}

/** Sahte `PerformanceObserver`: testler `emitResource` ile "yanıt bitti" kaydı yayar. */
let observers: Array<(list: { getEntries: () => PerformanceEntry[] }) => void> = [];
function fakePerformanceObserver() {
  class FakePO {
    cb: (list: { getEntries: () => PerformanceEntry[] }) => void;
    constructor(cb: (list: { getEntries: () => PerformanceEntry[] }) => void) {
      this.cb = cb;
    }
    observe() {
      observers.push(this.cb);
    }
    disconnect() {
      observers = observers.filter((o) => o !== this.cb);
    }
  }
  vi.stubGlobal("PerformanceObserver", FakePO);
}
function emitResource(entry: Partial<PerformanceResourceTiming>) {
  entries.push(entry);
  for (const o of [...observers]) o({ getEntries: () => [entry as PerformanceEntry] });
}

/**
 * Sahte boşta ölçümü: `idle` — tarayıcı her 30 ms'de bir boşta dönemi açar
 * (sayfa boşta); `busy` — geri çağrı yalnız zaman aşımıyla gelir (React
 * çiziyor, görevler art arda).
 */
function fakeIdle(mode: "idle" | "busy") {
  navProbe.idleProbe = null;
  const w = window as unknown as { requestIdleCallback?: unknown; cancelIdleCallback?: unknown };
  w.requestIdleCallback = (cb: IdleRequestCallback) =>
    setTimeout(
      () => cb({ didTimeout: mode === "busy", timeRemaining: () => (mode === "idle" ? 40 : 0) } as IdleDeadline),
      mode === "idle" ? 30 : 500,
    ) as unknown as number;
  w.cancelIdleCallback = (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
}

/**
 * WebKit benzeri ortam: `requestIdleCallback` yok, yoklama (`TICK_PROBE`)
 * sahte `MessageChannel` ile. Mesaj sahte saatte `ping()` ms sonra döner —
 * boşta 1 ms, React çizerken (5 ms'lik dilimlerin arkasında) 8 ms; `null` =
 * mesaj hiç dönmez (bozuk kanal).
 */
function fakeTicks(ping: () => number | null) {
  navProbe.idleProbe = null;
  class FakeChannel {
    port1: { onmessage: ((e: unknown) => void) | null; close: () => void } = { onmessage: null, close: () => {} };
    port2 = {
      postMessage: (data: unknown) => {
        const d = ping();
        if (d === null) return;
        setTimeout(() => this.port1.onmessage?.({ data }), d);
      },
      close: () => {},
    };
  }
  (window as unknown as { MessageChannel?: unknown }).MessageChannel = FakeChannel;
}

/**
 * Sahte saati `step` ms adımlarla ilerletir; `done()` doğru olunca o anı
 * (sahte `Date.now`) döner — bekçinin basamaklarının ANINI ölçmek için.
 */
async function advanceUntil(done: () => boolean, max: number, step = 5): Promise<number> {
  for (let waited = 0; waited <= max; waited += step) {
    if (done()) return Date.now();
    await act(async () => vi.advanceTimersByTime(step));
  }
  throw new Error(`koşul ${max} ms içinde gerçekleşmedi`);
}

describe("gezinme bekçisi (g02-01)", () => {
  it("gezinme Next'in olağan yolundan gider (ön-getirme ya da ek istek yok)", () => {
    renderShell();
    act(() => ctx!.update({ verified: true }));
    expect(nav.push).toHaveBeenCalledWith("/urunler?dogrulanmis=1", { scroll: false });
    expect(nav.prefetch).not.toHaveBeenCalled();
  });

  it("geçiş takıldı, RSC yanıtı geldi (hiç boşta ölçümü kurulamadı): önce DÜRTÜ, sonra AYNI gezinme yeniden, o da işlenmezse TAM gezinme", async () => {
    renderShell();
    act(() => ctx!.update({ verified: true }));
    expect(ctx!.isPending).toBe(true);
    expect(nav.push).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(700));
    rscEntry("/urunler?dogrulanmis=1");
    // İlk denetim yanıtın geldiğini görür; ölçüm yok → `quietMs` beklenir.
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.firstCheckMs - 700));
    const arrived = Date.now();
    expect(nudged).not.toHaveBeenCalled();
    // 1. basamak: dürtü (yönlendiriciye dokunmaz) — tam `quietMs` sonra; denetim
    // koşulun dolacağı ana kurulur, bir yoklama aralığı fazladan beklenmez.
    const nudgeAt = await advanceUntil(() => nudged.mock.calls.length > 0, NAV_WATCHDOG.quietMs + NAV_WATCHDOG.recheckMs);
    expect(nudgeAt - arrived).toBeGreaterThanOrEqual(NAV_WATCHDOG.quietMs);
    expect(nudgeAt - arrived).toBeLessThanOrEqual(NAV_WATCHDOG.quietMs + NAV_WATCHDOG.wakeSlackMs + 5);
    expect(nudged).toHaveBeenCalledTimes(1);
    expect(nav.push).toHaveBeenCalledTimes(1);
    // 2. basamak: aynı gezinme yeniden.
    const retryAt = await advanceUntil(() => nav.push.mock.calls.length > 1, NAV_WATCHDOG.quietMs + NAV_WATCHDOG.recheckMs);
    expect(retryAt - nudgeAt).toBeGreaterThanOrEqual(NAV_WATCHDOG.quietMs);
    expect(retryAt - nudgeAt).toBeLessThanOrEqual(NAV_WATCHDOG.quietMs + NAV_WATCHDOG.wakeSlackMs + 5);
    expect(nav.push).toHaveBeenCalledTimes(2);
    expect(nav.push).toHaveBeenLastCalledWith("/urunler?dogrulanmis=1", { scroll: false });
    expect(go).not.toHaveBeenCalled();
    // 3. basamak: `retryQuietMs` sonra tam gezinme.
    const failAt = await advanceUntil(() => go.mock.calls.length > 0, NAV_WATCHDOG.retryQuietMs + NAV_WATCHDOG.recheckMs);
    expect(failAt - retryAt).toBeGreaterThanOrEqual(NAV_WATCHDOG.retryQuietMs);
    expect(failAt - retryAt).toBeLessThanOrEqual(NAV_WATCHDOG.retryQuietMs + NAV_WATCHDOG.wakeSlackMs + 5);
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith("/urunler?dogrulanmis=1", "push");
  });

  it("işlemci boştayken (geçiş gerçekten takıldı): dürtü ilk denetimde, yeniden gönderim `idleMs` sonra, tam gezinme `retryIdleMs` sonra", async () => {
    fakeIdle("idle");
    renderShell();
    act(() => ctx!.update({ verified: true }));
    await act(async () => vi.advanceTimersByTime(700));
    rscEntry("/urunler?dogrulanmis=1");
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.firstCheckMs - 700 + 10));
    // İlk denetimde: yanıt geldi, ağ sustu, işlemci `idleMs`ten uzun süredir boşta.
    expect(nudged).toHaveBeenCalledTimes(1);
    expect(nav.push).toHaveBeenCalledTimes(1);
    const nudgeAt = Date.now() - 10;
    // Dürtüden sonra boşta süresi baştan birikir; eşik dolunca (yoklama aralığını beklemeden) yeniden gönderim.
    const retryAt = await advanceUntil(() => nav.push.mock.calls.length > 1, NAV_WATCHDOG.idleMs + NAV_WATCHDOG.recheckMs * 2);
    expect(retryAt - nudgeAt).toBeGreaterThanOrEqual(NAV_WATCHDOG.idleMs);
    expect(retryAt - nudgeAt).toBeLessThanOrEqual(NAV_WATCHDOG.idleMs + 100);
    expect(go).not.toHaveBeenCalled();
    const failAt = await advanceUntil(() => go.mock.calls.length > 0, NAV_WATCHDOG.retryIdleMs + NAV_WATCHDOG.recheckMs * 2);
    expect(failAt - retryAt).toBeGreaterThanOrEqual(NAV_WATCHDOG.retryIdleMs);
    expect(failAt - retryAt).toBeLessThanOrEqual(NAV_WATCHDOG.retryIdleMs + 100);
    expect(go).toHaveBeenCalledWith("/urunler?dogrulanmis=1", "push");
  });

  it("yanıtın BİTTİĞİ an gözlenir: takılan geçiş ilk yoklamayı beklemeden ~`settleMs` sonra dürtülür", async () => {
    fakeIdle("idle");
    fakePerformanceObserver();
    renderShell();
    act(() => ctx!.update({ verified: true }));
    await act(async () => vi.advanceTimersByTime(300));
    const now = performance.now();
    // Başka bir kaynağın bitişi denetimi öne çekmez.
    emitResource({ name: "http://localhost:3000/_next/static/chunks/a.js", startTime: now - 100, responseEnd: now - 80 });
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.settleMs + 40));
    expect(nudged).not.toHaveBeenCalled();
    emitResource({ name: "http://localhost:3000/urunler?dogrulanmis=1&_rsc=abc", startTime: now - 50, responseEnd: performance.now() });
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.settleMs + 40));
    expect(nudged).toHaveBeenCalledTimes(1);
    expect(performance.now()).toBeLessThan(NAV_WATCHDOG.firstCheckMs + (now - 300));
    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
  });

  it("dürtü yalnız boş yaprağı yeniden çizer: süzgeç bağlamının tüketicileri çizilmez", async () => {
    fakeIdle("idle");
    let renders = 0;
    function Counter() {
      useFilters();
      renders++;
      return null;
    }
    const realOnNudge = navProbe.onNudge;
    render(
      <FilterShell basePath="/urunler" total={0} pushFilters>
        <Probe />
        <Counter />
      </FilterShell>,
    );
    act(() => ctx!.update({ verified: true }));
    await act(async () => vi.advanceTimersByTime(700));
    rscEntry("/urunler?dogrulanmis=1");
    const before = renders;
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.firstCheckMs - 700 + 10));
    expect(nudged).toHaveBeenCalledTimes(1);
    expect(renders).toBe(before);
    navProbe.onNudge = realOnNudge;
  });

  it("yanıt geldi ama işlemci MEŞGUL (yavaş cihazda React hâlâ çiziyor): yeniden gönderim ve tam gezinme YOK, en geç üst sınır", async () => {
    fakeIdle("busy");
    renderShell();
    act(() => ctx!.update({ verified: true }));
    await act(async () => vi.advanceTimersByTime(700));
    rscEntry("/urunler?dogrulanmis=1");
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.hardLimitMs - 700 - 500));
    expect(nudged).not.toHaveBeenCalled();
    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1000));
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("WebKit (requestIdleCallback yok): yoklama boşta görür → kayıp uyandırma yanıtın bitiminden ~0,3 sn sonra dürtülür (eski süre tabanlı yolda 1,4-1,9 sn)", async () => {
    fakeTicks(() => 1);
    fakePerformanceObserver();
    renderShell();
    act(() => ctx!.update({ verified: true }));
    await act(async () => vi.advanceTimersByTime(400));
    const end = performance.now();
    emitResource({ name: "http://localhost:3000/urunler?dogrulanmis=1&_rsc=abc", startTime: end - 300, responseEnd: end });
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.settleMs + 40));
    expect(nudged).toHaveBeenCalledTimes(1);
    expect(performance.now() - end).toBeLessThan(600);
    expect(nav.push).toHaveBeenCalledTimes(1);
    // Dürtü işe yaramazsa: `idleMs` boşta sonra aynı gezinme, `retryIdleMs` sonra tam gezinme.
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.idleMs + NAV_WATCHDOG.recheckMs * 2));
    expect(nav.push).toHaveBeenCalledTimes(2);
    expect(nav.push).toHaveBeenLastCalledWith("/urunler?dogrulanmis=1", { scroll: false });
    expect(go).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.retryIdleMs + NAV_WATCHDOG.recheckMs * 2));
    expect(go).toHaveBeenCalledWith("/urunler?dogrulanmis=1", "push");
  });

  it("WebKit (r2-filter-hang): React yanıtı işleyip ~70 ms sonra boşalınca dürtü eşik dolduğu an gelir — bir yoklama aralığı daha beklenmez", async () => {
    let busy = true;
    fakeTicks(() => (busy ? 9 : 1));
    fakePerformanceObserver();
    renderShell();
    act(() => ctx!.update({ verified: true }));
    await act(async () => vi.advanceTimersByTime(400));
    const end = performance.now();
    emitResource({ name: "http://localhost:3000/urunler?dogrulanmis=1&_rsc=abc", startTime: end - 300, responseEnd: end });
    // React yanıtın son satırlarını ~70 ms işler; sonra iş parçacığı boşta (kayıp uyandırma).
    await act(async () => vi.advanceTimersByTime(70));
    busy = false;
    const at = await advanceUntil(() => nudged.mock.calls.length > 0, 1000);
    // Boşta eşiği (`idleMs`) dolmadan dürtü yok; dolunca hemen. Sabit 250 ms'lik
    // yoklamada ilk denetim (~yanıt + 270 ms) eşiğin altında kalır, dürtü ~yanıt + 520 ms'ye kalırdı.
    expect(at - end).toBeGreaterThanOrEqual(70 + NAV_WATCHDOG.idleMs);
    expect(at - end).toBeLessThan(70 + NAV_WATCHDOG.idleMs + TICK_PROBE.intervalMs + NAV_WATCHDOG.wakeSlackMs + 10);
    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
  });

  it("görsel, işaret isteği ve başka adresin ön-getirmesi 'ağ sakin' kararını ERTELEMEZ; yeni JS parçası erteler", async () => {
    fakeIdle("idle");
    fakePerformanceObserver();
    renderShell();
    act(() => ctx!.update({ verified: true }));
    await act(async () => vi.advanceTimersByTime(300));
    const end = performance.now();
    emitResource({ name: "http://localhost:3000/urunler?dogrulanmis=1&_rsc=abc", startTime: end - 200, responseEnd: end });
    // Yanıttan sonra 50 ms'de bir biten görseller ve ön-getirmeler (sayfa kaydırılınca inen ürün görselleri).
    for (let i = 1; i <= 8; i++) {
      await act(async () => vi.advanceTimersByTime(50));
      const t = performance.now();
      entries.push(
        { name: `http://localhost:3000/_next/image?url=%2Fp${i}.webp&w=384&q=75`, initiatorType: "img", startTime: t - 40, responseEnd: t },
        { name: `http://localhost:3000/firmalar?_rsc=p${i}`, initiatorType: "fetch", startTime: t - 40, responseEnd: t },
        { name: "http://localhost:3000/api/public/views", initiatorType: "beacon", startTime: t - 10, responseEnd: t },
      );
    }
    // Yanıtın bitiminden ~`settleMs` sonra (görseller hâlâ inerken) dürtü.
    expect(nudged).toHaveBeenCalledTimes(1);
    expect(nav.push).toHaveBeenCalledTimes(1);
  });

  it("WebKit: React çizerken (yoklama mesajı 5 ms'lik dilimlerin arkasında bekliyor) dürtü, yeniden gönderim ve tam gezinme YOK; en geç üst sınır", async () => {
    fakeTicks(() => 8);
    renderShell();
    act(() => ctx!.update({ verified: true }));
    await act(async () => vi.advanceTimersByTime(700));
    rscEntry("/urunler?dogrulanmis=1");
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.hardLimitMs - 700 - 500));
    expect(nudged).not.toHaveBeenCalled();
    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1000));
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("WebKit: çizim bitip iş parçacığı boşalınca dürtü gelir (yoklama meşgul → boşta geçişini izler)", async () => {
    let busy = true;
    fakeTicks(() => (busy ? 9 : 1));
    renderShell();
    act(() => ctx!.update({ verified: true }));
    await act(async () => vi.advanceTimersByTime(700));
    rscEntry("/urunler?dogrulanmis=1");
    await act(async () => vi.advanceTimersByTime(2000));
    expect(nudged).not.toHaveBeenCalled();
    busy = false;
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.idleMs + TICK_PROBE.intervalMs * 2 + NAV_WATCHDOG.recheckMs));
    expect(nudged).toHaveBeenCalledTimes(1);
    expect(nav.push).toHaveBeenCalledTimes(1);
  });

  it("yeni istemci bileşeninin JS parçası inerken (data-webpack betiği) takılma sayılmaz; indikten sonra süre yeniden başlar", async () => {
    renderShell();
    act(() => ctx!.update({ verified: true }));
    await act(async () => vi.advanceTimersByTime(700));
    rscEntry("/urunler?dogrulanmis=1");
    const chunk = document.createElement("script");
    chunk.setAttribute("data-webpack", "_N_E:chunk-1");
    document.head.append(chunk);
    try {
      // Yanıt ilk denetimde görülür; parça `chunkWaitMs`ten kısa sürede iner.
      await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.firstCheckMs - 700 + NAV_WATCHDOG.chunkWaitMs - 200));
      expect(nudged).not.toHaveBeenCalled();
      expect(go).not.toHaveBeenCalled();
    } finally {
      chunk.remove();
    }
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.quietMs - NAV_WATCHDOG.recheckMs * 2));
    expect(nudged).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.recheckMs * 3));
    expect(nudged).toHaveBeenCalledTimes(1);
  });

  it("takılan JS parçası bekçiyi üst sınıra dek susturmaz: `chunkWaitMs` sonra yok sayılır", async () => {
    renderShell();
    act(() => ctx!.update({ verified: true }));
    await act(async () => vi.advanceTimersByTime(700));
    rscEntry("/urunler?dogrulanmis=1");
    const chunk = document.createElement("script");
    chunk.setAttribute("data-webpack", "_N_E:chunk-stuck");
    document.head.append(chunk);
    try {
      await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.firstCheckMs - 700 + NAV_WATCHDOG.chunkWaitMs + 10));
      expect(nudged).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.quietMs + NAV_WATCHDOG.recheckMs));
      expect(nudged).toHaveBeenCalledTimes(1);
      await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.quietMs + NAV_WATCHDOG.recheckMs));
      expect(nav.push).toHaveBeenCalledTimes(2);
      await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.retryQuietMs + NAV_WATCHDOG.recheckMs));
      expect(go).toHaveBeenCalledWith("/urunler?dogrulanmis=1", "push");
    } finally {
      chunk.remove();
    }
  });

  it("geçiş dürtüden sonra işlenirse yeniden gönderim ve tam gezinme olmaz", async () => {
    renderShell();
    act(() => ctx!.update({ verified: true }));
    await act(async () => vi.advanceTimersByTime(700));
    rscEntry("/urunler?dogrulanmis=1");
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.firstCheckMs - 700 + 10 + NAV_WATCHDOG.quietMs + NAV_WATCHDOG.recheckMs));
    expect(nudged).toHaveBeenCalledTimes(1);
    window.history.replaceState(null, "", "/urunler?dogrulanmis=1");
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.hardLimitMs));
    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
  });

  it("yanıt henüz gelmedi (yavaş ağ): erken müdahale YOK, üst sınırda tam gezinme", async () => {
    renderShell();
    act(() => ctx!.update({ verified: true }));
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.hardLimitMs - 500));
    expect(go).not.toHaveBeenCalled();
    expect(nav.push).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith("/urunler?dogrulanmis=1", "push");
  });

  it("art arda tıklar üst sınırı ertelemez; hedef SON seçimdir", async () => {
    renderShell();
    act(() => ctx!.update({ verified: true }));
    for (let i = 0; i < 6; i++) {
      await act(async () => vi.advanceTimersByTime(3000));
      act(() => ctx!.update((s) => ({ ...s, activities: [...s.activities, `A${i}`] })));
    }
    expect(go).toHaveBeenCalledTimes(1);
    const [url] = go.mock.calls[0]!;
    expect(url).toMatch(/^\/urunler\?/);
    expect(url).toContain("dogrulanmis=1");
  });

  it("geçiş normal biterse bekçi hiçbir şey yapmaz", async () => {
    nav.push.mockImplementation(() => Promise.resolve());
    renderShell();
    rscEntry("/urunler?dogrulanmis=1");
    await act(async () => ctx!.update({ verified: true }));
    expect(ctx!.isPending).toBe(false);
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.hardLimitMs + 1000));
    expect(go).not.toHaveBeenCalled();
  });

  it("adres hedefe geldi ama geçiş bitmedi: tam gezinme yok, 'Güncelleniyor…' bırakılır", async () => {
    renderShell();
    act(() => ctx!.update({ verified: true }));
    window.history.replaceState(null, "", "/urunler?dogrulanmis=1");
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.firstCheckMs + 10));
    expect(go).not.toHaveBeenCalled();
    expect(ctx!.isPending).toBe(false);
  });

  it("çekmece açıkken bekçi tam gezinirse çekmece yeniden açılacak diye işaret bırakır", async () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /Süzgeçler/ }));
    act(() => ctx!.update({ verified: true }));
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.hardLimitMs + 100));
    expect(go).toHaveBeenCalled();
    expect(JSON.parse(window.sessionStorage.getItem(DRAWER_REOPEN_KEY)!)).toMatchObject({ path: "/urunler", open: true });
  });

  it("çekmece kapalıyken tam gezinme sayfa konumunu taşır; yeni kabuk sayfayı oraya kaydırır, çekmeceyi AÇMAZ", async () => {
    const scrollYDesc = Object.getOwnPropertyDescriptor(window, "scrollY");
    Object.defineProperty(window, "scrollY", { configurable: true, value: 640 });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    try {
      const first = renderShell();
      act(() => ctx!.update({ verified: true }));
      await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.hardLimitMs + 100));
      expect(go).toHaveBeenCalled();
      expect(JSON.parse(window.sessionStorage.getItem(DRAWER_REOPEN_KEY)!)).toMatchObject({ path: "/urunler", open: false, page: 640 });
      // Tam yükleme: eski kabuk gider, yenisi bağlanır.
      first.unmount();
      renderShell();
      await act(async () => {});
      expect(scrollTo).toHaveBeenCalledWith(0, 640);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(window.sessionStorage.getItem(DRAWER_REOPEN_KEY)).toBeNull();
    } finally {
      if (scrollYDesc) Object.defineProperty(window, "scrollY", scrollYDesc);
      else delete (window as unknown as { scrollY?: unknown }).scrollY;
    }
  });

  it("sonuç alanındaki sayfalama bağlantısı da izlenir (data-filter-nav)", async () => {
    render(
      <FilterShell basePath="/urunler" total={0} pushFilters>
        <div data-filter-nav>
          <a href={NEXT_PAGE} onClick={(e) => e.preventDefault()}>
            Sonraki
          </a>
        </div>
        <a href={OTHER_PAGE} onClick={(e) => e.preventDefault()}>
          Dış
        </a>
      </FilterShell>,
    );
    fireEvent.click(screen.getByText("Dış"));
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.hardLimitMs + 100));
    expect(go).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Sonraki"));
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.firstCheckMs + 10));
    expect(go).not.toHaveBeenCalled();
    rscEntry("/urunler?sayfa=2");
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.recheckMs * 2 + NAV_WATCHDOG.quietMs));
    // Önce dürtü, sonra bağlantının gezinmesi yeniden gönderilir…
    expect(nudged).toHaveBeenCalledTimes(1);
    expect(nav.push).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.recheckMs + NAV_WATCHDOG.quietMs));
    expect(nav.push).toHaveBeenCalledWith("/urunler?sayfa=2");
    expect(go).not.toHaveBeenCalled();
    // …o da işlenmezse tam gezinme.
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.retryQuietMs + NAV_WATCHDOG.recheckMs));
    expect(go).toHaveBeenCalledWith("/urunler?sayfa=2", "push");
  });

  it("bağlantı normal gezinirse (adres hedefte) bekçi susar", async () => {
    render(
      <FilterShell basePath="/urunler" total={0} pushFilters>
        <div data-filter-nav>
          <a href={NEXT_PAGE} onClick={(e) => e.preventDefault()}>
            Sonraki
          </a>
        </div>
      </FilterShell>,
    );
    fireEvent.click(screen.getByText("Sonraki"));
    window.history.pushState(null, "", "/urunler?sayfa=2");
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.hardLimitMs + 100));
    expect(go).not.toHaveBeenCalled();
  });

  it("gizli sekmede üst sınır dolsa da sıkı döngü ve tam gezinme yok; görünür olunca karar verilir", async () => {
    let state: DocumentVisibilityState = "hidden";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    try {
      renderShell();
      act(() => ctx!.update({ verified: true }));
      await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.hardLimitMs + 10_000));
      expect(go).not.toHaveBeenCalled();
      // Kalan süre 0'a indiğinde bile yoklama `recheckMs` aralığında: tek bekleyen zamanlayıcı.
      expect(vi.getTimerCount()).toBe(1);
      state = "visible";
      await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.recheckMs));
      expect(go).toHaveBeenCalledWith("/urunler?dogrulanmis=1", "push");
    } finally {
      delete (document as unknown as { visibilityState?: unknown }).visibilityState;
    }
  });

  it("az önce sorunsuz biten sayfa bağlantısı sonraki süzgeç tıkının üst sınırını öne çekmez", async () => {
    render(
      <FilterShell basePath="/urunler" total={0} pushFilters>
        <Probe />
        <div data-filter-nav>
          <a href={NEXT_PAGE} onClick={(e) => e.preventDefault()}>
            Sonraki
          </a>
        </div>
      </FilterShell>,
    );
    fireEvent.click(screen.getByText("Sonraki"));
    window.history.pushState(null, "", NEXT_PAGE);
    // Bağlantının denetimi henüz koşmadı (ilk denetim 4 sn'de); 3. saniyede süzgeç tıkı takılır.
    await act(async () => vi.advanceTimersByTime(3000));
    act(() => ctx!.update({ verified: true }));
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.hardLimitMs - 500));
    expect(go).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1000));
    expect(go).toHaveBeenCalledWith("/urunler?dogrulanmis=1", "push");
  });
});

/**
 * Next'in sayfa kesimi kaydırıcısının taklidi: işleme anında, ÇOCUKLARIN
 * yerleşim efektlerinden SONRA koşar (gerçekte `InnerScrollAndFocusHandler.
 * componentDidUpdate` → `documentElement.scrollTop = 0`).
 */
const nextScroll = { jump: false };
function NextScrollHandler({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    if (nextScroll.jump) page.jumpTop();
  });
  return <>{children}</>;
}
function scrollShell(props: { fixedCity?: string } = {}) {
  return (
    <NextScrollHandler>
      <FilterShell basePath="/urunler" fixedCity={props.fixedCity} total={0} pushFilters drawer={<p>çekmece içeriği</p>}>
        <Probe />
        <MobileFilterButton />
        <div data-filter-nav>
          <a href={NEXT_PAGE} onClick={(e) => e.preventDefault()}>
            Sonraki
          </a>
        </div>
      </FilterShell>
    </NextScrollHandler>
  );
}
/** Next hedefi işledi: geçmiş kaydı yeniden yazılır, sorgu güncellenir, sayfa kesimi (isteğe bağlı) başa atar. */
async function commit(view: ReturnType<typeof render>, url: string, { jump = true, fixedCity }: { jump?: boolean; fixedCity?: string } = {}) {
  window.history.replaceState({ __NA: true, url }, "", url);
  nav.search = url.split("?")[1] ?? "";
  nextScroll.jump = jump;
  await act(async () => view.rerender(scrollShell({ fixedCity })));
  nextScroll.jump = false;
}

describe("kaydırma koruması (mobil denetim r2: `scroll: false` Next'in takma adlı yolunda yok sayılıyor)", () => {
  // Kare geri çağrısı sahte saatte (testten teste sızmasın).
  const realRaf = window.requestAnimationFrame;
  const realCaf = window.cancelAnimationFrame;
  beforeEach(() => {
    window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 16) as unknown as number) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>)) as typeof window.cancelAnimationFrame;
  });
  afterEach(() => {
    window.requestAnimationFrame = realRaf;
    window.cancelAnimationFrame = realCaf;
  });

  it("süzgeç tıkı sayfa konumunu korur: Next işleme anında başa atsa da hedef işlenince aynı görevde geri konur", async () => {
    const scrollTo = page.install(640);
    const view = render(scrollShell());
    act(() => ctx!.update({ verified: true }));
    expect(nav.push).toHaveBeenCalledWith("/urunler?dogrulanmis=1", { scroll: false });
    await commit(view, "/urunler?dogrulanmis=1");
    expect(scrollTo).toHaveBeenCalledWith(0, 640);
    expect(page.y).toBe(640);
  });

  it("beklerken kullanıcı kaydırırsa SON konum korunur (tık anındaki değil)", async () => {
    const scrollTo = page.install(640);
    const view = render(scrollShell());
    act(() => ctx!.update({ verified: true }));
    page.userScroll(910);
    await commit(view, "/urunler?dogrulanmis=1");
    expect(scrollTo).toHaveBeenLastCalledWith(0, 910);
    expect(page.y).toBe(910);
  });

  it("Next başa atmadıysa (konum zaten yerinde) kaydırma yazılmaz; hedef işlenmeden önceki çizimler dokunmaz", async () => {
    const scrollTo = page.install(640);
    const view = render(scrollShell());
    act(() => ctx!.update({ verified: true }));
    // İyimser çizim ve ilgisiz yeniden çizim: adres henüz eski → geri koyma yok.
    page.jumpTop();
    await act(async () => view.rerender(scrollShell()));
    expect(scrollTo).not.toHaveBeenCalled();
    page.userScroll(640);
    await commit(view, "/urunler?dogrulanmis=1", { jump: false });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("art arda iki tık: ÖNCEKİ hedef önce işlenip başa atılsa da konum geri konur; koruma sonraki hedef için sürer", async () => {
    const scrollTo = page.install(640);
    const view = render(scrollShell());
    act(() => ctx!.update({ verified: true }));
    act(() => ctx!.update({ fastReply: true }));
    const [first, second] = nav.push.mock.calls.map((c) => c[0] as string);
    expect(second).not.toBe(first);
    await commit(view, first!);
    expect(page.y).toBe(640);
    await commit(view, second!);
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(page.y).toBe(640);
    // Koruma tükendi: sonraki (ilgisiz) işleme konuma dokunmaz.
    await commit(view, second!);
    expect(page.y).toBe(0);
  });

  it("bekçinin yeniden gönderdiği gezinme de korunur (aynı hedef)", async () => {
    const scrollTo = page.install(500);
    const view = render(scrollShell());
    act(() => ctx!.update({ verified: true }));
    await act(async () => vi.advanceTimersByTime(700));
    rscEntry("/urunler?dogrulanmis=1");
    await act(async () => vi.advanceTimersByTime(NAV_WATCHDOG.firstCheckMs + NAV_WATCHDOG.quietMs * 2 + NAV_WATCHDOG.recheckMs * 3));
    expect(nav.push).toHaveBeenCalledTimes(2);
    await commit(view, "/urunler?dogrulanmis=1");
    expect(scrollTo).toHaveBeenCalledWith(0, 500);
  });

  it("rota değiştiren süzgeç (açılış sayfası → sorgu şeması) konumu korumaz: yeni sayfa baştan açılır", async () => {
    nav.pathname = "/urunler/sehir/istanbul";
    const scrollTo = page.install(640);
    const view = render(scrollShell({ fixedCity: "istanbul" }));
    act(() => ctx!.update({ cities: ["istanbul", "bursa"] }));
    expect(nav.push.mock.calls.at(-1)![0]).toBe("/urunler?sehir=istanbul%2Cbursa");
    await commit(view, "/urunler?sehir=istanbul%2Cbursa", { fixedCity: "istanbul" });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("sayfalama bağlantısı bekleyen korumayı düşürür (sayfa değişiminde Next'in olağan kaydırması)", async () => {
    const scrollTo = page.install(640);
    const view = render(scrollShell());
    act(() => ctx!.update({ verified: true }));
    fireEvent.click(screen.getByText("Sonraki"));
    await commit(view, "/urunler?dogrulanmis=1");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("geri koyma: Next başa atmayı bir kare ertelese de kare sonunda yine geri konur; kullanıcı arada kaydırdıysa dokunulmaz", async () => {
    const scrollTo = page.install(0);
    window.history.replaceState({ v: 1 }, "", "/urunler");
    page.userScroll(640);
    const keep = captureScroll("/urunler?x=1")!;
    window.history.replaceState({ v: 2 }, "", "/urunler?x=1");
    const hit = takeCommittedKeep(keep)!;
    restoreScrollAfterCommit(hit.restore);
    await act(async () => {});
    expect(scrollTo).not.toHaveBeenCalled(); // konum yerinde
    page.jumpTop(); // Next kaydırması bir kare sonra
    await act(async () => vi.advanceTimersByTime(20));
    expect(page.y).toBe(640);
    // Kullanıcı girişi: geri koyma durur.
    scrollTo.mockClear();
    restoreScrollAfterCommit(hit.restore);
    window.dispatchEvent(new Event("wheel"));
    page.jumpTop();
    await act(async () => vi.advanceTimersByTime(20));
    expect(scrollTo).not.toHaveBeenCalled();
    // İptal edilen geri koyma da yazmaz.
    const cancel = restoreScrollAfterCommit(hit.restore);
    cancel();
    await act(async () => vi.advanceTimersByTime(20));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("işlendi kararı: adres hedefte VE geçmiş kaydı yeniden yazılmış olmalı (kutucuğu işaretleyip hemen geri almak); eski bekleyenler TTL'den sonra düşer", () => {
    page.install(300);
    window.history.replaceState({ v: 1 }, "", "/urunler");
    // Hedef şu anki adresin kendisi: Next işleyene dek "işlendi" sayılmaz.
    const back = captureScroll("/urunler")!;
    expect(takeCommittedKeep(back)).toBeNull();
    window.history.replaceState({ v: 2 }, "", "/urunler");
    expect(takeCommittedKeep(back)).toMatchObject({ restore: { y: 300 }, rest: null });
    // Zincir: A bekliyorken B — A önce işlenirse B için koruma sürer.
    const a = captureScroll("/urunler?a=1")!;
    const ab = captureScroll("/urunler?b=1", a)!;
    expect(ab.urls).toEqual(["/urunler?a=1", "/urunler?b=1"]);
    window.history.replaceState({ v: 3 }, "", "/urunler?a=1");
    const hit = takeCommittedKeep(ab)!;
    expect(hit.rest!.urls).toEqual(["/urunler?b=1"]);
    expect(takeCommittedKeep(hit.rest!)).toBeNull(); // aynı işleme ikinci kez sayılmaz
    // Bayat bekleyen birleştirilmez.
    vi.setSystemTime(Date.now() + SCROLL_KEEP_TTL_MS + 1);
    expect(captureScroll("/urunler?c=1", ab)!.urls).toEqual(["/urunler?c=1"]);
  });

  it("çekmece açıkken de arkadaki sayfanın konumu korunur", async () => {
    const scrollTo = page.install(720);
    const view = render(scrollShell());
    fireEvent.click(screen.getByRole("button", { name: /Süzgeçler/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() => ctx!.update({ verified: true }));
    await commit(view, "/urunler?dogrulanmis=1");
    expect(scrollTo).toHaveBeenCalledWith(0, 720);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("rota değişiminde çekmece açık kalır (g02-10)", () => {
  it("açılış sayfasında yoldaki süzgeç değişince yeni rotadaki kabuk çekmeceyi AÇIK başlatır", async () => {
    nav.pathname = "/urunler/kategori/31000000-malzeme";
    const first = render(
      <FilterShell basePath="/urunler" fixedCategory="31000000" total={0} pushFilters drawer={<p>çekmece içeriği</p>}>
        <Probe />
        <MobileFilterButton />
      </FilterShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Süzgeçler/ }));
    act(() => ctx!.update({ category: "24000000" }));
    expect(nav.push.mock.calls.at(-1)![0]).toBe("/urunler?kategori=24000000");
    // Next yeni rotayı işledi: eski kabuk gider, sorgu şemasında yenisi bağlanır.
    first.unmount();
    nav.pathname = "/urunler";
    nav.search = "kategori=24000000";
    renderShell();
    await act(async () => {});
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("çekmece içeriği")).toBeInTheDocument();
    // İşaret tüketildi — sonraki ziyarette çekmece kendiliğinden açılmaz.
    expect(window.sessionStorage.getItem(DRAWER_REOPEN_KEY)).toBeNull();
  });

  it("aynı rotada kalan süzgeç işaret BIRAKMAZ; başka yolda bağlanan kabuk işareti yok sayar", async () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /Süzgeçler/ }));
    act(() => ctx!.update({ verified: true }));
    expect(window.sessionStorage.getItem(DRAWER_REOPEN_KEY)).toBeNull();

    window.sessionStorage.setItem(DRAWER_REOPEN_KEY, JSON.stringify({ path: "/urunler/sehir/bursa", at: Date.now() }));
    const { unmount } = render(
      <FilterShell basePath="/urunler" total={0} drawer={<p>ikinci çekmece</p>}>
        <span />
      </FilterShell>,
    );
    await act(async () => {});
    expect(screen.queryByText("ikinci çekmece")).toBeNull();
    unmount();
  });

  it("kullanıcı çekmeceyi kapatırsa bekleyen işaret düşer", () => {
    nav.pathname = "/urunler/sehir/istanbul";
    render(
      <FilterShell basePath="/urunler" fixedCity="istanbul" total={0} drawer={<p>çekmece içeriği</p>}>
        <Probe />
        <MobileFilterButton />
      </FilterShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Süzgeçler/ }));
    act(() => ctx!.update({ cities: [] }));
    expect(window.sessionStorage.getItem(DRAWER_REOPEN_KEY)).not.toBeNull();
    act(() => ctx!.closeMobile());
    expect(window.sessionStorage.getItem(DRAWER_REOPEN_KEY)).toBeNull();
  });
});

describe("MobileFilterButton (g02-13)", () => {
  it("tek satırda kalır: shrink-0 + whitespace-nowrap", () => {
    renderShell();
    const btn = screen.getByRole("button", { name: /Süzgeçler/ });
    expect(btn.className).toMatch(/(^|\s)shrink-0(\s|$)/);
    expect(btn.className).toMatch(/(^|\s)whitespace-nowrap(\s|$)/);
  });
});

describe("filter-shell-nav yardımcıları", () => {
  it("sameUrl sorgu sırasını ve kodlamayı yok sayar, yolu ayırır", () => {
    expect(sameUrl("/urunler?a=1&b=x%2Cy", "/urunler?b=x,y&a=1", "http://h/")).toBe(true);
    expect(sameUrl("/urunler?a=1", "/urunler/kategori/1?a=1", "http://h/")).toBe(false);
  });

  it("rscArrived: hedefin `_rsc` yanıtı bitmiş VE ağ sakin olmalı; izlemeden önce başlayan sayılmaz", () => {
    const now = performance.now();
    entries.push({ name: "http://localhost:3000/urunler?x=1", startTime: now - 5000, responseEnd: now - 4000 });
    expect(rscArrived("/urunler?x=1", now - 6000)).toBe(false); // RSC isteği değil
    entries.push({ name: "http://localhost:3000/urunler?x=1&_rsc=q", startTime: now - 5000, responseEnd: now - 4000 });
    expect(rscArrived("/urunler?x=1", now - 6000)).toBe(true);
    expect(rscArrived("/urunler?x=1", now - 1000)).toBe(false); // izlemeden önce başlamış
    expect(rscArrived("/urunler?y=2", now - 6000)).toBe(false); // başka hedef
    // Geçişi bekletemeyecek kaynaklar sayılmaz: görsel, işaret isteği, başka adresin ön-getirmesi.
    entries.push(
      { name: "http://localhost:3000/_next/image?url=%2Fa.webp&w=384&q=75", initiatorType: "img", startTime: now - 3000, responseEnd: now - 10 },
      { name: "https://cdn.rothern.com/p/a.webp", initiatorType: "img", startTime: now - 3000, responseEnd: now - 10 },
      { name: "http://localhost:3000/api/public/views", initiatorType: "beacon", startTime: now - 3000, responseEnd: now - 10 },
      { name: "http://localhost:3000/firmalar?_rsc=p", initiatorType: "fetch", startTime: now - 3000, responseEnd: now - 10 },
    );
    expect(rscArrived("/urunler?x=1", now - 6000)).toBe(true);
    expect(rscSettleWait("/urunler?x=1", now - 6000)).toBe(0);
    expect(rscSettleWait("/urunler?y=2", now - 6000)).toBeNull();
    // Yeni rotanın JS parçası az önce indi: geçiş meşru biçimde sürüyor olabilir.
    entries.push({ name: "http://localhost:3000/_next/static/chunks/x.js", initiatorType: "script", startTime: now - 3000, responseEnd: now - 100 });
    expect(rscArrived("/urunler?x=1", now - 6000)).toBe(false);
    // Bekçi sonraki denetimi ağın sakin sayılacağı ana kurar: kalan süre.
    expect(rscSettleWait("/urunler?x=1", now - 6000)).toBe(NAV_WATCHDOG.settleMs - 100);
  });

  it("createIdleProbe: requestIdleCallback varsa kesintisiz boşta süresini verir, meşgulde 0", async () => {
    fakeIdle("idle");
    const idle = createIdleProbe(window);
    expect(idle.kind).toBe("idle-callback");
    expect(idle.supported).toBe(true);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(idle.idleFor()).toBeGreaterThanOrEqual(900);
    idle.reset();
    expect(idle.idleFor()).toBe(0);
    await act(async () => vi.advanceTimersByTime(300));
    expect(idle.idleFor()).toBeGreaterThanOrEqual(240);
    // Geri çağrılar kesildi (iş parçacığı meşgul): ölçüm hemen 0'a düşer.
    idle.dispose();
    await act(async () => vi.advanceTimersByTime(IDLE_GAP_MS + 50));
    expect(idle.idleFor()).toBe(0);
    fakeIdle("busy");
    const busy = createIdleProbe(window);
    await act(async () => vi.advanceTimersByTime(3000));
    expect(busy.idleFor()).toBe(0);
    busy.dispose();
  });

  it("createIdleProbe (WebKit, requestIdleCallback yok): yoklama — mesaj hızlı dönüyor ve zamanlayıcı geç kalmıyorsa boşta", async () => {
    fakeTicks(() => 1);
    const probe = createIdleProbe(window);
    expect(probe.kind).toBe("ticks");
    expect(probe.supported).toBe(true);
    expect(probe.idleFor()).toBe(0);
    await act(async () => vi.advanceTimersByTime(600));
    expect(probe.idleFor()).toBeGreaterThanOrEqual(500);
    probe.reset();
    expect(probe.idleFor()).toBe(0);
    await act(async () => vi.advanceTimersByTime(300));
    expect(probe.idleFor()).toBeGreaterThanOrEqual(200);
    await act(async () => vi.advanceTimersByTime(5));
    probe.dispose();
    expect(vi.getTimerCount()).toBe(0);
    // Yoklama durdu: ölçüm hemen 0'a düşer (iş parçacığı meşgul sayılır).
    await act(async () => vi.advanceTimersByTime(IDLE_GAP_MS + 50));
    expect(probe.idleFor()).toBe(0);
  });

  it("yoklama: mesaj `pingMs`ten uzun bekliyorsa (React dilimleri kuyrukta) meşgul; uzun görev (zamanlayıcı gecikmesi) boşta sürecini sıfırlar", async () => {
    let ping = 8;
    fakeTicks(() => ping);
    const probe = createIdleProbe(window);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(probe.idleFor()).toBe(0);
    ping = TICK_PROBE.pingMs;
    await act(async () => vi.advanceTimersByTime(400));
    expect(probe.idleFor()).toBeGreaterThanOrEqual(250);
    // Uzun görev: saat zamanlayıcı koşmadan ileri atlar → yoklama geç kalır.
    vi.setSystemTime(Date.now() + 120);
    await act(async () => vi.advanceTimersByTime(TICK_PROBE.intervalMs + 10));
    expect(probe.idleFor()).toBe(0);
    await act(async () => vi.advanceTimersByTime(400));
    expect(probe.idleFor()).toBeGreaterThanOrEqual(250);
    probe.dispose();
  });

  it("yoklama: bir aralık geç dönen ESKİ mesaj yeni yoklamanın hükmünü vermez (sıra numarası)", async () => {
    // 1. mesaj 52 ms sonra döner (2. yoklama gönderildikten 2 ms sonra), 2. mesaj 8 ms bekler (meşgul).
    const delays = [52, 8];
    fakeTicks(() => delays.shift() ?? 1);
    const probe = createIdleProbe(window);
    await act(async () => vi.advanceTimersByTime(TICK_PROBE.intervalMs * 2 + 5));
    // Eski mesaj yeni yoklamaya yazılsaydı 2 ms'lik bekleme "boşta" sayılırdı.
    expect(probe.idleFor()).toBe(0);
    await act(async () => vi.advanceTimersByTime(400));
    expect(probe.idleFor()).toBeGreaterThanOrEqual(250);
    probe.dispose();
  });

  it("yoklama: mesaj hiç dönmüyorsa (bozuk kanal) birkaç denemeden sonra yalnız zamanlayıcı gecikmesi ölçülür; MessageChannel yoksa da öyle", async () => {
    fakeTicks(() => null);
    const broken = createIdleProbe(window);
    await act(async () => vi.advanceTimersByTime(TICK_PROBE.intervalMs * (TICK_PROBE.maxStalls + 1)));
    expect(broken.idleFor()).toBe(0);
    await act(async () => vi.advanceTimersByTime(500));
    expect(broken.idleFor()).toBeGreaterThanOrEqual(300);
    broken.dispose();
    (window as unknown as { MessageChannel?: unknown }).MessageChannel = undefined;
    const lateOnly = createIdleProbe(window);
    expect(lateOnly.kind).toBe("ticks");
    await act(async () => vi.advanceTimersByTime(500));
    expect(lateOnly.idleFor()).toBeGreaterThanOrEqual(300);
    lateOnly.dispose();
  });

  it("createIdleProbe: zamanlayıcı bile yoksa ölçüm yok (süre tabanlı yol)", () => {
    expect(createIdleProbe({} as Window)).toBe(NO_IDLE_PROBE);
    expect(NO_IDLE_PROBE.kind).toBe("none");
    expect(NO_IDLE_PROBE.supported).toBe(false);
  });

  it("assetsLoading: inen webpack parçası ya da yüklenmemiş uygulama CSS'i; yabancı stil dosyası sayılmaz", () => {
    expect(assetsLoading(document)).toBe(false);
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/_next/static/css/yeni.css";
    document.head.append(css);
    expect(assetsLoading(document)).toBe(true);
    css.remove();
    const foreign = document.createElement("link");
    foreign.rel = "stylesheet";
    foreign.href = "https://fonts.example.com/x.css";
    document.head.append(foreign);
    expect(assetsLoading(document)).toBe(false);
    foreign.remove();
    const js = document.createElement("script");
    js.setAttribute("data-webpack", "_N_E:chunk-9");
    document.head.append(js);
    expect(assetsLoading(document)).toBe(true);
    js.remove();
  });

  it("observeRscEnd: yalnız hedefin izlemeden sonra başlayan `_rsc` yanıtı haber verir; gözlemci yoksa sessiz", () => {
    const hit = vi.fn();
    expect(() => observeRscEnd("/urunler?x=1", 0, hit)()).not.toThrow();
    fakePerformanceObserver();
    const stop = observeRscEnd("/urunler?x=1&y=2", 100, hit);
    emitResource({ name: "http://localhost:3000/urunler?y=2&x=1&_rsc=q", startTime: 50, responseEnd: 120 });
    emitResource({ name: "http://localhost:3000/urunler?x=1&_rsc=q", startTime: 150, responseEnd: 200 });
    emitResource({ name: "http://localhost:3000/urunler?x=1&y=2", startTime: 150, responseEnd: 200 });
    expect(hit).not.toHaveBeenCalled();
    emitResource({ name: "http://localhost:3000/urunler?y=2&x=1&_rsc=q", startTime: 150, responseEnd: 220 });
    expect(hit).toHaveBeenCalledTimes(1);
    stop();
    emitResource({ name: "http://localhost:3000/urunler?y=2&x=1&_rsc=q", startTime: 300, responseEnd: 320 });
    expect(hit).toHaveBeenCalledTimes(1);
  });

  it("çekmece işareti: konum ve açıklık gidip gelir; eski biçimli işaret açık + 0 konum okunur; tüketilir", () => {
    markDrawerReopen("/urunler", { open: false, page: 812.4, drawer: -3 });
    expect(takeDrawerReopen("/urunler")).toEqual({ open: false, page: 812, drawer: 0 });
    expect(takeDrawerReopen("/urunler")).toBeNull();
    window.sessionStorage.setItem(DRAWER_REOPEN_KEY, JSON.stringify({ path: "/urunler", at: Date.now() }));
    expect(takeDrawerReopen("/urunler")).toEqual({ open: true, page: 0, drawer: 0 });
    markDrawerReopen("/urunler/kategori/1");
    expect(takeDrawerReopen("/urunler")).toBeNull();
  });

  it("keepResourceTimingRoom: tampon dolunca iki katına büyür, üst sınırda durur, bir kez bağlanır", async () => {
    vi.resetModules();
    const fresh = await import("../filter-shell-nav");
    const listeners: Array<() => void> = [];
    const addListener = vi
      .spyOn(performance, "addEventListener")
      .mockImplementation(((type: string, fn: () => void) => {
        if (type === "resourcetimingbufferfull") listeners.push(fn);
      }) as typeof performance.addEventListener);
    const original = Object.getOwnPropertyDescriptor(performance, "setResourceTimingBufferSize");
    const setSize = vi.fn();
    Object.defineProperty(performance, "setResourceTimingBufferSize", { configurable: true, value: setSize });
    try {
      fresh.keepResourceTimingRoom(1000);
      fresh.keepResourceTimingRoom(1000);
      expect(addListener).toHaveBeenCalledTimes(1);
      listeners[0]!();
      expect(setSize).toHaveBeenLastCalledWith(500);
      listeners[0]!();
      expect(setSize).toHaveBeenLastCalledWith(1000);
      listeners[0]!();
      expect(setSize).toHaveBeenCalledTimes(2);
    } finally {
      if (original) Object.defineProperty(performance, "setResourceTimingBufferSize", original);
      else delete (performance as unknown as { setResourceTimingBufferSize?: unknown }).setResourceTimingBufferSize;
    }
  });
});
