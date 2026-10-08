// @vitest-environment jsdom
/**
 * Arayüz testi 2026-10 login-1: "Oturumumu açık bırak" kapalıyken anlık görüntü
 * sessionStorage'dadır (sekmeye özel). Yeni sekmede anlık görüntü yok ama
 * oturum çerezi geçerli → girişe atmadan önce `/me` BİR KEZ yoklanır.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn(), bind: vi.fn() }));

vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get, post: vi.fn(), patch: vi.fn() } }));
vi.mock("@/lib/company-auth/tenant-storage", () => ({
  bindSessionOwner: h.bind,
  clearTenantSessionData: vi.fn(),
}));
vi.mock("@/i18n/runtime", () => ({ runtimeLocale: () => "tr" }));
vi.mock("@/i18n/href", () => ({ localizePath: (p: string) => p }));

import { markCompanyLoggingOut, resetCompanyLoggingOut } from "@/lib/company-auth/logout-flag";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { resetCompanySessionProbe, useCompanySessionProbe } from "../use-company-auth";

const REMEMBER_KEY = "rothern-company-remember";
const ME = {
  user: { id: "u1", permissions: [] },
  company: { id: "c1", tier: "STANDART", onboardingCompletedAt: "2026-01-01" },
  selfUpgradeEnabled: false,
};

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetCompanySessionProbe();
  resetCompanyLoggingOut();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useCompanyAuthStore.setState({ user: null, company: null, isHydrated: true, permissionsSynced: false } as never);
});

describe("useCompanySessionProbe", () => {
  it("'hatırla' AÇIK: anlık görüntü sekmeler arası paylaşılır → yokluğu oturumsuzluktur, `/me` sorulmaz", async () => {
    const { result } = renderHook(() => useCompanySessionProbe(), { wrapper });
    await waitFor(() => expect(result.current).toBe("none"));
    expect(h.get).not.toHaveBeenCalled();
  });

  it("'hatırla' KAPALI + anlık görüntü yok + çerez geçerli: `/me` yoklanır, depo dolar → found", async () => {
    window.localStorage.setItem(REMEMBER_KEY, "0");
    let resolve: (v: unknown) => void = () => undefined;
    h.get.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useCompanySessionProbe(), { wrapper });
    // Yanıt gelene dek KARAR YOK: çağıran girişe atmaz, form çizmez.
    expect(result.current).toBe("pending");
    expect(h.get).toHaveBeenCalledWith("/company-auth/me", { skipErrorToast: true });
    await act(async () => resolve({ data: ME }));
    await waitFor(() => expect(result.current).toBe("found"));
    expect(useCompanyAuthStore.getState().user?.id).toBe("u1");
    expect(useCompanyAuthStore.getState().permissionsSynced).toBe(true);
    expect(h.bind).toHaveBeenCalledWith("u1");
    // Kabuk `/me`yi yeniden çekmesin diye yanıt sorgu önbelleğinde.
    expect(client.getQueryData(["company-auth", "me"])).toEqual(ME);
  });

  it("'hatırla' KAPALI + oturum yok (401): none", async () => {
    window.localStorage.setItem(REMEMBER_KEY, "0");
    h.get.mockRejectedValue(Object.assign(new Error("401"), { response: { status: 401 } }));
    const { result } = renderHook(() => useCompanySessionProbe(), { wrapper });
    await waitFor(() => expect(result.current).toBe("none"));
    expect(useCompanyAuthStore.getState().user).toBeNull();
  });

  it("sayfa yüklemesi başına TEK istek (nöbetçi + giriş sayfası aynı sözü paylaşır)", async () => {
    window.localStorage.setItem(REMEMBER_KEY, "0");
    h.get.mockRejectedValue(Object.assign(new Error("401"), { response: { status: 401 } }));
    const a = renderHook(() => useCompanySessionProbe(), { wrapper });
    const b = renderHook(() => useCompanySessionProbe(), { wrapper });
    await waitFor(() => expect(a.result.current).toBe("none"));
    await waitFor(() => expect(b.result.current).toBe("none"));
    expect(h.get).toHaveBeenCalledTimes(1);
  });

  it("kullanıcı bu sayfada vardı ve silindi (401 / çıkış): yeniden sorulmaz → none", async () => {
    window.localStorage.setItem(REMEMBER_KEY, "0");
    useCompanyAuthStore.setState({ user: ME.user, company: ME.company } as never);
    const { result } = renderHook(() => useCompanySessionProbe(), { wrapper });
    expect(result.current).toBe("found");
    act(() => useCompanyAuthStore.getState().clear());
    await waitFor(() => expect(result.current).toBe("none"));
    expect(h.get).not.toHaveBeenCalled();
  });

  it("açık çıkış sürerken anlık görüntü yoksa da sorulmaz", async () => {
    window.localStorage.setItem(REMEMBER_KEY, "0");
    markCompanyLoggingOut();
    const { result } = renderHook(() => useCompanySessionProbe(), { wrapper });
    await waitFor(() => expect(result.current).toBe("none"));
    expect(h.get).not.toHaveBeenCalled();
  });

  it("depo yüklenmeden karar yok (pending), istek de yok", () => {
    window.localStorage.setItem(REMEMBER_KEY, "0");
    useCompanyAuthStore.setState({ isHydrated: false } as never);
    const { result } = renderHook(() => useCompanySessionProbe(), { wrapper });
    expect(result.current).toBe("pending");
    expect(h.get).not.toHaveBeenCalled();
  });
});
