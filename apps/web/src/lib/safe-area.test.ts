// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cssLengthPx, rootScrollPaddingTop, rootScrollPaddingTopFor, TOPBAR_BASE_PX, topbarHeightPx } from "./safe-area";

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.scrollPaddingTop = "";
  document.body.innerHTML = "";
});

describe("safe-area — güvenli alanın JS tarafı (mobil kabuk 2026-10)", () => {
  it("cssLengthPx ifadeyi ölçü öğesiyle çözer ve öğeyi kaldırır; ölçülemezse yedek", () => {
    // jsdom yerleşim yapmaz → 0 yükseklik → yedek.
    expect(cssLengthPx("var(--topbar-h)", 56)).toBe(56);
    expect(topbarHeightPx()).toBe(TOPBAR_BASE_PX);
    let probeHeight = "";
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      probeHeight = this.style.height;
      return { height: 103 } as DOMRect;
    });
    expect(topbarHeightPx()).toBe(103);
    expect(probeHeight).toBe("var(--topbar-h, 3.5rem)");
    expect(document.body.children).toHaveLength(0);
  });

  it("kökün scroll-padding-top'u yalnız belge kaydırmasında sayılır", () => {
    expect(rootScrollPaddingTop()).toBe(0);
    document.documentElement.style.scrollPaddingTop = "47px";
    expect(rootScrollPaddingTop()).toBe(47);

    const inDocument = document.createElement("div");
    document.body.appendChild(inDocument);
    expect(rootScrollPaddingTopFor(inDocument)).toBe(47);

    // Kayan iç kap (pencere gövdesi): kök payı uygulanmaz.
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    Object.defineProperty(scroller, "scrollHeight", { value: 900 });
    Object.defineProperty(scroller, "clientHeight", { value: 300 });
    const inner = document.createElement("div");
    scroller.appendChild(inner);
    document.body.appendChild(scroller);
    expect(rootScrollPaddingTopFor(inner)).toBe(0);
  });
});
