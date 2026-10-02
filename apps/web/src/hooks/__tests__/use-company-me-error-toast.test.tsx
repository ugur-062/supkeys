// @vitest-environment jsdom
/**
 * Arayüz testi webA-09 (yeniden doğrulama): onboarding sihirbazı /me hatasını
 * kendi kartında gösterir → istek global toast'ı kapatır. Panel kabuğu kart
 * basmadığından varsayılan çağrıda toast açık kalır.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get, post: vi.fn() } }));
vi.mock("@/lib/company-auth/tenant-storage", () => ({
  bindSessionOwner: vi.fn(),
  clearTenantSessionData: vi.fn(),
}));
vi.mock("@/i18n/runtime", () => ({ runtimeLocale: () => "tr" }));
vi.mock("@/i18n/href", () => ({ localizePath: (p: string) => p }));

import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { useCompanyMe } from "../use-company-auth";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  useCompanyAuthStore.setState({
    user: { id: "u1", permissions: [] },
    company: { id: "c1", tier: "STANDART" },
  } as never);
  h.get.mockRejectedValue(Object.assign(new Error("down"), { response: { status: 500 } }));
});

describe("useCompanyMe hata toast'ı", () => {
  it("skipErrorToast: /me isteği global toast'ı kapatır (hata kartta)", async () => {
    const { result } = renderHook(() => useCompanyMe(true, { skipErrorToast: true }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(h.get).toHaveBeenCalledWith("/company-auth/me", { skipErrorToast: true });
  });

  it("varsayılan: toast kapatılmaz (panel kabuğu kart basmıyor)", async () => {
    const { result } = renderHook(() => useCompanyMe(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(h.get).toHaveBeenCalledWith("/company-auth/me", undefined);
  });
});
