// @vitest-environment jsdom
/**
 * SÜZGEÇ ÇEKMECESİ + EKRAN KLAVYESİ (mobil denetim g02 "Yakınımda",
 * doğrulama 2026-10-15): klavye açıkken çekmecedeki yazı alanının öneri
 * listesi altlığın ve klavyenin arkasında kalıyordu. Klavye açıkken (görünür
 * alan kısaldı) yazı alanı odaktaysa altlık gizlenir ve alan çekmece
 * gövdesinin üstüne taşınır. Klavye `innerHeight` küçültülerek taklit edilir
 * (Android WebView klavyede pencereyi yeniden boyutlandırır).
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/urunler",
}));

import { FILTER_DRAWER_BODY_ATTR, FilterShell, KEYBOARD_MIN_PX, MobileFilterButton, revealInFilterDrawer } from "../filter-shell";

const heightDesc = Object.getOwnPropertyDescriptor(window, "innerHeight");
function setHeight(h: number) {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: h });
  window.dispatchEvent(new Event("resize"));
}

beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
  window.sessionStorage.clear();
  setHeight(780);
});

afterEach(() => {
  if (heightDesc) Object.defineProperty(window, "innerHeight", heightDesc);
});

function renderDrawer() {
  render(
    <FilterShell
      basePath="/urunler"
      total={43}
      pushFilters
      drawer={
        <div>
          <input aria-label="Yakınımda" />
          <input type="checkbox" aria-label="Doğrulanmış" />
        </div>
      }
    >
      <MobileFilterButton />
    </FilterShell>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Süzgeçler/ }));
}

const footer = () => screen.queryByRole("button", { name: /Sonuçları göster/ });

describe("süzgeç çekmecesi — ekran klavyesi", () => {
  it("yazı alanı odakta ve klavye açık: altlık gizlenir; klavye kapanınca geri gelir", async () => {
    renderDrawer();
    expect(footer()).toBeInTheDocument();
    act(() => screen.getByLabelText("Yakınımda").focus());
    // Odak var ama klavye henüz açılmadı (fiziksel klavye): altlık yerinde.
    await act(async () => new Promise((r) => setTimeout(r, 40)));
    expect(footer()).toBeInTheDocument();
    act(() => setHeight(780 - KEYBOARD_MIN_PX - 231));
    await waitFor(() => expect(footer()).toBeNull());
    act(() => setHeight(780));
    await waitFor(() => expect(footer()).toBeInTheDocument());
  });

  it("kutucuk odaktayken görünür alan kısalsa da altlık durur (klavye açan alan değil)", async () => {
    renderDrawer();
    act(() => screen.getByLabelText("Doğrulanmış").focus());
    act(() => setHeight(429));
    await act(async () => new Promise((r) => setTimeout(r, 60)));
    expect(footer()).toBeInTheDocument();
  });

  it("odak çekmeceden çıkınca altlık geri gelir", async () => {
    renderDrawer();
    act(() => screen.getByLabelText("Yakınımda").focus());
    act(() => setHeight(429));
    await waitFor(() => expect(footer()).toBeNull());
    act(() => screen.getByLabelText("Doğrulanmış").focus());
    await waitFor(() => expect(footer()).toBeInTheDocument());
  });
});

describe("revealInFilterDrawer", () => {
  function build(insideDrawer: boolean, label?: { top: number; bottom: number }) {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    const body = document.createElement("div");
    if (insideDrawer) body.setAttribute(FILTER_DRAWER_BODY_ATTR, "");
    const input = document.createElement("input");
    if (label) {
      const p = document.createElement("p");
      p.textContent = "Yakınımda";
      p.getBoundingClientRect = () => label as DOMRect;
      body.append(p);
    }
    body.append(input);
    scroller.append(body);
    document.body.append(scroller);
    let top = 50;
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      get: () => top,
      set: (v: number) => {
        top = v;
      },
    });
    scroller.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
    input.getBoundingClientRect = () => ({ top: 340 }) as DOMRect;
    return { scroller, input, scrollTop: () => top };
  }

  it("çekmecedeki alanı kaydırma kabının üstüne taşır (8 px pay)", () => {
    const { input, scrollTop, scroller } = build(true);
    revealInFilterDrawer(input);
    expect(scrollTop()).toBe(50 + 340 - 100 - 8);
    scroller.remove();
  });

  it("hemen üstündeki başlık ('Yakınımda') da görünür kalır", () => {
    const { input, scrollTop, scroller } = build(true, { top: 316, bottom: 334 });
    revealInFilterDrawer(input);
    expect(scrollTop()).toBe(50 + 316 - 100 - 8);
    scroller.remove();
  });

  it("alanı SARAN etiketin metni (fiyat kutusu 'Min. (₺)') da görünür kalır", () => {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    const body = document.createElement("div");
    body.setAttribute(FILTER_DRAWER_BODY_ATTR, "");
    const label = document.createElement("label");
    label.append("Min. (₺)");
    const input = document.createElement("input");
    label.append(input);
    body.append(label);
    scroller.append(body);
    document.body.append(scroller);
    let top = 50;
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      get: () => top,
      set: (v: number) => {
        top = v;
      },
    });
    scroller.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
    label.getBoundingClientRect = () => ({ top: 320, bottom: 376 }) as DOMRect;
    input.getBoundingClientRect = () => ({ top: 340 }) as DOMRect;
    revealInFilterDrawer(input);
    expect(top).toBe(50 + 320 - 100 - 8);
    // Etiket alandan çok yukarıda başlıyorsa (uzun sarmalayıcı) yalnız alan taşınır.
    top = 50;
    label.getBoundingClientRect = () => ({ top: 200, bottom: 376 }) as DOMRect;
    revealInFilterDrawer(input);
    expect(top).toBe(50 + 340 - 100 - 8);
    scroller.remove();
  });

  it("çekmece dışındaki alana (masaüstü kenar rayı) dokunmaz", () => {
    const { input, scrollTop, scroller } = build(false);
    revealInFilterDrawer(input);
    expect(scrollTop()).toBe(50);
    scroller.remove();
  });
});
