// @vitest-environment jsdom
/**
 * Yüzen "Talep aç" köşesi (mobil denetim 2026-10, 2. tur g02 / safe-area).
 * jsdom yerleşim yapmaz: kutular `getBoundingClientRect` sahtesiyle kurulur.
 *
 *  · 360 px, klavye açık (görünüm 429 px): arama satırı köşeye iniyor, düğme
 *    "Ara"nın üstüne biniyor ve dokunuş kayıt sayfasını açıyordu → yazarken
 *    (dokunmatik + klavye açan alan odakta) düğme çekilir.
 *  · 844×390 yatay: sayfa başında arama satırı zaten köşede → düğmenin kutusu
 *    `[data-float-avoid]` bölgesiyle kesişirken düğme çekilir; arama kaydırılıp
 *    gidince geri gelir.
 *  · Kab `ViewportLayer` ile `body`de (herkese açık `main` kapsayıcı; eski
 *    WebView/Safari `fixed` köşeyi ona göre konumluyordu); hidrasyon yolunda
 *    ilk ölçüm kab bağlanınca yapılır.
 */
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FloatingRequestDock, floatOverlapsAvoid } from "../floating-request-dock";

type Box = { left: number; top: number; width: number; height: number };
const rect = ({ left, top, width, height }: Box) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

const boxes = new Map<Element, Box>();
const originalRect = Element.prototype.getBoundingClientRect;
const originalMatchMedia = window.matchMedia;
let coarse = false;

function setBox(el: Element, box: Box) {
  boxes.set(el, box);
}

