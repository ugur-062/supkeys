/**
 * Derin denetim S093/X05/X06: typeahead ve mega menü istekleri SAYFA dilini
 * Accept-Language ile gönderir (tarayıcının kendi başlığı değil); menü
 * önbelleği dil başınadır.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCategoryMenu, fetchSuggest } from "../suggest-client";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test/api");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => [] }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const langOf = (call: unknown[]) =>
  ((call[1] as RequestInit | undefined)?.headers as Record<string, string> | undefined)?.["accept-language"];

describe("suggest-client sayfa dili", () => {
  it("fetchSuggest sayfa dilini accept-language olarak yollar", async () => {
    await fetchSuggest("boru", "products", "en");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(langOf(fetchMock.mock.calls[0]!)).toBe("en");
  });

  it("fetchCategoryMenu dil başına önbelleklenir ve her dil kendi başlığıyla çekilir", async () => {
    await fetchCategoryMenu("ru");
    await fetchCategoryMenu("ru");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(langOf(fetchMock.mock.calls[0]!)).toBe("ru");
    await fetchCategoryMenu("tr");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(langOf(fetchMock.mock.calls[1]!)).toBe("tr");
  });
});
