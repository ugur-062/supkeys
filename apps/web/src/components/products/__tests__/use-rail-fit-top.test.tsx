// @vitest-environment jsdom
/**
 * Mobil denetim r6 (masaüstü): ürün düzenleyicisinin yapışkan rayı görünür
 * alanla sınırlı ve içinde kayar. Formül `max(yapışma ofseti, rayın o anki
 * üstü)` kullanır; bu kanca rayın o anki üstünü `--rail-fit-top` olarak yazar —
 * henüz yapışmamış ilk görünümde de ray AI düğmesinin üstünde bitsin.
 */
import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RAIL_FIT_QUERY, RAIL_FIT_TOP_VAR, useRailFitTop } from "../use-rail-fit-top";

type Listener = (e: { matches: boolean }) => void;

let mq: { matches: boolean; listeners: Listener[] };
let frames: FrameRequestCallback[];
let top: number;
const origMatchMedia = window.matchMedia;

function flushFrames() {
  const pending = frames;
  frames = [];
  for (const cb of pending) cb(0);
}

function Rail() {
  const ref = useRef<HTMLElement>(null);
  const layout = useRef<HTMLDivElement>(null);
  useRailFitTop(ref, layout);
  return (
    <div ref={layout}>
      <aside ref={ref} data-testid="rail" />
    </div>
  );
}

beforeEach(() => {
  mq = { matches: true, listeners: [] };
  frames = [];
  top = 248;
  window.matchMedia = ((query: string) => {
    expect(query).toBe(RAIL_FIT_QUERY);
    return {
      get matches() {
        return mq.matches;
      },
      media: query,
      addEventListener: (_: string, cb: Listener) => mq.listeners.push(cb),
      removeEventListener: (_: string, cb: Listener) => {
        mq.listeners = mq.listeners.filter((l) => l !== cb);
      },
    };
  }) as unknown as typeof window.matchMedia;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ top, height: 400, width: 320, left: 0, right: 320, bottom: top + 400, x: 0, y: top, toJSON() {} }) as DOMRect,
  );
});

afterEach(() => {
  window.matchMedia = origMatchMedia;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const railVar = (el: HTMLElement) => el.style.getPropertyValue(RAIL_FIT_TOP_VAR);

describe("useRailFitTop", () => {
  it("lg'de rayın o anki üstünü yazar; sayfa kayınca günceller", () => {
    const { getByTestId } = render(<Rail />);
    const rail = getByTestId("rail");
    // İlk görünüm: ray henüz yapışmadı, üstü çubuğun ve başlığın altında.
    expect(railVar(rail)).toBe("248px");

    top = 156; // yapıştı
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    // Kaydırma karesi gelene dek yazılmaz (kare başına bir ölçüm).
    expect(railVar(rail)).toBe("248px");
    act(() => flushFrames());
    expect(railVar(rail)).toBe("156px");
  });

  it("değer değişmedikçe yeniden yazmaz (yapışmış rayda kaydırma hiçbir şey yazmaz)", () => {
    const { getByTestId } = render(<Rail />);
    const rail = getByTestId("rail");
    const set = vi.spyOn(rail.style, "setProperty");
    for (let i = 0; i < 3; i++) {
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      act(() => flushFrames());
    }
    expect(set).not.toHaveBeenCalled();
    // Bir karede birden çok kaydırma olayı tek ölçüm.
    top = 200;
    act(() => {
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("scroll"));
    });
    expect(frames).toHaveLength(1);
    act(() => flushFrames());
    expect(set).toHaveBeenCalledTimes(1);
    expect(railVar(rail)).toBe("200px");
  });

  it("lg altında yazmaz ve kaydırmayı dinlemez (ray orada akışta)", () => {
    mq.matches = false;
    const { getByTestId } = render(<Rail />);
    const rail = getByTestId("rail");
    expect(railVar(rail)).toBe("");
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(frames).toHaveLength(0);
  });

  it("kırılım değişince değişkeni yazar / siler", () => {
    mq.matches = false;
    const { getByTestId } = render(<Rail />);
    const rail = getByTestId("rail");
    mq.matches = true;
    act(() => mq.listeners.forEach((l) => l({ matches: true })));
    expect(railVar(rail)).toBe("248px");
    mq.matches = false;
    act(() => mq.listeners.forEach((l) => l({ matches: false })));
    expect(railVar(rail)).toBe("");
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(frames).toHaveLength(0);
  });

  it("ayrılınca dinleyicileri bırakır", () => {
    const { unmount } = render(<Rail />);
    unmount();
    expect(mq.listeners).toHaveLength(0);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
    });
    expect(frames).toHaveLength(0);
  });
});
