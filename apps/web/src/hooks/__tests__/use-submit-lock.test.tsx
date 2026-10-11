// @vitest-environment jsdom
/**
 * Ortak gönderim kilidi (arayüz testi FX-00): React Query `isPending` ancak
 * bir sonraki render'da görünür; 0–8 ms arayla iki tık / iki Enter ikinci
 * isteği atıyordu. Kilit tıkla AYNI tikte (ref) kapanır.
 */
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useDialogSubmitLock, useSubmitLock } from "../use-submit-lock";

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useSubmitLock", () => {
  it("uçuştaki ikinci çağrıyı yutar; bitince yeniden açılır", async () => {
    const { result } = renderHook(() => useSubmitLock());
    const d = deferred<string>();
    const fn = vi.fn(() => d.promise);
    let first: Promise<string | undefined>;
    let second: Promise<string | undefined>;
    act(() => {
      first = result.current.run(fn);
      second = result.current.run(fn);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.isLocked()).toBe(true);
    await expect(second!).resolves.toBeUndefined();
    await act(async () => {
      d.resolve("ok");
      await first!;
    });
    await expect(first!).resolves.toBe("ok");
    expect(result.current.locked).toBe(false);
    await act(async () => {
      await result.current.run(fn);
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("hata fırlatılınca kilit bırakılır ve hata çağırana iletilir", async () => {
    const { result } = renderHook(() => useSubmitLock());
    await act(async () => {
      await expect(result.current.run(() => Promise.reject(new Error("x")))).rejects.toThrow("x");
    });
    expect(result.current.isLocked()).toBe(false);
  });

  it("hızlı çift tık (aynı tik) tek istek üretir ve düğme kilitlenir", async () => {
    const d = deferred();
    const send = vi.fn(() => d.promise);
    function Form() {
      const lock = useSubmitLock();
      return (
        <button type="button" disabled={lock.locked} onClick={() => void lock.run(send)}>
          Gönder
        </button>
      );
    }
    render(<Form />);
    const btn = screen.getByRole("button", { name: "Gönder" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(send).toHaveBeenCalledTimes(1);
    expect(btn).toBeDisabled();
    await act(async () => {
      d.resolve();
      await d.promise;
    });
    expect(btn).not.toBeDisabled();
  });
});

describe("useDialogSubmitLock", () => {
  it("başarıda diyalog kapanırken kilit tutulur, yeniden açılınca bırakılır", async () => {
    const onSubmit = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(true);
      const lock = useDialogSubmitLock(open);
      return (
        <div>
          <button
            type="button"
            disabled={lock.locked}
            onClick={() =>
              void lock.run(async () => {
                onSubmit();
                setOpen(false);
              })
            }
          >
            Onayla
          </button>
          <button type="button" onClick={() => setOpen(true)}>
            Aç
          </button>
          <span data-testid="state">{open ? "open" : "closed"}</span>
        </div>
      );
    }
    render(<Harness />);
    const confirm = screen.getByRole("button", { name: "Onayla" });
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(screen.getByTestId("state")).toHaveTextContent("closed");
    // Kapanış animasyonu sırasında tık: ikinci istek yok.
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(confirm).toBeDisabled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aç" }));
    });
    expect(confirm).not.toBeDisabled();
  });

  it("işleyici diyaloğu açık bırakırsa (hata) kilit bırakılır", async () => {
    const { result } = renderHook(() => useDialogSubmitLock(true));
    await act(async () => {
      await result.current.run(async () => undefined);
    });
    expect(result.current.isLocked()).toBe(false);
  });
});
