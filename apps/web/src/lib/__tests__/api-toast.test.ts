// @vitest-environment jsdom
import type { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Genel (auth'suz) axios örneğinin hata toast'ı: hatayı kendi kartında
 * gösteren token sayfaları istek başına `skipErrorToast` ile kapatır
 * (arayüz testi D-058 — kartın üstüne bir de "Geçersiz bağlantı" toast'ı).
 */
const h = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: h.error } }));
vi.mock("@/i18n/runtime", () => ({ runtimeLocale: () => "tr", tRuntime: (k: string) => k }));

import { api } from "../api";

type Rejected = (e: AxiosError) => Promise<never>;
const rejected = (): Rejected =>
  (api.interceptors.response as unknown as { handlers: { rejected: Rejected }[] }).handlers[0].rejected;

function err(status: number, config: Record<string, unknown> = {}): AxiosError {
  return {
    config: { url: "/public/referral-optout/x", headers: {}, ...config },
    response: { status, data: { message: "Geçersiz bağlantı" } },
  } as unknown as AxiosError;
}

beforeEach(() => h.error.mockReset());

describe("public api hata toast'ı", () => {
  it("varsayılan: tek-kayıt 404 ve 5xx toast verir", async () => {
    await expect(rejected()(err(404))).rejects.toBeDefined();
    await expect(rejected()(err(500))).rejects.toBeDefined();
    expect(h.error).toHaveBeenCalledTimes(2);
  });

  it("skipErrorToast: hata reddedilir ama toast YOK", async () => {
    const e = err(404, { skipErrorToast: true });
    await expect(rejected()(e)).rejects.toBe(e);
    await expect(rejected()(err(500, { skipErrorToast: true }))).rejects.toBeDefined();
    await expect(rejected()(err(400, { skipErrorToast: true }))).rejects.toBeDefined();
    expect(h.error).not.toHaveBeenCalled();
  });
});
