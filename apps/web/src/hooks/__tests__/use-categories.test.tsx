// @vitest-environment jsdom
/**
 * Kayıt denetimi 2026-10 (category-5, code-category-5, signup-tr-3): kategori
 * kancaları yalnız `data` + `isLoading` veriyordu; düşen istek çağıranda boş
 * liste / "sonuç yok" olarak çiziliyordu. Ayrıca varsayılan yeniden deneme
 * politikası 429'u üç kez daha deniyor, kısıtlanan uca yük bindiriyordu.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: h.get } }));

import {
  useCategoriesByIds,
  useCategorySearchTree,
  useChildren,
  useRoots,
} from "../use-categories";

/** Uygulamanın varsayılanına yakın istemci: 4xx (429 hariç) denenmez, gerisi 3 kez. */
function wrapperWithAppRetry() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (n: number, e: unknown) => {
          const s = (e as { response?: { status?: number } })?.response?.status;
          if (s && s >= 400 && s < 500 && s !== 429) return false;
          return n < 3;
        },
        retryDelay: 1,
      },
    },
  });
  // Adlandırılmış bileşen: anonim sarmalayıcı `react/display-name` ile derlemeyi kırar.
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });
/** `useChildren` ağacın üst katmanını da (`/categories/all`) ister; sayım uca göre yapılır. */
const callsTo = (url: string) => h.get.mock.calls.filter((c) => c[0] === url).length;

beforeEach(() => {
  h.get.mockReset();
});