beforeEach(() => {
  boxes.clear();
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const b = boxes.get(this);
    return b ? rect(b) : rect({ left: 0, top: 0, width: 0, height: 0 });
  };
  coarse = false;
  window.matchMedia = ((query: string) => ({
    matches: query === "(pointer: coarse)" ? coarse : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  // Ölçüm kare başına; testte hemen koşsun (0 = bekleyen kare yok).
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = originalRect;
  window.matchMedia = originalMatchMedia;
  vi.unstubAllGlobals();
});

/** Sayfa: arama satırı (kaçınılacak bölge) + arama kutusu + köşe düğmesi. */
function Page() {
  return (
    <>
      <div data-float-avoid data-testid="arama">
        <input aria-label="Ara" />
      </div>
      <FloatingRequestDock className="fixed right-3 bottom-3 flex">
        {/* Gerçek sayfada `OpenRequestLink` (bağlantı); burada yalnız köşe kuralı sınanır. */}
        <button type="button">Talep aç</button>
      </FloatingRequestDock>
    </>
  );
}

const dock = () => screen.getByText("Talep aç").parentElement!;
// 360×429 (klavye açık): "Ara" 280..336 × 360..416, düğme 269..348 × 385..417.
const CORNER: Box = { left: 269, top: 385, width: 79, height: 32 };

describe("floatOverlapsAvoid", () => {
  it("köşe kutusu kaçınılacak bölgeyle kesişince true, ayrıkken false; boyutsuz kutu sayılmaz", () => {
    document.body.innerHTML = `<div data-float-avoid id="a"></div><div id="d"></div>`;
    const avoid = document.getElementById("a")!;
    const d = document.getElementById("d")!;
    setBox(d, CORNER);
    setBox(avoid, { left: 16, top: 352, width: 328, height: 72 });
    expect(floatOverlapsAvoid(d)).toBe(true);
    setBox(avoid, { left: 16, top: 120, width: 328, height: 72 });
    expect(floatOverlapsAvoid(d)).toBe(false);
    setBox(avoid, { left: 16, top: 352, width: 328, height: 72 });
    setBox(d, { left: 0, top: 0, width: 0, height: 0 });
    expect(floatOverlapsAvoid(d)).toBe(false);
    document.body.innerHTML = "";
  });
});

describe("FloatingRequestDock", () => {
  it("arama satırı köşeden uzakken düğme görünür ve dokunulur", () => {
    render(<Page />);
    act(() => {
      setBox(screen.getByTestId("arama"), { left: 16, top: 220, width: 328, height: 72 });
      setBox(dock(), { left: 269, top: 736, width: 79, height: 32 });
      window.dispatchEvent(new Event("scroll"));
    });
    expect(dock()).not.toHaveAttribute("aria-hidden");
    expect(dock()).not.toHaveAttribute("inert");
    expect(dock()).toHaveClass("opacity-100");
    expect(dock()).not.toHaveClass("pointer-events-none");
  });

  it("yatay telefonda sayfa başı: köşe arama satırıyla kesişirken çekilir, kaydırınca geri gelir", () => {
    render(<Page />);
    const search = screen.getByTestId("arama");
    act(() => {
      // 844×390: "Ara" 740..820 × 304..360, düğme 722..824 × 326..370.
      setBox(search, { left: 24, top: 296, width: 796, height: 72 });
      setBox(dock(), { left: 722, top: 326, width: 102, height: 44 });
      window.dispatchEvent(new Event("resize"));
    });
    expect(dock()).toHaveAttribute("data-float-hidden", "overlap");
    expect(dock()).toHaveAttribute("aria-hidden", "true");
    expect(dock()).toHaveAttribute("inert");
    expect(dock()).toHaveClass("pointer-events-none", "opacity-0");

    act(() => {
      setBox(search, { left: 24, top: 96, width: 796, height: 72 });
      window.dispatchEvent(new Event("scroll"));
    });
    expect(dock()).not.toHaveAttribute("data-float-hidden");
    expect(dock()).toHaveClass("opacity-100");
  });

  it("dokunmatik cihazda yazarken (klavye açık) çekilir; alan bırakılınca geri gelir", () => {
    coarse = true;
    render(<Page />);
    act(() => {
      setBox(screen.getByTestId("arama"), { left: 16, top: 120, width: 328, height: 72 });
      setBox(dock(), CORNER);
      window.dispatchEvent(new Event("scroll"));
    });
    expect(dock()).not.toHaveAttribute("data-float-hidden");

    act(() => screen.getByLabelText("Ara").focus());
    expect(dock()).toHaveAttribute("data-float-hidden", "typing");
    expect(dock()).toHaveAttribute("inert");

    act(() => {
      screen.getByLabelText("Ara").blur();
    });
    // focusout kararı bir sonraki görevde verilir.
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        expect(dock()).not.toHaveAttribute("data-float-hidden");
        resolve();
      }, 10),
    );
  });

  it("fareyle (masaüstü) arama kutusuna odaklanmak düğmeyi çekmez", () => {
    coarse = false;
    render(<Page />);
    act(() => {
      setBox(screen.getByTestId("arama"), { left: 24, top: 296, width: 900, height: 72 });
      setBox(dock(), { left: 1100, top: 736, width: 110, height: 44 });
      window.dispatchEvent(new Event("scroll"));
    });
    act(() => screen.getByLabelText("Ara").focus());
    expect(dock()).not.toHaveAttribute("data-float-hidden");
  });

  it("konum sınıfları köşe kabında; düğme kabın içinde kalır", () => {
    render(<Page />);
    expect(dock()).toHaveClass("fixed", "right-3", "bottom-3", "flex");
    expect(dock()).toContainElement(screen.getByRole("button", { name: "Talep aç" }));
  });

  // Öykünücü / WebView 124: herkese açık `<main>` `@container`; eski motor onu
  // `fixed` köşenin içerik bloğu yapıyor, düğme sayfanın sonuna düşüyordu →
  // kab kendini `ViewportLayer` ile `body`ye taşır.
  it("köşe kabı body'de (ViewportLayer): kapsayıcı main'in içinde değil", () => {
    render(
      <main className="@container">
        <Page />
      </main>,
    );
    expect(dock().parentElement).toBe(document.body);
    expect(document.querySelector("main")).not.toContainElement(dock());
    expect(document.querySelector("main")).toContainElement(screen.getByTestId("arama"));
  });

  it("hidrasyon yolunda kab bir çizim sonra gelir: ilk ölçüm kaydırma beklemeden yapılır (köşe aramayla kesişiyorsa çekilir)", async () => {
    // Kab hidrasyondan SONRA yaratılır → kutular öğeye değil seçiciye göre.
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.matches("[data-float-avoid]")) return rect({ left: 24, top: 296, width: 796, height: 72 });
      if (this.matches(".fixed")) return rect({ left: 722, top: 326, width: 102, height: 44 });
      return rect({ left: 0, top: 0, width: 0, height: 0 });
    };
    const ui = (
      <main className="@container">
        <Page />
      </main>
    );
    const html = renderToString(ui);
    expect(html).not.toContain("Talep aç");
    const root = document.createElement("div");
    root.innerHTML = html;
    document.body.appendChild(root);
    const onRecoverableError = vi.fn();
    let hydrated: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      hydrated = hydrateRoot(root, ui, { onRecoverableError });
    });
    try {
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(dock().parentElement).toBe(document.body);
      // Kaydırma / boyut olayı YOK: ölçüm kab bağlanınca koştu.
      expect(dock()).toHaveAttribute("data-float-hidden", "overlap");
    } finally {
      act(() => hydrated?.unmount());
      root.remove();
    }
  });
});
