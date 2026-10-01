// @vitest-environment jsdom
/**
 * Arayüz testi D-299 — kalıcı anlık görüntüdeki izinler BAYAT olabilir (izni
 * az önce kaldırılan kullanıcı). `permissionsSynced` kalıcı DEĞİLDİR: tam
 * yüklemede false başlar, `/me` (setMe) ya da giriş (setAuth) true yapar,
 * `/me` hata verirse de true olur (sayfa kilitli kalmasın). İzinli istek atan
 * yüzeyler (kabuk içeriği, rozetler, canlı kartlar) bunu bekler.
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
import { useCompanyMe, useCompanyPermissionsSynced } from "../use-company-auth";

const snapshot = {
  user: { id: "u1", permissions: ["buy:view", "sell:view"] },
  company: { id: "c1", tier: "GOLD" },
} as never;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  // Tam sayfa yüklemesi: kalıcı anlık görüntü var, taze değil.
  useCompanyAuthStore.setState({ ...(snapshot as object), permissionsSynced: false });
});

describe("permissionsSynced (arayüz testi D-299)", () => {
  it("bayrak kalıcı depoya YAZILMAZ (her yüklemede false başlar)", () => {
    useCompanyAuthStore.getState().setMe(snapshot);
    const persisted = JSON.parse(
      window.localStorage.getItem("rothern-company-auth") ?? "{}",
    ) as { state?: Record<string, unknown> };
    expect(persisted.state).toBeDefined();
    expect(persisted.state).not.toHaveProperty("permissionsSynced");
  });

  it("/me gelene dek false; gelince taze izinlerle true", async () => {
    let resolve!: (v: unknown) => void;
    h.get.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(
      () => {
        useCompanyMe();
        return useCompanyPermissionsSynced();
      },
      { wrapper },
    );
    expect(result.current).toBe(false);
    resolve({
      data: {
        user: { id: "u1", permissions: ["buy:view"] },
        company: { id: "c1", tier: "GOLD" },
      },
    });
    await waitFor(() => expect(result.current).toBe(true));
    expect(useCompanyAuthStore.getState().user?.permissions).toEqual(["buy:view"]);
  });

  it("/me hata verirse beklenmez (anlık görüntü bilinen en iyi durum)", async () => {
    h.get.mockRejectedValue(Object.assign(new Error("down"), { response: { status: 503 } }));
    const { result } = renderHook(
      () => {
        useCompanyMe();
        return useCompanyPermissionsSynced();
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("çıkış bayrağı düşürür, giriş kurar", () => {
    useCompanyAuthStore.getState().setAuth(snapshot);
    expect(useCompanyAuthStore.getState().permissionsSynced).toBe(true);
    useCompanyAuthStore.getState().clear();
    expect(useCompanyAuthStore.getState().permissionsSynced).toBe(false);
  });
});
