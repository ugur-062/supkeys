// @vitest-environment jsdom
/**
 * İNDİRME KANCALARI TEK YOLDAN (mobil kabuk 2026-10-16): üç rapor (xlsx),
 * talep kalemi şablonu ve teklif şablonu dosyayı `lib/save-file.ts` ile verir —
 * tarayıcıda bugünkü `<a download>` (Content-Disposition adıyla), mobil
 * kabukta Filesystem + Share; sonuç `outcome` olarak çağırana döner.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get, post: h.post } }));
vi.mock("sonner", () => ({ toast: h.toast }));

import { useDownloadBidTemplate } from "../use-bid-import";
import {
  useDownloadBidComparisonReport,
  useDownloadGeneralReport,
  useDownloadSavingsReport,
} from "../use-company-reports";
import { useDownloadItemTemplate } from "../use-listing-item-import";

type ShellWindow = Window & { Capacitor?: unknown };

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function blobResponse(filenameHeader: string) {
  return {
    data: new Blob(["xlsx-bytes"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    headers: { "content-disposition": filenameHeader },
  };
}

let clicked: HTMLAnchorElement[];

beforeEach(() => {
  vi.clearAllMocks();
  clicked = [];
  URL.createObjectURL = vi.fn(() => "blob:report") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
});

afterEach(() => {
  delete (window as ShellWindow).Capacitor;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const REPORT_HOOKS = [
  ["genel rapor", useDownloadGeneralReport, "/company/reports/general/download"],
  ["tasarruf raporu", useDownloadSavingsReport, "/company/reports/savings/download"],
  ["teklif karşılaştırma", useDownloadBidComparisonReport, "/company/reports/bid-comparison/download"],
] as const;

describe("rapor indirme kancaları", () => {
  it.each(REPORT_HOOKS)("%s — tarayıcıda Content-Disposition adıyla indirir", async (_name, useHook, path) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    h.post.mockResolvedValue(blobResponse('attachment; filename="rapor-2026.xlsx"'));
    const { result } = renderHook(() => useHook(), { wrapper });

    let res: { filename: string; outcome: string } | undefined;
    await act(async () => {
      res = await result.current.mutateAsync({} as never);
    });

    expect(h.post).toHaveBeenCalledWith(path, {}, { responseType: "blob" });
    expect(res).toEqual({ filename: "rapor-2026.xlsx", outcome: "downloaded" });
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toBe("rapor-2026.xlsx");
  });

  it.each(REPORT_HOOKS)("%s — kabukta önbelleğe yazıp paylaşır", async (_name, useHook) => {
    const writeFile = vi.fn(async () => ({ uri: "file:///cache/rapor.xlsx" }));
    const share = vi.fn(async () => ({}));
    (window as ShellWindow).Capacitor = {
      isNativePlatform: () => true,
      Plugins: { Filesystem: { writeFile }, Share: { share } },
    };
    h.post.mockResolvedValue(blobResponse("attachment"));
    const { result } = renderHook(() => useHook(), { wrapper });

    let res: { filename: string; outcome: string } | undefined;
    await act(async () => {
      res = await result.current.mutateAsync({} as never);
    });

    expect(res).toEqual({ filename: "rapor.xlsx", outcome: "shared" });
    expect(writeFile).toHaveBeenCalledWith({ path: "rapor.xlsx", data: btoa("xlsx-bytes"), directory: "CACHE" });
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: ["file:///cache/rapor.xlsx"] }));
    expect(clicked).toHaveLength(0);
  });

  it("eski kabuk → 'unsupported' + 'siteden yapın' bilgisi; indirme yok", async () => {
    (window as ShellWindow).Capacitor = { isNativePlatform: () => true, Plugins: { App: {} } };
    h.post.mockResolvedValue(blobResponse('attachment; filename="rapor.xlsx"'));
    const { result } = renderHook(() => useDownloadGeneralReport(), { wrapper });

    let res: { outcome: string } | undefined;
    await act(async () => {
      res = await result.current.mutateAsync({ type: "ALIM", mode: "SINGLE", listingId: "l1" });
    });

    expect(res?.outcome).toBe("unsupported");
    expect(h.toast.info).toHaveBeenCalledWith(
      "Bu işlem uygulamanın bu sürümünde yok — rothern.com'dan yapabilirsiniz.",
    );
    expect(clicked).toHaveLength(0);
  });
});

describe("şablon indirme kancaları", () => {
  it("kalem şablonu — tarayıcıda sunucu adıyla indirir", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    h.get.mockResolvedValue(blobResponse('attachment; filename="kalem-sablonu-ALIM.xlsx"'));
    const { result } = renderHook(() => useDownloadItemTemplate(), { wrapper });

    let res: { filename: string; outcome: string } | undefined;
    await act(async () => {
      res = await result.current.mutateAsync();
    });

    expect(h.get).toHaveBeenCalledWith("/company/listing-item-import/template", {
      params: { listingType: "ALIM" },
      responseType: "blob",
    });
    expect(res).toEqual({ filename: "kalem-sablonu-ALIM.xlsx", outcome: "downloaded" });
    expect(clicked[0]!.download).toBe("kalem-sablonu-ALIM.xlsx");
  });

  it("teklif şablonu — yüzde kodlu Türkçe ad çözülür; kabukta güvenli adla paylaşılır", async () => {
    const writeFile = vi.fn(async () => ({ uri: "file:///cache/t.xlsx" }));
    const share = vi.fn(async () => ({}));
    (window as ShellWindow).Capacitor = {
      isNativePlatform: () => true,
      Plugins: { Filesystem: { writeFile }, Share: { share } },
    };
    h.get.mockResolvedValue(
      blobResponse(`attachment; filename="${encodeURIComponent("teklif-şablonu ROT/000846.xlsx")}"`),
    );
    const { result } = renderHook(() => useDownloadBidTemplate("l1"), { wrapper });

    let res: { filename: string; outcome: string } | undefined;
    await act(async () => {
      res = await result.current.mutateAsync();
    });

    expect(h.get).toHaveBeenCalledWith("/company/listings/l1/bid-import/template", { responseType: "blob" });
    // Gösterilen ad sunucunun adı; önbelleğe yazılan ad yol karakterinden arınmış.
    expect(res).toEqual({ filename: "teklif-şablonu ROT/000846.xlsx", outcome: "shared" });
    expect(writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "teklif-şablonu ROT-000846.xlsx", directory: "CACHE" }),
    );
  });

  it("teklif şablonu — kullanıcı paylaşımı kapatırsa 'cancelled', toast yok", async () => {
    (window as ShellWindow).Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        Filesystem: { writeFile: vi.fn(async () => ({ uri: "file:///cache/t.xlsx" })) },
        Share: { share: vi.fn(async () => Promise.reject(new Error("Share canceled"))) },
      },
    };
    h.get.mockResolvedValue(blobResponse('attachment; filename="t.xlsx"'));
    const { result } = renderHook(() => useDownloadBidTemplate("l1"), { wrapper });

    let res: { outcome: string } | undefined;
    await act(async () => {
      res = await result.current.mutateAsync();
    });

    expect(res?.outcome).toBe("cancelled");
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.toast.info).not.toHaveBeenCalled();
  });
});
