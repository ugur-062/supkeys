// @vitest-environment jsdom
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: h.toast }));

import { api, apiErrorMessage, toastApiError } from "../api";

/**
 * Derin denetim MU-21: sayfalar `e instanceof Error ? e.message : "Hata"` ile
 * AxiosError'ın ham "Request failed with status code 400" metnini gösteriyordu;
 * doğrulama (`errors`) sebebi hiç görünmüyor, diğer 4xx'te çift toast çıkıyordu.
 */
function axiosError(status: number | null, data?: unknown): AxiosError {
  const config = { headers: new AxiosHeaders(), url: "/admin/x/1" } as InternalAxiosRequestConfig;
  const response =
    status === null
      ? undefined
      : { status, statusText: "", data, headers: {}, config };
  return new AxiosError(
    `Request failed with status code ${status}`,
    "ERR_BAD_REQUEST",
    config,
    undefined,
    response,
  );
}

/** İsteği interceptor zincirinden geçirir (gerçek ağ yok). */
async function viaInterceptor(status: number, data: unknown): Promise<unknown> {
  const original = api.defaults.adapter;
  api.defaults.adapter = async (config) => {
    throw new AxiosError(
      `Request failed with status code ${status}`,
      "ERR_BAD_REQUEST",
      config,
      undefined,
      { status, statusText: "", data, headers: {}, config },
    );
  };
  try {
    await api.post("/admin/listings/1/close", {});
    return undefined;
  } catch (e) {
    return e;
  } finally {
    api.defaults.adapter = original;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("apiErrorMessage", () => {
  it("doğrulama errors haritasındaki ilk alan mesajını döner (ham axios metni değil)", () => {
    const e = axiosError(400, {
      message: "Doğrulama başarısız",
      errors: { reason: "En az 10 karakter olmalı" },
    });
    expect(apiErrorMessage(e)).toBe("En az 10 karakter olmalı");
  });

  it("errors yoksa sunucu message'ını döner", () => {
    expect(apiErrorMessage(axiosError(409, { message: "Sipariş zaten iptal" }))).toBe(
      "Sipariş zaten iptal",
    );
  });

  it("gövde yoksa fallback — 'Request failed with status code' ASLA", () => {
    const msg = apiErrorMessage(axiosError(null), "Kaydedilemedi");
    expect(msg).toBe("Kaydedilemedi");
    expect(msg).not.toMatch(/Request failed/);
  });

  it("axios dışı hata kendi mesajını korur", () => {
    expect(apiErrorMessage(new Error("Dosya çok büyük"))).toBe("Dosya çok büyük");
  });
});

describe("toastApiError + interceptor", () => {
  it("400 + errors: interceptor susar, sayfa alan mesajını TEK toast olarak gösterir", async () => {
    const e = await viaInterceptor(400, {
      message: "Doğrulama başarısız",
      errors: { reason: "En az 10 karakter olmalı" },
    });
    expect(h.toast.error).not.toHaveBeenCalled();
    toastApiError(e);
    expect(h.toast.error).toHaveBeenCalledTimes(1);
    expect(h.toast.error).toHaveBeenCalledWith("En az 10 karakter olmalı");
  });

  it("409: interceptor toast'ladı → sayfa ikinci (ham) toast basmaz", async () => {
    const e = await viaInterceptor(409, { message: "Bu işlem mevcut durumda yapılamaz" });
    expect(h.toast.error).toHaveBeenCalledTimes(1);
    toastApiError(e);
    expect(h.toast.error).toHaveBeenCalledTimes(1);
  });

  it("403: tek toast (sunucu mesajı)", async () => {
    const e = await viaInterceptor(403, { message: "Yetkiniz yok" });
    toastApiError(e);
    expect(h.toast.error).toHaveBeenCalledTimes(1);
    expect(h.toast.error).toHaveBeenCalledWith("Yetkiniz yok");
  });
});