describe("useChildren (L2/L3 — /categories/children)", () => {
  it("başarı: liste + isError=false", async () => {
    h.get.mockResolvedValue({ data: [{ id: "31161700", code: "31161700", nameTr: "Somunlar", level: 3, childCount: 4 }] });
    const { result } = renderHook(() => useChildren("31160000", 2, "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.isError).toBe(false);
    expect(result.current.data?.[0]._count).toEqual({ children: 4 });
    // Hatayı çağıran satır içinde gösterir → genel toast kapalı.
    expect(h.get).toHaveBeenCalledWith("/categories/children", {
      params: { parentId: "31160000", catalog: "full" },
      skipErrorToast: true,
    });
  });

  it("429: otomatik yeniden denenmez; isError + refetch çağırana verilir", async () => {
    h.get.mockRejectedValue(httpError(429));
    const { result } = renderHook(() => useChildren("31160000", 2, "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(callsTo("/categories/children")).toBe(1);

    // "Yeniden dene": aynı kanca üzerinden; başarılıysa hata durumu kalkar.
    h.get.mockResolvedValue({ data: [] });
    await result.current.refetch();
    await waitFor(() => expect(result.current.isError).toBe(false));
    expect(result.current.data).toEqual([]);
    expect(callsTo("/categories/children")).toBe(2);
  });

  it("yeniden deneme yoldayken durum 'yükleniyor'dur (hata satırı yerine dönen simge)", async () => {
    h.get.mockRejectedValue(httpError(429));
    const { result } = renderHook(() => useChildren("31160000", 2, "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isLoading).toBe(false);

    let resolve!: (v: { data: unknown[] }) => void;
    h.get.mockReturnValue(new Promise((r) => (resolve = r)));
    void result.current.refetch();
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(result.current.isError).toBe(false);
    resolve({ data: [] });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toEqual([]);
  });

  it("5xx: tek otomatik deneme, sonra hata (3 değil)", async () => {
    h.get.mockRejectedValue(httpError(500));
    const { result } = renderHook(() => useChildren("31160000", 3, "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(callsTo("/categories/children")).toBe(2);
  });

  it("L1 (bellekten aileler): /categories/all düşerse isError + refetch", async () => {
    h.get.mockRejectedValue(httpError(400));
    const { result } = renderHook(() => useChildren("31000000", 1, "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(h.get).toHaveBeenCalledWith("/categories/all", { skipErrorToast: true });
    h.get.mockResolvedValue({
      data: [
        { id: "31160000", code: "31160000", nameTr: "Hırdavat", level: 2, parentId: "31000000", childCount: 20 },
        { id: "39120000", code: "39120000", nameTr: "Başka", level: 2, parentId: "39000000", childCount: 1 },
      ],
    });
    await result.current.refetch();
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.isError).toBe(false);
  });
});

// Kayıt denetimi 2026-10 (webcat-6): satır içi hata politikası yalnız
// `/children` dalına bağlanmıştı. Sektör açılınca gelen aileler (`/all`) ve
// sektör listesi (`/segments`) varsayılan politikada kalmıştı: 429'da dört
// istek (~7 sn dönen simge), 5xx'te dört genel toast + satır içi hata.
describe("useChildren (L1 — /categories/all): aile dalı da satır içi hata politikasında", () => {
  it("429: tek istek, toast kapalı (otomatik yeniden deneme yok)", async () => {
    h.get.mockRejectedValue(httpError(429));
    const { result } = renderHook(() => useChildren("31000000", 1, "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(callsTo("/categories/all")).toBe(1);
    expect(h.get.mock.calls.every((c) => c[1]?.skipErrorToast === true)).toBe(true);
  });

  it("5xx: tek otomatik deneme, sonra hata (4 istek değil)", async () => {
    h.get.mockRejectedValue(httpError(500));
    const { result } = renderHook(() => useChildren("31000000", 1, "full"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(callsTo("/categories/all")).toBe(2);
    expect(h.get.mock.calls.every((c) => c[1]?.skipErrorToast === true)).toBe(true);
  });
});

describe("useRoots (/categories/segments) — inlineError seçeneği", () => {
  it("varsayılan: genel toast açık, uygulamanın yeniden deneme politikası (başka yüzeyler buna güveniyor)", async () => {
    h.get.mockRejectedValue(httpError(429));
    const { result } = renderHook(() => useRoots(), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(callsTo("/categories/segments")).toBe(4);
    expect(h.get).toHaveBeenCalledWith("/categories/segments", {});
  });

  it("inlineError: toast kapalı, 429 yeniden denenmez; isError + refetch çağırana verilir", async () => {
    h.get.mockRejectedValue(httpError(429));
    const { result } = renderHook(() => useRoots({ inlineError: true }), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(callsTo("/categories/segments")).toBe(1);
    expect(h.get).toHaveBeenCalledWith("/categories/segments", { skipErrorToast: true });

    h.get.mockResolvedValue({ data: [{ id: "31000000", code: "31000000", nameTr: "Üretim Bileşenleri", level: 1, childCount: 12 }] });
    await result.current.refetch();
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.isError).toBe(false);
    expect(result.current.data?.[0]._count).toEqual({ children: 12 });
    expect(callsTo("/categories/segments")).toBe(2);
  });

  it("inlineError: 5xx tek otomatik deneme (4 istek değil)", async () => {
    h.get.mockRejectedValue(httpError(500));
    const { result } = renderHook(() => useRoots({ inlineError: true }), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(callsTo("/categories/segments")).toBe(2);
  });
});

describe("useCategorySearchTree / useCategoriesByIds — inlineError seçeneği", () => {
  it("varsayılan: genel toast açık kalır (başka yüzeyler buna güveniyor)", async () => {
    h.get.mockResolvedValue({ data: { segments: [] } });
    const { result } = renderHook(() => useCategorySearchTree("kablo", "discovery"), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.get).toHaveBeenCalledWith("/categories/search-tree", { params: { q: "kablo", catalog: "discovery" } });

    h.get.mockClear();
    h.get.mockResolvedValue({ data: [] });
    const ids = renderHook(() => useCategoriesByIds(["39121600"]), { wrapper: wrapperWithAppRetry() });
    await waitFor(() => expect(ids.result.current.isSuccess).toBe(true));
    expect(h.get).toHaveBeenCalledWith("/categories/by-ids", { params: { ids: "39121600" } });
  });

  it("inlineError: toast kapalı, 429 yeniden denenmez, isError görünür", async () => {
    h.get.mockRejectedValue(httpError(429));
    const search = renderHook(() => useCategorySearchTree("kablo", "full", { inlineError: true }), {
      wrapper: wrapperWithAppRetry(),
    });
    await waitFor(() => expect(search.result.current.isError).toBe(true));
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.get).toHaveBeenCalledWith("/categories/search-tree", {
      params: { q: "kablo", catalog: "full" },
      skipErrorToast: true,
    });

    h.get.mockClear();
    const ids = renderHook(() => useCategoriesByIds(["39121600", "39000000"], { inlineError: true }), {
      wrapper: wrapperWithAppRetry(),
    });
    await waitFor(() => expect(ids.result.current.isError).toBe(true));
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.get).toHaveBeenCalledWith("/categories/by-ids", {
      params: { ids: "39121600,39000000" },
      skipErrorToast: true,
    });
  });

  it("2 karakterin altında arama isteği atılmaz", () => {
    renderHook(() => useCategorySearchTree("b", "full", { inlineError: true }), { wrapper: wrapperWithAppRetry() });
    expect(h.get).not.toHaveBeenCalled();
  });
});
