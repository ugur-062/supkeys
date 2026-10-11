// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFocusFirstInvalid } from "../use-focus-first-invalid";

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
});
