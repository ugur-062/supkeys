// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: vi.fn() } }));

import { useEmailLogs } from "../use-email-logs";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

// Derin denetim LU-13: 403 alan (SUPPORT) sekmede 5 sn'lik aralıklı sorgu hata
// durumunda da sürüyor, her turda yeni bir yetki toast'ı çıkıyordu.
describe("useEmailLogs aralıklı yenileme", () => {
  it("başarılı sorguda 5 sn'de bir yeniler", async () => {
    h.get.mockResolvedValue({ data: { items: [], pagination: {} } });
    renderHook(() => useEmailLogs({ page: 1 }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(h.get).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(5_100));
    expect(h.get).toHaveBeenCalledTimes(2);
  });

  it("hata durumunda aralıklı sorgu durur", async () => {
    h.get.mockRejectedValue(Object.assign(new Error("forbidden"), { response: { status: 403 } }));
    const { result } = renderHook(() => useEmailLogs({ page: 1 }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(result.current.isError).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(h.get).toHaveBeenCalledTimes(1);
  });
});
