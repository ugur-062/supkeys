// @vitest-environment jsdom
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: h.toast }));

import { __resetRoleRefreshForTests, api } from "../api";
import { useAdminAuthStore } from "../auth/store";

const SALES = { id: "a1", email: "a@b.c", firstName: "A", lastName: "B", role: "SALES" as const };

/** Adaptör: /admin/auth/me → `me`; diğer her istek 403. */
function stubAdapter(me: unknown) {
  const calls: string[] = [];
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    calls.push(config.url ?? "");
    if (config.url === "/admin/auth/me") {
      return { data: me, status: 200, statusText: "OK", headers: {}, config };
    }
    throw new AxiosError("403", "ERR_BAD_REQUEST", config, undefined, {
      status: 403,
      statusText: "",
      data: { message: "Bu işlem için yetkiniz yok" },
      headers: {},
      config,
    });
  };
  return calls;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  __resetRoleRefreshForTests();
  useAdminAuthStore.setState({ admin: SALES });
});

describe("admin api — dil (arayüz testi D-030)", () => {
  it("her istekte Accept-Language: tr gönderilir", () => {
    expect(api.defaults.headers["Accept-Language"]).toBe("tr");
  });
});

describe("admin api — 403 sonrası rol tazeleme (arayüz testi D-224)", () => {
  it("403 → /me yeniden çekilir, store yeni rolle güncellenir (menü anında değişir)", async () => {
    const calls = stubAdapter({ ...SALES, role: "SUPPORT" });
    await api.get("/admin/growth/invites").catch(() => undefined);
    await flush();
    expect(calls).toContain("/admin/auth/me");
    expect(useAdminAuthStore.getState().admin?.role).toBe("SUPPORT");
    expect(h.toast.error).toHaveBeenCalledTimes(1);
  });

  it("art arda 403'ler /me'yi tek sefer çeker (aralık sınırı)", async () => {
    const calls = stubAdapter({ ...SALES, role: "SUPPORT" });
    await api.get("/admin/growth/invites").catch(() => undefined);
    await api.get("/admin/audit-logs").catch(() => undefined);
    await flush();
    expect(calls.filter((c) => c === "/admin/auth/me")).toHaveLength(1);
  });

  it("auth uçlarının 403'ü /me döngüsü başlatmaz", async () => {
    const calls = stubAdapter(SALES);
    await api.post("/admin/auth/change-password", {}).catch(() => undefined);
    await flush();
    expect(calls).not.toContain("/admin/auth/me");
  });

  it("oturum yoksa (admin null) /me çekilmez", async () => {
    useAdminAuthStore.setState({ admin: null });
    const calls = stubAdapter(SALES);
    await api.get("/admin/growth/invites").catch(() => undefined);
    await flush();
    expect(calls).not.toContain("/admin/auth/me");
  });
});
