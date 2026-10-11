// @vitest-environment jsdom
/**
 * Derin denetim S090 — tur henüz yokken yoklama süresiz değildir: embargolu
 * talepte hiç yoklanmaz, açık talepte `EMPTY_RUN_POLL_MAX` güncellemeden sonra
 * durur ve hook "tavan doldu" bayrağını döner (ekran "aranıyor" demeyi bırakır).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get, post: vi.fn() } }));

import { awaitingFirstRun, EMPTY_RUN_POLL_MAX, useListingDiscovery, type ListingDiscovery } from "../use-supplier-discovery";

const empty = (extra: Partial<ListingDiscovery> = {}): ListingDiscovery => ({
  aiDiscovery: true,
  listingStatus: "OPEN",
  startsAt: null,
  runs: [],
  ...extra,
});

function setup(data: ListingDiscovery, priorUpdates: number) {
  h.get.mockReset().mockResolvedValue({ data });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (let i = 0; i < priorUpdates; i++) qc.setQueryData(["listing-discovery", "l1"], data);
  return renderHook(() => useListingDiscovery("l1"), {
    wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
}

describe("useListingDiscovery — boş tur yoklaması (S090)", () => {
  it("awaitingFirstRun: embargoda, kapalı talepte, otomatik arama kapalıyken ya da tur varken false", () => {
    expect(awaitingFirstRun(empty())).toBe(true);
    expect(awaitingFirstRun(empty({ startsAt: "2099-01-01T00:00:00.000Z" }))).toBe(false);
    expect(awaitingFirstRun(empty({ listingStatus: "CLOSED" }))).toBe(false);
    expect(awaitingFirstRun(empty({ aiDiscovery: false }))).toBe(false);
  });

  it("tavan dolmadan bayrak kapalı; dolunca açık", async () => {
    const fresh = setup(empty(), 0);
    await waitFor(() => expect(fresh.result.current.data).toBeDefined());
    expect(fresh.result.current.emptyPollExhausted).toBe(false);

    const exhausted = setup(empty(), EMPTY_RUN_POLL_MAX);
    await waitFor(() => expect(exhausted.result.current.data).toBeDefined());
    expect(exhausted.result.current.emptyPollExhausted).toBe(true);
  });

  it("embargolu talepte tavan bayrağı hiç açılmaz (tur açılışta gelecek)", async () => {
    const r = setup(empty({ startsAt: "2099-01-01T00:00:00.000Z" }), EMPTY_RUN_POLL_MAX);
    await waitFor(() => expect(r.result.current.data).toBeDefined());
    expect(r.result.current.emptyPollExhausted).toBe(false);
  });
});
