// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { opensKeyboard, useTouchTyping } from "../use-touch-typing";

/**
 * Mobil denetim g08: teklif formunun sabit alt çubuğu, dokunmatik cihazda
 * klavye açıkken yazılan alanı örtüyordu → kanca alan odaktayken `true` döner.
 */
function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  const typing = useTouchTyping(ref);
  return (
    <>
      <div ref={ref}>
        <input aria-label="fiyat" />
        <input aria-label="ikinci" />
        <input type="checkbox" aria-label="kutu" />
        <textarea aria-label="not" />
        <select aria-label="secim">
          <option>a</option>
        </select>
      </div>
      <input aria-label="disarida" />
      <output data-testid="durum">{typing ? "yaziyor" : "bos"}</output>
    </>
  );
}

const originalMatchMedia = window.matchMedia;
let coarse = true;
let viewport: (EventTarget & { height: number }) | null = null;

function setMatchMedia() {
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
}

function installViewport(height: number) {
  viewport = Object.assign(new EventTarget(), { height });
  Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
}

function resizeViewport(height: number) {
  act(() => {
    viewport!.height = height;
    viewport!.dispatchEvent(new Event("resize"));
  });
}

const state = () => screen.getByTestId("durum").textContent;
const focus = (label: string) => act(() => screen.getByLabelText(label).focus());

beforeEach(() => {
  coarse = true;
  setMatchMedia();
  installViewport(800);
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
  viewport = null;
});

describe("useTouchTyping", () => {
  it("dokunmatik cihazda kök içindeki metin alanı odaktayken true; odak çıkınca false", async () => {
    render(<Harness />);
    expect(state()).toBe("bos");
    focus("fiyat");
    expect(state()).toBe("yaziyor");
    focus("not");
    await waitFor(() => expect(state()).toBe("yaziyor"));
    act(() => (screen.getByLabelText("not") as HTMLTextAreaElement).blur());
    await waitFor(() => expect(state()).toBe("bos"));
  });

  it("klavye açmayan denetim (onay kutusu, select) ve kök dışındaki alan çubuğu gizletmez", async () => {
    render(<Harness />);
    focus("kutu");
    expect(state()).toBe("bos");
    focus("secim");
    await waitFor(() => expect(state()).toBe("bos"));
    focus("disarida");
    await waitFor(() => expect(state()).toBe("bos"));
  });

  it("fareli (ince işaretçi) cihazda hiç gizlemez", () => {
    coarse = false;
    setMatchMedia();
    render(<Harness />);
    focus("fiyat");
    expect(state()).toBe("bos");
  });

  it("Android geri tuşu klavyeyi kapatıp odağı bırakmadıysa çubuk geri gelir; sonraki odakta yine gizlenir", async () => {
    render(<Harness />);
    focus("fiyat");
    expect(state()).toBe("yaziyor");
    resizeViewport(460); // klavye açıldı (görünüm alanı 340 px kısaldı)
    expect(state()).toBe("yaziyor");
    resizeViewport(800); // klavye kapandı, odak hâlâ alanda
    expect(state()).toBe("bos");
    // Aynı alana yeniden dokunuldu: `focusin` gelmez, klavye yine açılır.
    resizeViewport(460);
    expect(state()).toBe("yaziyor");
    resizeViewport(800);
    expect(state()).toBe("bos");
    focus("ikinci");
    await waitFor(() => expect(state()).toBe("yaziyor"));
  });

  it("opensKeyboard: metin/sayı girişi ve textarea evet; salt okunur, tarih ve dosya hayır", () => {
    const text = document.createElement("input");
    const ro = document.createElement("input");
    ro.readOnly = true;
    const date = document.createElement("input");
    date.type = "date";
    const file = document.createElement("input");
    file.type = "file";
    const num = document.createElement("input");
    num.inputMode = "decimal";
    expect(opensKeyboard(text)).toBe(true);
    expect(opensKeyboard(num)).toBe(true);
    expect(opensKeyboard(document.createElement("textarea"))).toBe(true);
    expect(opensKeyboard(ro)).toBe(false);
    expect(opensKeyboard(date)).toBe(false);
    expect(opensKeyboard(file)).toBe(false);
    expect(opensKeyboard(null)).toBe(false);
  });
});
