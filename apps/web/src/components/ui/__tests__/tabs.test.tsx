// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tabs } from "../tabs";

/**
 * Arayüz testi webA-03 yeniden doğrulama: `#belgeler` çapası sekmeyi
 * seçiyordu ama sayfa kaydırılmıyordu — panel yalnız seçilince bağlandığı
 * için ne tarayıcı ne `useScrollToHash` öğeyi bulabiliyordu.
 */
const items = [
  { id: "ozellikler", label: "Özellikler", content: <p>özellik içeriği</p> },
  { id: "belgeler", label: "Belgeler", content: <p>belge içeriği</p> },
];

afterEach(() => {
  window.history.replaceState(null, "", window.location.pathname);
  vi.restoreAllMocks();
});

describe("Tabs hashSync", () => {
  it("çapadaki sekmeyi seçer ve sekme çubuğunu görünür alana kaydırır", () => {
    window.history.replaceState(null, "", "#belgeler");
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    render(<Tabs items={items} hashSync />);
    expect(screen.getByText("belge içeriği")).toBeInTheDocument();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(screen.getByRole("tablist"));
  });

  it("çapa sekme değilse kaydırmaz (başka bölüm çapası useScrollToHash'e kalır)", () => {
    window.history.replaceState(null, "", "#bilgi-iste");
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    render(<Tabs items={items} hashSync />);
    expect(screen.getByText("özellik içeriği")).toBeInTheDocument();
    expect(scroll).not.toHaveBeenCalled();
  });
});

/**
 * Mobil denetim 2026-10 g02: telefonda sekmeler çubuğa sığmıyor (RU 577 px
 * içerik / 342 px çubuk) ve gizli kaydırma çubuğu yüzünden son sekme hiç
 * görünmüyordu. Taşan yönde kenar solar; seçilen sekme çubukta tam görünür
 * olacak kadar YATAYDA kaydırılır (sayfa dikeyde oynamaz). jsdom yerleşim
 * yapmaz → ölçüler elle.
 */
describe("Tabs — taşan sekme çubuğu", () => {
  const three = [
    { id: "ozellikler", label: "Характеристики товара", content: <p>a</p> },
    { id: "teknik", label: "Технические характеристики", content: <p>b</p> },
    { id: "sertifikalar", label: "Сертификаты", content: <p>c</p> },
  ];

  function size(scrollWidth: number, clientWidth: number) {
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scrollWidth);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(clientWidth);
  }

  it("sığmıyorsa sağ kenar solar; sona kaydırınca sol kenar", () => {
    size(577, 342);
    render(<Tabs items={three} />);
    const list = screen.getByRole("tablist");
    expect(list).toHaveAttribute("data-overflow-end");
    expect(list).not.toHaveAttribute("data-overflow-start");
    expect(list.className).toContain("[mask-image:linear-gradient(to_right,white_calc(100%_-_2.5rem),transparent)]");

    act(() => {
      list.scrollLeft = 235;
      fireEvent.scroll(list);
    });
    expect(list).toHaveAttribute("data-overflow-start");
    expect(list).not.toHaveAttribute("data-overflow-end");
    expect(list.className).toContain("[mask-image:linear-gradient(to_right,transparent,white_2.5rem)]");
  });

  it("sığıyorsa (masaüstü) maske yok", () => {
    size(383, 900);
    render(<Tabs items={three} />);
    const list = screen.getByRole("tablist");
    expect(list).not.toHaveAttribute("data-overflow-end");
    expect(list.className).not.toContain("mask-image");
  });

  it("kısmen görünen sekme seçilince çubuk onu tam gösterecek kadar kayar", () => {
    size(577, 342);
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const box = (left: number, right: number) => ({ left, right, top: 0, bottom: 40, width: right - left, height: 40, x: left, y: 0 }) as DOMRect;
      if (this.getAttribute("role") === "tablist") return box(16, 358);
      if (this.textContent === "Сертификаты") return box(330, 440);
      if (this.textContent === "Технические характеристики") return box(184, 326);
      return box(16, 180);
    });
    render(<Tabs items={three} />);
    const list = screen.getByRole("tablist");
    list.scrollLeft = 0;
    expect(list.scrollLeft).toBe(0); // ilk sekme zaten görünür
    fireEvent.click(screen.getByRole("tab", { name: "Сертификаты" }));
    expect(screen.getByRole("tab", { name: "Сертификаты" })).toHaveAttribute("aria-selected", "true");
    // Sekmenin sağı (440) çubuğun sağından solan kenar payı kadar içeri (358 − 40).
    expect(list.scrollLeft).toBe(440 - (358 - 40));
    // Sayfa dikeyde oynamaz.
    expect(scroll).not.toHaveBeenCalled();
  });

  it("çubuğun boyu değişmeden genişleyen sekmeleri de izler (kalınlaşma, geç yüklenen yazı tipi)", () => {
    const observed: Element[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(el: Element) {
          observed.push(el);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    try {
      render(<Tabs items={three} />);
      const list = screen.getByRole("tablist");
      expect(observed).toContain(list);
      for (const tab of screen.getAllByRole("tab")) expect(observed).toContain(tab);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
