// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { post: h.post, get: vi.fn() } }));

import { useResolveComplaint } from "../use-admin-companies";

// Derin denetim LU-13: "askıya al" ile çözülen şikayetten sonra firma detayı
// önbelleği (["admin-company-detail", id]) düşmüyor, firma aktif görünüyordu.
describe("useResolveComplaint önbellek tazeleme", () => {
  it("firma detay önbelleğini de düşürür", async () => {
    h.post.mockResolvedValue({ data: {} });
    const qc = new QueryClient();
    qc.setQueryData(["admin-company-detail", "c1"], { id: "c1", isBlocked: false });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useResolveComplaint(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ id: "k1", status: "RESOLVED", suspend: true, suspendReason: "x" }),
    );
    expect(h.post).toHaveBeenCalledWith("/admin/complaints/k1/resolve", {
      status: "RESOLVED",
      suspend: true,
      suspendReason: "x",
    });
    expect(qc.getQueryState(["admin-company-detail", "c1"])?.isInvalidated).toBe(true);
  });
});
