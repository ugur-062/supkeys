// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  post: vi.fn(),
  clear: vi.fn(),
  clearTenant: vi.fn(),
}));

vi.mock("@/lib/company-auth/api", () => ({ companyApi: { post: h.post, get: vi.fn() } }));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) => sel({ clear: h.clear }),
}));
vi.mock("@/lib/company-auth/tenant-storage", () => ({
  bindSessionOwner: vi.fn(),
  clearTenantSessionData: h.clearTenant,
}));
vi.mock("@/i18n/runtime", () => ({ runtimeLocale: () => "tr" }));
vi.mock("@/i18n/href", () => ({ localizePath: (p: string) => p }));
vi.mock("next-intl", () => ({ useLocale: () => "tr" }));

import { isCompanyLoggingOut, resetCompanyLoggingOut } from "@/lib/company-auth/logout-flag";
import { useCompanyLogout } from "../use-company-auth";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  resetCompanyLoggingOut();
  Object.defineProperty(window, "location", {
    writable: true,
    configurable: true,
    value: { href: "" },
  });
});

describe("useCompanyLogout (derin denetim MU-21 — çerez silinmeden sayfa değişmesin)", () => {
  it("logout yanıtı gelmeden yönlendirmez; yanıttan sonra temizleyip yönlendirir", async () => {
    let resolvePost: (v: unknown) => void = () => undefined;
    h.post.mockReturnValue(new Promise((r) => (resolvePost = r)));
    const { result } = renderHook(() => useCompanyLogout(), { wrapper });

    let done!: Promise<void>;
    act(() => {
      done = result.current();
    });
    expect(h.post).toHaveBeenCalledWith("/company-auth/logout");
    await Promise.resolve();
    expect(window.location.href).toBe("");

    await act(async () => {
      resolvePost({ data: { ok: true } });
      await done;
    });
    expect(h.clear).toHaveBeenCalled();
    expect(h.clearTenant).toHaveBeenCalled();
    expect(window.location.href).toBe("/company/login");
  });

  it("istek hata verse de çıkılır", async () => {
    h.post.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useCompanyLogout(), { wrapper });
    await act(async () => {
      await result.current();
    });
    expect(window.location.href).toBe("/company/login");
  });

  // Arayüz testi 2026-10 login-2: anlık görüntü silinmeden ÖNCE "açık çıkış"
  // işareti konur → panel nöbetçisi `?next=<son sayfa>` ile yarışa girmez,
  // çıkış düz giriş sayfasında biter.
  it("anlık görüntü silinmeden önce 'açık çıkış' işaretini koyar; düz giriş sayfasına gider", async () => {
    let flagAtClear: boolean | null = null;
    h.clear.mockImplementation(() => {
      flagAtClear = isCompanyLoggingOut();
    });
    h.post.mockResolvedValue({ data: { ok: true } });
    const { result } = renderHook(() => useCompanyLogout(), { wrapper });
    expect(isCompanyLoggingOut()).toBe(false);
    await act(async () => {
      await result.current();
    });
    expect(flagAtClear).toBe(true);
    expect(window.location.href).toBe("/company/login");
  });
});
