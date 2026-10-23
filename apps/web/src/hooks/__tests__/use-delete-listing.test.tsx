// @vitest-environment jsdom
/**
 * Arayüz testi D-100: taslak silinince silinen talebin detay sorgusu
 * geçersiz kılınıp YENİDEN ÇEKİLMEZ (404 + konsol hatası) — önbellekten
 * düşürülür; liste ve pano önbellekleri yine tazelenir.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ del: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { delete: h.del, get: h.get } }));

import { useDeleteListing } from "../use-company-listings";

describe("useDeleteListing", () => {
  it("silinen talebin detayını düşürür, kalan talep önbelleklerini geçersiz kılar", async () => {
    h.del.mockResolvedValue({ data: { ok: true } });
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    qc.setQueryData(["company-listings", "detail", "l1"], { id: "l1" });
    qc.setQueryData(["company-listings", "detail", "l2"], { id: "l2" });
    qc.setQueryData(["company-listings", "list"], []);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDeleteListing(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("l1");
    });

    expect(qc.getQueryState(["company-listings", "detail", "l1"])).toBeUndefined();
    expect(qc.getQueryState(["company-listings", "detail", "l2"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["company-listings", "list"])?.isInvalidated).toBe(true);
    expect(spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey?: unknown }).queryKey))).toContain(
      JSON.stringify(["company-dashboard"]),
    );
    expect(h.get).not.toHaveBeenCalled();
  });
});
