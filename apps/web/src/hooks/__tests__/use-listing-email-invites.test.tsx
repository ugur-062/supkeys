// @vitest-environment jsdom
/**
 * Talebe e-postayla davet edilenler (canlı doğrulama 2026-10-09, D3 / AI-UI-1)
 * — uç sözleşmesi, ortak sorgu anahtarı ve yoklama kuralı.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get, post: vi.fn() } }));

import {
  emailInvitesPollMs,
  listingEmailInvitesKey,
  QUEUED_POLL_MS,
  useListingEmailInvites,
} from "../use-listing-email-invites";

function setup(listingId: string | null, enabled?: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = renderHook(() => useListingEmailInvites(listingId, enabled), {
    wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
  return { ...view, qc };
}

beforeEach(() => {
  h.get.mockReset();
});

describe("useListingEmailInvites", () => {
  it("ortak sorgu anahtarı: [company, listing-email-invites, <talep>] — davet gönderen yollar bunu tazeler", () => {
    expect(listingEmailInvitesKey("l1")).toEqual(["company", "listing-email-invites", "l1"]);
  });

  it("GET company/connections/external-tender-invites?listingId= okur, satırları sunucu sırasıyla verir, sonucu ortak anahtara yazar", async () => {
    const items = [
      { id: "b", email: "b@x.com", invite: "QUEUED" },
      { id: "a", email: "a@x.com", invite: "INVITED" },
    ];
    h.get.mockResolvedValue({ data: { items } });
    const { result, qc } = setup("l1");
    await waitFor(() => expect(result.current.data).toEqual(items));
    expect(h.get).toHaveBeenCalledWith("/company/connections/external-tender-invites", {
      params: { listingId: "l1" },
      skipErrorToast: true,
    });
    expect(qc.getQueryData(["company", "listing-email-invites", "l1"])).toEqual(items);
  });

  it("beklenmeyen gövde (items yok) boş liste sayılır", async () => {
    h.get.mockResolvedValue({ data: [] });
    const { result } = setup("l1");
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it("talep kimliği yokken ya da kapalıyken istek atılmaz", () => {
    setup(null);
    setup("l1", false);
    expect(h.get).not.toHaveBeenCalled();
  });

  it("yoklama yalnız sırada bekleyen davet varken (dakikada bir)", () => {
    expect(emailInvitesPollMs(undefined)).toBe(false);
    expect(emailInvitesPollMs([])).toBe(false);
    expect(emailInvitesPollMs([{ invite: "INVITED" }, { invite: "NOT_SENT" }])).toBe(false);
    expect(emailInvitesPollMs([{ invite: "INVITED" }, { invite: "QUEUED" }])).toBe(QUEUED_POLL_MS);
    expect(QUEUED_POLL_MS).toBe(60_000);
  });
});
