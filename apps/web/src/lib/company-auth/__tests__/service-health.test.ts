// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SERVICE_SLOW_AFTER_MS,
  isServiceFailure,
  isServiceUnreachable,
  registerServiceProbe,
  reportServiceReachable,
  resetServiceHealthForTests,
  settleServiceRequest,
  subscribeServiceHealth,
  suspectServiceOutage,
  trackServiceRequest,
} from "../service-health";

/**
 * PANEL API SAĞLIK SİNYALİ (canlı doğrulama OUT-1): panel açıkken API giderse
 * "Sunucuya şu anda ulaşılamıyor" notu hiç çıkmıyordu — `/me` yalnız sayfa
 * yüklemesinde soruluyordu. Sinyal, panelin isteklerinin yaşadığından tek bir
 * `/me` yoklaması üretir.
 */
const networkError = { message: "Network Error", code: "ERR_NETWORK" };
const httpError = (status: number) => ({ response: { status } });

const probe = vi.fn<() => Promise<unknown>>();
const listener = vi.fn();
let unsubscribe: () => void;

beforeEach(() => {
  resetServiceHealthForTests();
  probe.mockReset().mockResolvedValue({ status: 200 });
  listener.mockReset();
  registerServiceProbe(probe);
  unsubscribe = subscribeServiceHealth(listener);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("isServiceFailure", () => {
  it("yanıtsız biten istek ve 502 · 503 · 504 kesinti belirtisidir", () => {
    expect(isServiceFailure(networkError)).toBe(true);
    expect(isServiceFailure({ code: "ECONNABORTED", message: "timeout of 45000ms exceeded" })).toBe(true);
    expect(isServiceFailure(httpError(502))).toBe(true);
    expect(isServiceFailure(httpError(503))).toBe(true);
    expect(isServiceFailure(httpError(504))).toBe(true);
  });

  it("4xx, 500 ve iptal edilen istek belirti DEĞİLDİR (API yanıt verdi / istek bizden kesildi)", () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429, 500]) expect(isServiceFailure(httpError(status))).toBe(false);
    expect(isServiceFailure({ code: "ERR_CANCELED", message: "canceled" })).toBe(false);
    expect(isServiceFailure({ __CANCEL__: true })).toBe(false);
    expect(isServiceFailure(null)).toBe(false);
  });
});

describe("suspectServiceOutage — tek yoklama", () => {
  it("aynı anda düşen istekler TEK `/me` yoklamasını paylaşır; yoklama da düşerse 'ulaşılamıyor'", async () => {
    probe.mockRejectedValue(networkError);
    const verdicts = await Promise.all([suspectServiceOutage(), suspectServiceOutage(), suspectServiceOutage()]);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(verdicts).toEqual([true, true, true]);
    expect(isServiceUnreachable()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("'ulaşılamıyor' iken yeni belirti yoklama ATMAZ (her düşen istek `/me`yi dövmez)", async () => {
    probe.mockRejectedValue(httpError(503));
    await suspectServiceOutage();
    expect(probe).toHaveBeenCalledTimes(1);
    await expect(suspectServiceOutage()).resolves.toBe(true);
    await expect(suspectServiceOutage()).resolves.toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("yoklama yanıt aldıysa API ayakta: not yok (tek uç arızalı / tek istek yavaş)", async () => {
    await expect(suspectServiceOutage()).resolves.toBe(false);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(isServiceUnreachable()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 500])("yoklama HTTP %i aldıysa da API ayakta (yanıt verdi)", async (status) => {
    probe.mockRejectedValue(httpError(status));
    await expect(suspectServiceOutage()).resolves.toBe(false);
    expect(isServiceUnreachable()).toBe(false);
  });

  it("dinleyen yoksa (not çizilmeyen sayfa: giriş, kayıt) yoklama da durum da yok", async () => {
    unsubscribe();
    probe.mockRejectedValue(networkError);
    await expect(suspectServiceOutage()).resolves.toBe(false);
    expect(probe).not.toHaveBeenCalled();
    expect(isServiceUnreachable()).toBe(false);
  });

  it("son dinleyen ayrılınca durum unutulur (çıkış → giriş sayfası 'ulaşılamıyor' taşımaz)", async () => {
    probe.mockRejectedValue(networkError);
    await suspectServiceOutage();
    expect(isServiceUnreachable()).toBe(true);
    unsubscribe();
    expect(isServiceUnreachable()).toBe(false);
  });

  it("yoklama sürerken başka bir istek yanıt aldıysa yanlış alarm: not açılmaz", async () => {
    let fail: (reason: unknown) => void = () => {};
    probe.mockImplementation(() => new Promise((_, reject) => (fail = reject)));
    const verdict = suspectServiceOutage();
    await Promise.resolve();
    expect(probe).toHaveBeenCalledTimes(1);
    reportServiceReachable();
    fail(networkError);
    await expect(verdict).resolves.toBe(false);
    expect(isServiceUnreachable()).toBe(false);
  });
});

describe("reportServiceReachable", () => {
  it("API'den yanıt geldi → durum temizlenir, dinleyen haberdar edilir; sonraki belirti yeniden yoklar", async () => {
    probe.mockRejectedValue(networkError);
    await suspectServiceOutage();
    listener.mockClear();
    reportServiceReachable();
    expect(isServiceUnreachable()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    // Temizken yinelenen bildirim dinleyeni rahatsız etmez.
    reportServiceReachable();
    expect(listener).toHaveBeenCalledTimes(1);
    await suspectServiceOutage();
    expect(probe).toHaveBeenCalledTimes(2);
  });
});

describe("gizli sekme", () => {
  it("gizli sekmede yoklama ATILMAZ; sekme görünür olunca tek yoklama atılır", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    probe.mockRejectedValue(networkError);
    const first = suspectServiceOutage();
    const second = suspectServiceOutage();
    await Promise.resolve();
    await Promise.resolve();
    expect(probe).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("gizliyken API yanıt verdiyse bekleyen şüphe düşer: görünür olunca yoklama yok", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const verdict = suspectServiceOutage();
    reportServiceReachable();
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await expect(verdict).resolves.toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });
});

describe("yanıtsız kalan istek (uyuyan API bağlantıyı asılı tutar)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it(`~6 sn yanıtsız kalan istek yoklamayı tetikler; öncesinde değil`, async () => {
    probe.mockRejectedValue(networkError);
    const request = {};
    trackServiceRequest(request);
    await vi.advanceTimersByTimeAsync(SERVICE_SLOW_AFTER_MS - 100);
    expect(probe).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(isServiceUnreachable()).toBe(true);
  });

  it("süre dolmadan biten istek yoklama tetiklemez", async () => {
    const request = {};
    trackServiceRequest(request);
    await vi.advanceTimersByTimeAsync(SERVICE_SLOW_AFTER_MS - 100);
    settleServiceRequest(request);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(probe).not.toHaveBeenCalled();
  });

  it("aynı anda asılı kalan istekler tek yoklamayı paylaşır", async () => {
    let fail: (reason: unknown) => void = () => {};
    probe.mockImplementation(() => new Promise((_, reject) => (fail = reject)));
    for (let i = 0; i < 5; i++) trackServiceRequest({});
    await vi.advanceTimersByTimeAsync(SERVICE_SLOW_AFTER_MS + 100);
    expect(probe).toHaveBeenCalledTimes(1);
    fail(networkError);
    await vi.advanceTimersByTimeAsync(0);
    expect(isServiceUnreachable()).toBe(true);
  });
});
