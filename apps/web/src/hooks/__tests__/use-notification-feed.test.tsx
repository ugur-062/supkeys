// @vitest-environment jsdom
/**
 * Derin denetim S057 — Bildirimler sayfasının akışı API `before` imlecini
 * (`<ISO tarih>_<id>`, son satır) kullanır; dolu sayfadan sonra devam eder,
 * eksik sayfada durur.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get } }));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: { user: unknown }) => unknown) => sel({ user: { id: "u1" } }),
}));

import { NOTIFICATION_PAGE_SIZE, useNotificationFeed } from "../use-notifications";

const row = (i: number) => ({
  id: `n${i}`,
  createdAt: new Date(Date.UTC(2026, 8, 1, 0, 0, 100 - i)).toISOString(),
  readAt: null,
});

describe("useNotificationFeed", () => {
  it("dolu sayfanın son satırını `before` olarak gönderir, eksik sayfada durur", async () => {
    const first = Array.from({ length: NOTIFICATION_PAGE_SIZE }, (_, i) => row(i));
    const second = [row(NOTIFICATION_PAGE_SIZE)];
    h.get.mockResolvedValueOnce({ data: first }).mockResolvedValueOnce({ data: second });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useNotificationFeed(), {
      wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.get).toHaveBeenNthCalledWith(1, "/notifications", {
      params: { take: NOTIFICATION_PAGE_SIZE },
    });
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
    });
    const last = first[first.length - 1];
    expect(h.get).toHaveBeenNthCalledWith(2, "/notifications", {
      params: { take: NOTIFICATION_PAGE_SIZE, before: `${last.createdAt}_${last.id}` },
    });
    await waitFor(() => expect(result.current.hasNextPage).toBe(false));
    expect(result.current.data?.pages.flat()).toHaveLength(NOTIFICATION_PAGE_SIZE + 1);
  });
});
