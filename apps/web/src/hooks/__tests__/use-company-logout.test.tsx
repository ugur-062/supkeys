// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import {
  PUSH_TOKEN_KEY,
  PUSH_UNREGISTER_PENDING_KEY,
  resetPushDeviceRequests,
  runPushDeviceRequest,
} from "@/lib/native-push";
import { PUSH_UNREGISTER_WAIT_MS, useCompanyLogout } from "../use-company-auth";

const UNREGISTER_URL = "http://localhost:4000/api/company-auth/push-devices/unregister";
const fetchMock = vi.fn();

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  resetCompanyLoggingOut();
  resetPushDeviceRequests();
  window.localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    writable: true,
    configurable: true,
    value: { href: "" },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
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

describe("useCompanyLogout — mobil kabuk anlık bildirim belirteci", () => {
  it("saklı belirteç varsa çıkıştan ÖNCE sunucudan silinir (keepalive) ve yerelden temizlenir", async () => {
    window.localStorage.setItem(PUSH_TOKEN_KEY, "fcm-token-1");
    const order: string[] = [];
    fetchMock.mockImplementation(async () => {
      order.push("unregister");
      return new Response("{}", { status: 200 });
    });
    h.post.mockImplementation(async (url: string) => {
      order.push(url);
      return { data: { ok: true } };
    });
    const { result } = renderHook(() => useCompanyLogout(), { wrapper });
    await act(async () => {
      await result.current();
    });
    expect(order).toEqual(["unregister", "/company-auth/logout"]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(UNREGISTER_URL);
    expect(init).toMatchObject({ method: "POST", keepalive: true });
    expect(JSON.parse(init.body)).toEqual({ token: "fcm-token-1" });
    expect(window.localStorage.getItem(PUSH_TOKEN_KEY)).toBeNull();
    expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBeNull();
    expect(window.location.href).toBe("/company/login");
  });

  it("silme isteği hata verse de çıkılır; belirteç sonraki yükleme yeniden denesin diye bekler", async () => {
    window.localStorage.setItem(PUSH_TOKEN_KEY, "fcm-token-1");
    fetchMock.mockRejectedValue(new TypeError("network"));
    h.post.mockResolvedValue({ data: { ok: true } });
    const { result } = renderHook(() => useCompanyLogout(), { wrapper });
    await act(async () => {
      await result.current();
    });
    expect(h.post).toHaveBeenCalledWith("/company-auth/logout");
    expect(window.localStorage.getItem(PUSH_TOKEN_KEY)).toBeNull();
    expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBe("fcm-token-1");
    expect(window.location.href).toBe("/company/login");
  });

  it("silme 2xx dışı dönerse de belirteç yeniden denenmek üzere bekler", async () => {
    window.localStorage.setItem(PUSH_TOKEN_KEY, "fcm-token-1");
    fetchMock.mockResolvedValue(new Response("", { status: 502 }));
    h.post.mockResolvedValue({ data: { ok: true } });
    const { result } = renderHook(() => useCompanyLogout(), { wrapper });
    await act(async () => {
      await result.current();
    });
    expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBe("fcm-token-1");
  });

  it("silme isteği askıda kalırsa en çok PUSH_UNREGISTER_WAIT_MS beklenir; belirteç bekler", async () => {
    vi.useFakeTimers();
    try {
      window.localStorage.setItem(PUSH_TOKEN_KEY, "fcm-token-1");
      fetchMock.mockReturnValue(new Promise(() => {}));
      h.post.mockResolvedValue({ data: { ok: true } });
      const { result } = renderHook(() => useCompanyLogout(), { wrapper });
      let done!: Promise<void>;
      act(() => {
        done = result.current();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PUSH_UNREGISTER_WAIT_MS - 1);
      });
      expect(h.post).not.toHaveBeenCalledWith("/company-auth/logout");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
        await done;
      });
      expect(h.post).toHaveBeenCalledWith("/company-auth/logout");
      expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBe("fcm-token-1");
      expect(window.location.href).toBe("/company/login");
    } finally {
      vi.useRealTimers();
    }
  });

  // İnceleme bulgusu: kayıt isteği sürerken çıkılırsa silme kaydı geçip önce
  // varabiliyordu; geç varan kayıt satırı çıkan kişiye yeniden bağlıyordu.
  it("sürmekte olan kayıt isteği bitmeden silme gönderilmez", async () => {
    window.localStorage.setItem(PUSH_TOKEN_KEY, "fcm-token-1");
    let finishRegister!: () => void;
    void runPushDeviceRequest(() => new Promise<void>((resolve) => (finishRegister = resolve)));
    h.post.mockResolvedValue({ data: { ok: true } });
    const { result } = renderHook(() => useCompanyLogout(), { wrapper });
    let done!: Promise<void>;
    act(() => {
      done = result.current();
    });
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    // Belirteç yine de hemen bekleyen silmeye taşındı (sayfa ölse de denenir).
    expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBe("fcm-token-1");
    await act(async () => {
      finishRegister();
      await done;
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(h.post).toHaveBeenCalledWith("/company-auth/logout");
    expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBeNull();
  });

  it("belirteç yoksa (tarayıcı) silme isteği atılmaz", async () => {
    h.post.mockResolvedValue({ data: { ok: true } });
    const { result } = renderHook(() => useCompanyLogout(), { wrapper });
    await act(async () => {
      await result.current();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.post.mock.calls.map((c) => c[0])).toEqual(["/company-auth/logout"]);
  });
});
