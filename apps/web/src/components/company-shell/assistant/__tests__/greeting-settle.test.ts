// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LAUNCHER_NODE_ATTR,
  PAGE_SETTLE_MS,
  greetingZone,
  isLauncherNode,
  isPageMutation,
  mutationTouchesZone,
  watchPageSettle,
  zoneStillLoading,
} from "../greeting-settle";

/**
 * `greeting-settle.ts` — mobil denetim 2026-10, dördüncü doğrulama
 * (s1-fab#v4new0): karşılama balonu sayfa balonun yerinde OTURMADAN
 * yoklanmaz (iskelet, `aria-busy`, süren istek, son 600 ms'de değişiklik).
 */
const rect = (left: number, top: number, w: number, h: number) =>
  ({ left, top, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top }) as DOMRect;

/** 1440×900 görünümün sağ-alt köşesi (balon + düğme). */
const ZONE = { left: 1120, top: 560, right: 1440, bottom: 900 };

function boxed<K extends keyof HTMLElementTagNameMap>(tag: K, r: DOMRect, parent: Element = document.body) {
  const el = document.createElement(tag);
  el.getBoundingClientRect = () => r;
  parent.appendChild(el);
  return el;
}
const record = (r: Partial<MutationRecord> & Pick<MutationRecord, "type" | "target">) =>
  ({ addedNodes: [], removedNodes: [], ...r }) as unknown as MutationRecord;
/** MutationObserver geri çağrısı mikro görevde koşar. */
const flushMicrotasks = async () => {
  for (let i = 0; i < 3; i++) await Promise.resolve();
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("greetingZone", () => {
  it("görünüm alanının sağ-alt köşesi: balonun en geniş/uzun hâli ve altındaki düğme", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    expect(greetingZone(window)).toEqual(ZONE);
  });
});

describe("isLauncherNode / isPageMutation", () => {
  it("asistanın kendi düğümlerine (düğme, balon, panel) dokunan kayıt sayfa değişikliği değildir", () => {
    const container = document.createElement("div");
    const bubble = document.createElement("div");
    bubble.setAttribute(LAUNCHER_NODE_ATTR, "");
    const inner = document.createElement("p");
    bubble.appendChild(inner);
    container.appendChild(bubble);
    document.body.appendChild(container);
    expect(isLauncherNode(inner)).toBe(true);
    expect(isLauncherNode(container)).toBe(false);
    // Balonun içi değişti; balon eklendi / kaldırıldı (kopmuş düğüm kendi ağacında bakılır).
    expect(isPageMutation(record({ type: "characterData", target: inner.appendChild(document.createTextNode("x")) }))).toBe(false);
    expect(isPageMutation(record({ type: "childList", target: container, addedNodes: [bubble] as unknown as NodeList }))).toBe(false);
    bubble.remove();
    expect(isPageMutation(record({ type: "childList", target: container, removedNodes: [bubble] as unknown as NodeList }))).toBe(false);
    // Sayfanın kendi öğesi.
    const card = document.createElement("article");
    expect(
      isPageMutation(record({ type: "childList", target: container, addedNodes: [bubble, card] as unknown as NodeList })),
    ).toBe(true);
    expect(isPageMutation(record({ type: "attributes", target: container }))).toBe(true);
  });
});

describe("mutationTouchesZone", () => {
  it("eklenen öğe kendi kutusuyla ölçülür: bölgedeyse değer, başka yerdeyse değmez", () => {
    const main = boxed("main", rect(256, 56, 1184, 844));
    const card = boxed("article", rect(1236, 644, 176, 256), main);
    const badge = boxed("span", rect(1200, 12, 20, 16), main);
    expect(mutationTouchesZone(record({ type: "childList", target: main, addedNodes: [card] as unknown as NodeList }), ZONE)).toBe(true);
    expect(mutationTouchesZone(record({ type: "childList", target: main, addedNodes: [badge] as unknown as NodeList }), ZONE)).toBe(false);
  });

  it("ölçülemeyen eklenen öğe, çıkarma, metin ve öznitelik değişimi hedefin kutusuyla ölçülür", () => {
    const rail = boxed("ul", rect(296, 644, 1104, 256));
    const sidebar = boxed("nav", rect(0, 56, 256, 844));
    const empty = boxed("li", rect(0, 0, 0, 0), rail);
    expect(mutationTouchesZone(record({ type: "childList", target: rail, addedNodes: [empty] as unknown as NodeList }), ZONE)).toBe(true);
    expect(mutationTouchesZone(record({ type: "childList", target: rail, removedNodes: [document.createElement("li")] as unknown as NodeList }), ZONE)).toBe(true);
    expect(mutationTouchesZone(record({ type: "attributes", target: sidebar }), ZONE)).toBe(false);
    const text = sidebar.appendChild(document.createTextNode("3"));
    expect(mutationTouchesZone(record({ type: "characterData", target: text }), ZONE)).toBe(false);
  });

  it("çok sayıda eklenen öğede ilk 8'i bölge dışındaysa hedefin kutusuna bakılır", () => {
    const rail = boxed("ul", rect(296, 644, 1104, 256));
    const items = Array.from({ length: 12 }, (_, i) => boxed("li", rect(296 + i * 90, 644, 80, 256), rail));
    expect(mutationTouchesZone(record({ type: "childList", target: rail, addedNodes: items as unknown as NodeList }), ZONE)).toBe(true);
    // 8'den az öğenin hepsi ölçüldü ve dışarıda: değmez.
    expect(
      mutationTouchesZone(record({ type: "childList", target: rail, addedNodes: items.slice(0, 3) as unknown as NodeList }), ZONE),
    ).toBe(false);
  });
});

