// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * İstemci hata bildirimi — Next akış sinyalleri (notFound/redirect) hata
 * DEĞİLDİR (arayüz testi webA-12 yeniden doğrulama): React eşzamanlı çizimde
 * atılan `notFound()`u kurtarınca Next `onRecoverableError` ile `reportError`a
 * veriyor; bu modül de onu Sentry'e yazıyordu.
 */
const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));

function signal(digest: string): Error {
  const err = new Error(digest) as Error & { digest: string };
  err.digest = digest;
  return err;
}

async function load() {
  vi.resetModules();
  return import("../client-error");
}

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isNextControlFlowSignal", () => {
  it("notFound / forbidden / redirect işaretlerini tanır, sıradan hatayı tanımaz", async () => {
    const { isNextControlFlowSignal } = await load();
    expect(isNextControlFlowSignal(signal("NEXT_HTTP_ERROR_FALLBACK;404"))).toBe(true);
    expect(isNextControlFlowSignal(signal("NEXT_HTTP_ERROR_FALLBACK;403"))).toBe(true);
    expect(isNextControlFlowSignal(signal("NEXT_REDIRECT;replace;/company;307;"))).toBe(true);
    // Mesajı benzeyen ama digest'i olmayan gerçek hata süzülmez.
    expect(isNextControlFlowSignal(new Error("NEXT_HTTP_ERROR_FALLBACK;404"))).toBe(false);
    expect(isNextControlFlowSignal(signal("1234567890"))).toBe(false);
    expect(isNextControlFlowSignal(new TypeError("x is undefined"))).toBe(false);
    expect(isNextControlFlowSignal(null)).toBe(false);
    expect(isNextControlFlowSignal("NEXT_REDIRECT;")).toBe(false);
  });
});

describe("reportClientError", () => {
  it("akış sinyalini sunucuya GÖNDERMEZ, gerçek hatayı gönderir", async () => {
    const { reportClientError } = await load();
    reportClientError(signal("NEXT_HTTP_ERROR_FALLBACK;404"), { kind: "window.error" });
    expect(fetchMock).not.toHaveBeenCalled();
    reportClientError(new TypeError("boom"), { kind: "window.error" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual(["/api/client-error", expect.objectContaining({ method: "POST" })]);
  });
});

describe("installGlobalErrorReporter", () => {
  it("reportError ile gelen notFound işaretini işlenmiş sayar (preventDefault) ve bildirmez", async () => {
    const { installGlobalErrorReporter } = await load();
    installGlobalErrorReporter();
    const ev = new ErrorEvent("error", { error: signal("NEXT_HTTP_ERROR_FALLBACK;404"), cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    const real = new ErrorEvent("error", { error: new Error("real error"), cancelable: true });
    window.dispatchEvent(real);
    expect(real.defaultPrevented).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
