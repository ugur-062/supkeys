// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { revealFirstInvalid, revealInvalidControl, useFocusFirstInvalid } from "../use-focus-first-invalid";

/**
 * Geçersiz ilk alana odak — etiket ekranda kalmalı (duman testi 2026-10-08:
 * düz `.focus()` kutuyu pencerenin üst kenarına yaslıyor, "Ad" etiketi
 * görünür alanın dışında kalıyordu).
 */
function Form({ invalid }: { invalid: boolean }) {
  const { ref, focusFirstInvalid } = useFocusFirstInvalid<HTMLFormElement>();
  return (
    <form ref={ref}>
      <div data-slot="field" data-testid="alan">
        <label htmlFor="ad">Ad</label>
        <input id="ad" aria-invalid={invalid ? "true" : undefined} />
      </div>
      <button type="button" onClick={focusFirstInvalid}>
        Gönder
      </button>
    </form>
  );
}

const rectOf = (top: number, bottom: number) =>
  ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

describe("useFocusFirstInvalid", () => {
  afterEach(() => vi.restoreAllMocks());

  it("odağı kaydırmasız verir ve görünmeyen alanın KABINI (etiketiyle) ortalar", () => {
    render(<Form invalid />);
    const input = screen.getByLabelText("Ad");
    const box = screen.getByTestId("alan");
    const focus = vi.spyOn(input, "focus");
    const scroll = vi.fn();
    box.scrollIntoView = scroll;
    // Kap pencerenin üstünde kalmış (etiket görünmüyor).
    vi.spyOn(box, "getBoundingClientRect").mockReturnValue(rectOf(-40, 30));
    act(() => screen.getByRole("button", { name: "Gönder" }).click());
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scroll).toHaveBeenCalledWith({ block: "center" });
  });

  it("alan zaten tam görünüyorsa sayfa kaydırılmaz", () => {
    render(<Form invalid />);
    const box = screen.getByTestId("alan");
    const scroll = vi.fn();
    box.scrollIntoView = scroll;
    vi.spyOn(box, "getBoundingClientRect").mockReturnValue(rectOf(120, 200));
    act(() => screen.getByRole("button", { name: "Gönder" }).click());
    expect(document.activeElement).toBe(screen.getByLabelText("Ad"));
    expect(scroll).not.toHaveBeenCalled();
  });

  it("geçersiz alan yoksa hiçbir şey yapmaz", () => {
    render(<Form invalid={false} />);
    act(() => screen.getByRole("button", { name: "Gönder" }).click());
    expect(document.activeElement).not.toBe(screen.getByLabelText("Ad"));
  });

  it("geçersiz alan yoksa verilen yedek (bölüme kaydır) çağrılır", () => {
    const fallback = vi.fn();
    function WithFallback() {
      const { ref, focusFirstInvalid } = useFocusFirstInvalid<HTMLFormElement>();
      return (
        <form ref={ref}>
          <input aria-label="Ad" />
          <button type="button" onClick={() => focusFirstInvalid(fallback)}>
            Gönder
          </button>
        </form>
      );
    }
    render(<WithFallback />);
    act(() => screen.getByRole("button", { name: "Gönder" }).click());
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});

/**
 * Mobil denetim 2026-10 g06: Talep Şartları'nda odaklanan "Özel gün" kutusu
 * y = 0–37'de, sabit üst çubuğun (56 px) altında kalıyordu — yumuşak kaydırma +
 * düz `focus()` kaydırmayı kesiyor, kutu "görünür" sayılıyordu.
 */
describe("revealInvalidControl", () => {
  afterEach(() => vi.restoreAllMocks());

  it("önce KAYDIRMASIZ odak, sonra anında ortalama", () => {
    render(<input aria-label="Gün" aria-invalid="true" />);
    const input = screen.getByLabelText("Gün");
    const calls: string[] = [];
    vi.spyOn(input, "focus").mockImplementation((opts) => {
      calls.push(`focus:${JSON.stringify(opts)}`);
    });
    input.scrollIntoView = vi.fn((opts) => {
      calls.push(`scroll:${JSON.stringify(opts)}`);
    });
    // Alan sabit üst çubuğun ALTINDA (y 0–37) kalmış gibi.
    vi.spyOn(input, "getBoundingClientRect").mockReturnValue(rectOf(0, 37));
    revealInvalidControl(input);
    expect(calls).toEqual(['focus:{"preventScroll":true}', 'scroll:{"block":"center"}']);
  });

  it("üst çubuğun altında kalan (y < 64) alan 'görünür' sayılmaz, ortalanır", () => {
    render(<input aria-label="Gün" aria-invalid="true" />);
    const input = screen.getByLabelText("Gün");
    const scroll = vi.fn();
    input.scrollIntoView = scroll;
    vi.spyOn(input, "getBoundingClientRect").mockReturnValue(rectOf(20, 57));
    revealInvalidControl(input);
    expect(scroll).toHaveBeenCalledWith({ block: "center" });
  });

  it("kapalı <details> içindeki alanı açar; odaklanamayan kaptaki ilk denetime odaklanır", () => {
    render(
      <details data-testid="detay">
        <summary>Detaylar</summary>
        <div data-reveal-invalid="true" data-testid="kap">
          <button type="button">Kategori seç</button>
        </div>
      </details>,
    );
    expect(revealFirstInvalid(document)).toBe(true);
    expect((screen.getByTestId("detay") as HTMLDetailsElement).open).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Kategori seç" }));
  });

  it("görünür alandan uzun kap: üst kenar çubuğun altına hizalanır (geçici scroll-margin)", () => {
    render(<div data-slot="field" data-testid="uzun"><input aria-label="Uzun" aria-invalid="true" /></div>);
    const box = screen.getByTestId("uzun");
    let marginAtScroll = "";
    box.scrollIntoView = vi.fn(() => {
      marginAtScroll = box.style.scrollMarginTop;
    });
    vi.spyOn(box, "getBoundingClientRect").mockReturnValue(rectOf(-200, 900));
    revealInvalidControl(screen.getByLabelText("Uzun"));
    expect(box.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(marginAtScroll).toBe("64px");
    expect(box.style.scrollMarginTop).toBe("");
  });

  // Mobil kabuk (güvenli alan): çentikli telefonda üst çubuk 56 + 47 px ve kök
  // `scroll-padding-top` 47 px — kaydırma kök payını kendisi ekler, geçici pay
  // onu düşer (üst kenar çubuğun 8 px altına iner, 47 px daha aşağı değil).
  it("güvenli alan: ölçülen uzun üst çubuk + kök scroll-padding-top iki kez sayılmaz", () => {
    render(<div data-slot="field" data-testid="uzun"><input aria-label="Uzun" aria-invalid="true" /></div>);
    const box = screen.getByTestId("uzun");
    const bar = document.createElement("header");
    bar.style.position = "fixed";
    document.body.appendChild(bar);
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue(rectOf(0, 103));
    const doc = document as { elementFromPoint?: unknown };
    doc.elementFromPoint = () => bar;
    document.documentElement.style.scrollPaddingTop = "47px";
    try {
      let marginAtScroll = "";
      box.scrollIntoView = vi.fn(() => {
        marginAtScroll = box.style.scrollMarginTop;
      });
      vi.spyOn(box, "getBoundingClientRect").mockReturnValue(rectOf(-200, 900));
      revealInvalidControl(screen.getByLabelText("Uzun"));
      expect(box.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
      // (103 + 8) − 47 = 64
      expect(marginAtScroll).toBe("64px");
    } finally {
      document.documentElement.style.scrollPaddingTop = "";
      delete doc.elementFromPoint;
      bar.remove();
    }
  });
});
