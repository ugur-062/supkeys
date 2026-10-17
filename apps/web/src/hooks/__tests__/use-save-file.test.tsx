// @vitest-environment jsdom
/**
 * `useSaveFile` — kabuk sonuçlarını çağıran yerine söyleyen sarmalayıcı:
 * eklentisiz eski uygulama sürümünde çevrilmiş "siteden yapın" bilgisi, yerel
 * hatada çevrilmiş hata toast'ı (`failed`, fırlatmaz), iptalde sessizlik.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("sonner", () => ({ toast: h.toast }));

import { useSaveFile } from "../use-save-file";

type ShellWindow = Window & { Capacitor?: unknown };

const UNSUPPORTED = "Bu işlem uygulamanın bu sürümünde yok — rothern.com'dan yapabilirsiniz.";

function installShell(plugins: Record<string, unknown>) {
  (window as ShellWindow).Capacitor = { isNativePlatform: () => true, Plugins: plugins };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  URL.createObjectURL = vi.fn(() => "blob:x") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  delete (window as ShellWindow).Capacitor;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useSaveFile", () => {
  it("tarayıcıda indirir, toast basmaz", async () => {
    const { result } = renderHook(() => useSaveFile());
    expect(await result.current.saveFile(new Blob(["x"]), "a.xlsx")).toBe("downloaded");
    expect(h.toast.info).not.toHaveBeenCalled();
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  it("eklentisiz eski kabukta dosya → 'unsupported' + çevrilmiş 'siteden yapın' bilgisi", async () => {
    installShell({ App: {} });
    const { result } = renderHook(() => useSaveFile());
    expect(await result.current.saveFile(new Blob(["x"]), "a.xlsx")).toBe("unsupported");
    expect(h.toast.info).toHaveBeenCalledWith(UNSUPPORTED);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("eklentisiz eski kabukta yazdırma → 'unsupported' + aynı bilgi, pencere açılmaz", async () => {
    installShell({ App: {} });
    const open = vi.spyOn(window, "open");
    const { result } = renderHook(() => useSaveFile());
    expect(await result.current.printHtml("<p/>", "ORD-1")).toBe("unsupported");
    expect(h.toast.info).toHaveBeenCalledWith(UNSUPPORTED);
    expect(open).not.toHaveBeenCalled();
  });

  it("paylaşım kapatılırsa sessiz ('cancelled'), paylaşılırsa sessiz ('shared')", async () => {
    const share = vi.fn().mockRejectedValueOnce(new Error("Share canceled")).mockResolvedValueOnce({});
    installShell({
      Filesystem: { writeFile: vi.fn(async () => ({ uri: "file:///cache/a.xlsx" })) },
      Share: { share },
    });
    vi.useRealTimers(); // FileReader
    const { result } = renderHook(() => useSaveFile());
    expect(await result.current.saveFile(new Blob(["x"]), "a.xlsx")).toBe("cancelled");
    expect(await result.current.saveFile(new Blob(["x"]), "a.xlsx")).toBe("shared");
    expect(h.toast.info).not.toHaveBeenCalled();
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  it("yerel kaydetme hatası → çevrilmiş hata toast'ı + 'failed' (ham ileti basılmaz, fırlatmaz)", async () => {
    installShell({
      Filesystem: { writeFile: vi.fn(async () => Promise.reject(new Error("ENOSPC: no space left"))) },
      Share: { share: vi.fn() },
    });
    vi.useRealTimers(); // FileReader
    const { result } = renderHook(() => useSaveFile());
    expect(await result.current.saveFile(new Blob(["x"]), "a.xlsx")).toBe("failed");
    expect(h.toast.error).toHaveBeenCalledWith("Dosya kaydedilemedi. Lütfen tekrar deneyin.");
    expect(h.toast.error).not.toHaveBeenCalledWith(expect.stringMatching(/ENOSPC/));
  });

  it("yerel yazdırma hatası → çevrilmiş hata toast'ı + 'failed'", async () => {
    installShell({ RothernPrint: { print: vi.fn(async () => Promise.reject(new Error("PrintManager missing"))) } });
    const { result } = renderHook(() => useSaveFile());
    expect(await result.current.printHtml("<p/>", "ORD-1")).toBe("failed");
    expect(h.toast.error).toHaveBeenCalledWith("Yazdırma başlatılamadı. Lütfen tekrar deneyin.");
  });

  it("kabukta yazdırma eklentiye gider, toast yok", async () => {
    const print = vi.fn(async () => undefined);
    installShell({ RothernPrint: { print } });
    const { result } = renderHook(() => useSaveFile());
    expect(await result.current.printHtml("<!doctype html>", "ORD-2026-0001")).toBe("printed");
    expect(print).toHaveBeenCalledWith({ html: "<!doctype html>", name: "ORD-2026-0001" });
    expect(h.toast.info).not.toHaveBeenCalled();
  });

  it("tarayıcıda engellenen pencere 'blocked' döner — metni çağıran söyler (toast yok)", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const { result } = renderHook(() => useSaveFile());
    expect(await result.current.printHtml("<p/>", "ORD-1")).toBe("blocked");
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.toast.info).not.toHaveBeenCalled();
  });
});
