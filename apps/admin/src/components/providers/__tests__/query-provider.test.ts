import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { describe, expect, it } from "vitest";
import { createAdminQueryClient, shouldRetryQuery } from "../query-provider";

function axiosError(status: number | null): AxiosError {
  const config = { headers: new AxiosHeaders(), url: "/admin/x/1" } as InternalAxiosRequestConfig;
  const response =
    status === null ? undefined : { status, statusText: "", data: {}, headers: {}, config };
  return new AxiosError("x", "ERR", config, undefined, response);
}

describe("shouldRetryQuery (arayüz testi D-215, D-033)", () => {
  it("4xx yeniden denenmez (aynı toast iki kez çıkmasın)", () => {
    for (const s of [400, 403, 404, 409, 422]) {
      expect(shouldRetryQuery(0, axiosError(s))).toBe(false);
    }
  });
  it("5xx ve ağ hatası bir kez yeniden denenir", () => {
    expect(shouldRetryQuery(0, axiosError(500))).toBe(true);
    expect(shouldRetryQuery(0, axiosError(null))).toBe(true);
    expect(shouldRetryQuery(1, axiosError(503))).toBe(false);
  });
  it("istemcinin varsayılanı bu kuraldır", () => {
    const qc = createAdminQueryClient();
    expect(qc.getDefaultOptions().queries?.retry).toBe(shouldRetryQuery);
  });
});