describe("zoneStillLoading", () => {
  it("bölgede iskelet, dönen gösterge ya da `aria-busy` kap varsa yükleniyor", () => {
    const skeleton = boxed("div", rect(1236, 644, 176, 256));
    skeleton.className = "animate-pulse";
    expect(zoneStillLoading(ZONE)).toBe(true);
    skeleton.className = "";
    expect(zoneStillLoading(ZONE)).toBe(false);
    const spinner = boxed("span", rect(1300, 700, 20, 20));
    spinner.className = "animate-spin";
    expect(zoneStillLoading(ZONE)).toBe(true);
    spinner.remove();
    const list = boxed("div", rect(256, 400, 1184, 500));
    list.setAttribute("aria-busy", "true");
    expect(zoneStillLoading(ZONE)).toBe(true);
    list.setAttribute("aria-busy", "false");
    expect(zoneStillLoading(ZONE)).toBe(false);
  });

  it("bölge dışındaki iskelet, canlı nokta (10 px'ten küçük) ve asistanın kendi göstergesi sayılmaz", () => {
    boxed("div", rect(300, 644, 176, 256)).className = "animate-pulse";
    boxed("span", rect(1300, 700, 6, 6)).className = "animate-pulse";
    const own = boxed("div", rect(1180, 600, 260, 140));
    own.setAttribute(LAUNCHER_NODE_ATTR, "");
    boxed("span", rect(1200, 620, 16, 16), own).className = "animate-spin";
    expect(zoneStillLoading(ZONE)).toBe(false);
  });
});

describe("watchPageSettle", () => {
  function setup(isBusy?: () => boolean) {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const rail = boxed("div", rect(1120, 600, 320, 300));
    const onSettled = vi.fn();
    const watcher = watchPageSettle({ zone: () => ZONE, isBusy, onSettled });
    return { rail, onSettled, watcher };
  }

  it("bölgede değişiklik olmadan 600 ms geçince oturur", () => {
    const { onSettled, watcher } = setup();
    vi.advanceTimersByTime(PAGE_SETTLE_MS - 1);
    expect(watcher.isSettled()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(watcher.isSettled()).toBe(true);
    expect(onSettled).toHaveBeenCalledTimes(1);
    watcher.dispose();
  });

  it("bölgedeki değişiklik süreyi yeniden başlatır; oturmuş sayfa yeniden değişince oturmamış sayılır", async () => {
    const { rail, onSettled, watcher } = setup();
    vi.advanceTimersByTime(400);
    rail.appendChild(document.createElement("div"));
    await flushMicrotasks();
    vi.advanceTimersByTime(400);
    expect(watcher.isSettled()).toBe(false);
    vi.advanceTimersByTime(200);
    expect(watcher.isSettled()).toBe(true);
    rail.setAttribute("class", "opacity-100");
    await flushMicrotasks();
    expect(watcher.isSettled()).toBe(false);
    vi.advanceTimersByTime(PAGE_SETTLE_MS);
    expect(onSettled).toHaveBeenCalledTimes(2);
    watcher.dispose();
  });

  it("süren istek ya da bölgedeki iskelet varken oturmaz; bitince bir süre sonra oturur", () => {
    let busy = true;
    const { rail, watcher } = setup(() => busy);
    rail.className = "animate-pulse";
    vi.advanceTimersByTime(5_000);
    expect(watcher.isSettled()).toBe(false);
    rail.className = "";
    vi.advanceTimersByTime(5_000);
    expect(watcher.isSettled()).toBe(false);
    busy = false;
    vi.advanceTimersByTime(PAGE_SETTLE_MS);
    expect(watcher.isSettled()).toBe(true);
    watcher.dispose();
  });

  it("pencere boyutu değişince yeniden bekler; bırakılan izleyici bir şey çağırmaz", () => {
    const { onSettled, watcher } = setup();
    vi.advanceTimersByTime(500);
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(500);
    expect(watcher.isSettled()).toBe(false);
    watcher.dispose();
    vi.advanceTimersByTime(5_000);
    expect(onSettled).not.toHaveBeenCalled();
  });
});
