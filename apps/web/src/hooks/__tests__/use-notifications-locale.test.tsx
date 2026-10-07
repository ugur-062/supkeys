// @vitest-environment jsdom
/**
 * Bildirim dili (2026-10-07, sahip bulgusu): API bildirim metnini OKUYANIN
 * güncel diliyle üretir, yani liste yanıtı dile bağlıdır. Zil listesi ve
 * Bildirimler akışı anahtarında dil OLMALI: dil değişince önbellekteki eski
 * dildeki metin gösterilmez, liste yeni dille yeniden çekilir.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn(), locale: "en" }));

vi.mock("next-intl", () => ({ useLocale: () => h.locale }));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get } }));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: { user: unknown }) => unknown) => sel({ user: { id: "u1" } }),
}));

import {
  NOTIFICATION_KEY,
  notificationFeedKey,
  notificationListKey,
  useNotificationFeed,
  useNotifications,
} from "../use-notifications";

const row = (title: string) => ({
  id: "n1",
  title,
  createdAt: "2026-10-07T09:00:00.000Z",
  readAt: null,
});

function wrap(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  h.get.mockReset();
  h.locale = "en";
});

describe("bildirim sorgu anahtarları dili taşır", () => {
  it("anahtarlar NOTIFICATION_KEY önekinde ve dil SONDA (önekli tazeleme her dili kapsar)", () => {
    expect(notificationListKey(undefined, "ru")).toEqual([...NOTIFICATION_KEY, "list", "all", "ru"]);
    expect(notificationListKey("satis", "en")).toEqual([...NOTIFICATION_KEY, "list", "satis", "en"]);
    expect(notificationFeedKey("tr")).toEqual([...NOTIFICATION_KEY, "feed", "tr"]);
    expect(notificationListKey(undefined, "en")).not.toEqual(notificationListKey(undefined, "tr"));
  });

  it("zil listesi: dil değişince önbellekteki eski dildeki metni göstermez, yeniden çeker", async () => {
    h.get
      .mockResolvedValueOnce({ data: [row("New quote received")] })
      .mockResolvedValueOnce({ data: [row("Yeni teklif geldi")] });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(() => useNotifications(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.data?.[0]?.title).toBe("New quote received"));
    expect(h.get).toHaveBeenCalledTimes(1);

    h.locale = "tr";
    rerender();
    // Yeni dilin anahtarında veri yok: eski dildeki satır YER TUTUCU olarak da kalmaz.
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.[0]?.title).toBe("Yeni teklif geldi"));
    expect(h.get).toHaveBeenCalledTimes(2);

    // Önekli tazeleme (okundu işaretleme, WS sinyali) iki dilin önbelleğini de düşürür.
    await qc.invalidateQueries({ queryKey: NOTIFICATION_KEY, refetchType: "none" });
    expect(qc.getQueryState(notificationListKey(undefined, "en"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(notificationListKey(undefined, "tr"))?.isInvalidated).toBe(true);
  });

  it("Bildirimler akışı: dil değişince yeni dille yeniden çekilir", async () => {
    h.get
      .mockResolvedValueOnce({ data: [row("New quote received")] })
      .mockResolvedValueOnce({ data: [row("Получено новое предложение")] });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(() => useNotificationFeed(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.data?.pages[0]?.[0]?.title).toBe("New quote received"));

    h.locale = "ru";
    rerender();
    await waitFor(() =>
      expect(result.current.data?.pages[0]?.[0]?.title).toBe("Получено новое предложение"),
    );
    expect(h.get).toHaveBeenCalledTimes(2);
  });
});
