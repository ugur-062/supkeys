// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  post: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: { post: h.post, get: vi.fn() } }));
vi.mock("@/lib/auth/store", () => ({
  setAdminRemember: vi.fn(),
  useAdminAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ clear: h.clear, admin: null, setAuth: vi.fn(), setAdmin: vi.fn() }),
}));

import { LOGOUT_WAIT_MS, useAdminLogout } from "../use-admin-auth";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", {
    writable: true,
    configurable: true,
    value: { href: "" },
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useAdminLogout (derin denetim MU-21 — çerez silinmeden sayfa değişmesin)", () => {
  it("logout yanıtı gelmeden YÖNLENDİRMEZ; yanıttan sonra yönlendirir", async () => {
    let resolvePost: (v: unknown) => void = () => undefined;
    h.post.mockReturnValue(new Promise((r) => (resolvePost = r)));
    const { result } = renderHook(() => useAdminLogout(), { wrapper });

    let done!: Promise<void>;
    act(() => {
      done = result.current();
    });
    expect(h.post).toHaveBeenCalledWith("/admin/auth/logout");
    await Promise.resolve();
    expect(window.location.href).toBe("");

    await act(async () => {
      resolvePost({ data: { ok: true } });
      await done;
    });
    expect(h.clear).toHaveBeenCalled();
    expect(window.location.href).toBe("/admin/login");
  });

  it("API askıda kalırsa en çok LOGOUT_WAIT_MS sonra yine de çıkar", async () => {
    vi.useFakeTimers();
    h.post.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useAdminLogout(), { wrapper });
    const done = result.current();
    await vi.advanceTimersByTimeAsync(LOGOUT_WAIT_MS - 1);
    expect(window.location.href).toBe("");
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(window.location.href).toBe("/admin/login");
  });

  it("istek hata verse de istemci temizlenip çıkılır", async () => {
    h.post.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useAdminLogout(), { wrapper });
    await act(async () => {
      await result.current();
    });
    expect(h.clear).toHaveBeenCalled();
    expect(window.location.href).toBe("/admin/login");
  });
});
