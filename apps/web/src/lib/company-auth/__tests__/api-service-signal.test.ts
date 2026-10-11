// @vitest-environment jsdom
import enCommon from "@rothern/i18n/catalog/en/common.json";
import ruCommon from "@rothern/i18n/catalog/ru/common.json";
import trCommon from "@rothern/i18n/catalog/tr/common.json";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { toast } from "sonner";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: vi.fn(), warning: vi.fn() } }));

import { extractErrorMessage } from "@/lib/tenders/error";
import { companyApi } from "../api";
import {
  SERVICE_PROBE_TIMEOUT_MS,
  SERVICE_SLOW_AFTER_MS,
  isServiceUnreachable,
  resetServiceHealthForTests,
  subscribeServiceHealth,
} from "../service-health";

/**
 * `companyApi` INTERCEPTOR'LARI → SAĞLIK SİNYALİ (canlı doğrulama OUT-1 / OUT-3).
 *
 * OUT-1: panel açıkken API gidince "Sunucuya şu anda ulaşılamıyor" notu hiç
 * çıkmıyordu (`/me` 0 kez soruldu). Artık panelin bir isteği yanıtsız biter /
 * 502 · 503 · 504 alır / ~6 sn yanıtsız kalırsa TEK `/me` yoklaması atılır.
 * OUT-3: "Bağlantı hatası, internet bağlantınızı kontrol edin" toast'ı sunucu
 * kesintisinde kullanıcının bağlantısını suçluyor ve notun üstüne biniyordu.
 */
type Outcome = "network" | "hang" | "cancel" | { status: number; data?: unknown };

const NEUTRAL = "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.";
const SERVER = "Sunucu hatası, lütfen tekrar deneyin";
const ME = "/company-auth/me";

let route: (config: InternalAxiosRequestConfig) => Outcome;
let calls: InternalAxiosRequestConfig[];
const callsTo = (url: string) => calls.filter((c) => c.url === url);

const adapter: AxiosAdapter = (config) => {
  calls.push(config);
  const outcome = route(config);
  if (outcome === "network") return Promise.reject(new AxiosError("Network Error", AxiosError.ERR_NETWORK, config));
  if (outcome === "cancel") return Promise.reject(new axios.CanceledError("canceled", config));
  if (outcome === "hang") {
    // Asılı bağlantı: yanıt gelmez; axios kendi zaman aşımında yanıtsız hata atar.
    return new Promise((_, reject) => {
      setTimeout(
        () => reject(new AxiosError(`timeout of ${config.timeout}ms exceeded`, AxiosError.ECONNABORTED, config)),
        config.timeout ?? 45_000,
      );
    });
  }
  const response = { data: outcome.data ?? {}, status: outcome.status, statusText: "", headers: {}, config };
  if (outcome.status >= 200 && outcome.status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError("Request failed", AxiosError.ERR_BAD_RESPONSE, config, null, response));
};

const originalAdapter = companyApi.defaults.adapter;
beforeAll(() => {
  companyApi.defaults.adapter = adapter;
});
afterAll(() => {
  companyApi.defaults.adapter = originalAdapter;
});

/** Panel kabuğu açık: "ulaşılamıyor" notu sinyali dinliyor. */
const mountNotice = () => subscribeServiceHealth(() => {});
/** Bekleyen söz zincirlerini (interceptor → yoklama → karar → toast) boşaltır. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
/** Görev sınırı: sıfır gecikmeli zamanlayıcılar (emicinin kalkışı) koşar. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const get = (url: string) => companyApi.get(url).then(
  () => "ok" as const,
  () => "failed" as const,
);

beforeEach(() => {
  resetServiceHealthForTests();
  calls = [];
  route = () => ({ status: 200 });
  h.toastError.mockClear();
});
afterEach(async () => {
  vi.useRealTimers();
  // Düşen mutasyonun "tek mesaj" emicisi (OUTR-6) sıfır gecikmeli zamanlayıcıyla
  // kalkar; sonraki test onu devralmasın.
  await nextTask();
});

describe("OUT-1 — panel açıkken API gidince tek `/me` yoklaması", () => {
  it("yanıtsız biten istekler TEK yoklamayı paylaşır; yoklama da düşerse 'ulaşılamıyor'", async () => {
    mountNotice();
    route = () => "network";
    await Promise.all([get("/company/orders"), get("/company/connections"), get("/company/items")]);
    await settle();
    expect(callsTo(ME)).toHaveLength(1);
    // Yoklama tek deneme, kısa zaman aşımı (genel 45 sn değil) ve toast'sız.
    expect(callsTo(ME)[0]).toMatchObject({ serviceProbe: true, skipErrorToast: true, timeout: SERVICE_PROBE_TIMEOUT_MS });
    expect(isServiceUnreachable()).toBe(true);
    // Not açıkken düşen yeni istekler `/me`yi yeniden yoklamaz.
    await Promise.all([get("/company/orders"), get("/company/orders")]);
    await settle();
    expect(callsTo(ME)).toHaveLength(1);
  });

  it.each([502, 503, 504])("HTTP %i (geçit hatası) yoklamayı tetikler", async (status) => {
    mountNotice();
    route = () => ({ status });
    await get("/company/orders");
    await settle();
    expect(callsTo(ME)).toHaveLength(1);
    expect(isServiceUnreachable()).toBe(true);
  });

  it.each([400, 401, 403, 404, 409, 422, 429, 500])("HTTP %i yoklamayı TETİKLEMEZ (API yanıt verdi)", async (status) => {
    mountNotice();
    route = () => ({ status });
    await get("/company/orders");
    await settle();
    expect(callsTo(ME)).toHaveLength(0);
    expect(isServiceUnreachable()).toBe(false);
  });

  it("tek uç arızalı, `/me` sağlıklı → not yok", async () => {
    mountNotice();
    route = (config) => (config.url === ME ? { status: 200 } : "network");
    await get("/company/orders");
    await settle();
    expect(callsTo(ME)).toHaveLength(1);
    expect(isServiceUnreachable()).toBe(false);
  });

  it("uyuyan API (asılı bağlantı): ~6 sn yanıtsız kalan istek yoklamayı tetikler, yoklama da yanıtsız kalırsa 'ulaşılamıyor'", async () => {
    vi.useFakeTimers();
    mountNotice();
    route = () => "hang";
    void get("/company/orders");
    await vi.advanceTimersByTimeAsync(SERVICE_SLOW_AFTER_MS - 200);
    expect(callsTo(ME)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(400);
    expect(callsTo(ME)).toHaveLength(1);
    expect(isServiceUnreachable()).toBe(false);
    await vi.advanceTimersByTimeAsync(SERVICE_PROBE_TIMEOUT_MS + 100);
    expect(isServiceUnreachable()).toBe(true);
    // Hata kartı / toast gelmeden çok önce: istek hâlâ asılı (45 sn zaman aşımı).
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it("yavaş ama yanıt veren uç (uzun AI isteği): yoklama sağlıklı döner → not yok", async () => {
    vi.useFakeTimers();
    mountNotice();
    route = (config) => (config.url === ME ? { status: 200 } : "hang");
    void get("/company/ai/search");
    await vi.advanceTimersByTimeAsync(SERVICE_SLOW_AFTER_MS + SERVICE_PROBE_TIMEOUT_MS + 5_000);
    expect(callsTo(ME)).toHaveLength(1);
    expect(isServiceUnreachable()).toBe(false);
  });

  it("süresinde yanıtlanan istek yoklama tetiklemez", async () => {
    vi.useFakeTimers();
    mountNotice();
    await get("/company/orders");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(callsTo(ME)).toHaveLength(0);
  });

  it("API döndü: gelen ilk yanıt (başarı ya da 4xx) 'ulaşılamıyor'u kapatır", async () => {
    mountNotice();
    route = () => "network";
    await get("/company/orders");
    await settle();
    expect(isServiceUnreachable()).toBe(true);
    route = () => ({ status: 200 });
    await get("/company/orders");
    expect(isServiceUnreachable()).toBe(false);

    route = () => "network";
    await get("/company/orders");
    await settle();
    expect(isServiceUnreachable()).toBe(true);
    route = () => ({ status: 404 });
    await get("/company/orders/yok");
    expect(isServiceUnreachable()).toBe(false);
  });

  it("not çizilmeyen sayfada (giriş, kayıt) yoklama atılmaz", async () => {
    route = () => "network";
    await get("/company-auth/vies-check");
    await settle();
    expect(callsTo(ME)).toHaveLength(0);
    expect(isServiceUnreachable()).toBe(false);
  });

  it("iptal edilen istek (sorgu `signal`i) ne yoklama ne toast üretir", async () => {
    mountNotice();
    route = () => "cancel";
    await get("/company/tenders/1/items");
    await settle();
    expect(callsTo(ME)).toHaveLength(0);
    expect(h.toastError).not.toHaveBeenCalled();
  });
});

describe("OUT-3 — kesinti toast'ı", () => {
  it("metin üç dilde nötr: sunucuya ulaşılamadığını söyler, kullanıcının internetini suçlamaz", () => {
    expect(trCommon.errors.network).toBe(NEUTRAL);
    expect(enCommon.errors.network).toBe("The server could not be reached. Check your connection and try again.");
    expect(ruCommon.errors.network).toBe("Не удалось связаться с сервером. Проверьте подключение и повторите попытку.");
    for (const text of [trCommon.errors.network, enCommon.errors.network, ruCommon.errors.network]) {
      expect(text).not.toMatch(/internet|интернет/i);
    }
  });

  it("not çıkacaksa (yoklama düştü) okuma hatasında toast BASILMAZ; not açıkken de basılmaz", async () => {
    mountNotice();
    route = () => "network";
    await Promise.all([get("/company/orders"), get("/company/connections")]);
    await settle();
    expect(isServiceUnreachable()).toBe(true);
    await get("/company/items");
    await settle();
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it("geçit hatasında (503) da aynı: not varken 'Sunucu hatası' toast'ı yok", async () => {
    mountNotice();
    route = () => ({ status: 503 });
    await get("/company/orders");
    await settle();
    await get("/company/orders");
    await settle();
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it("not yoksa (tek istek düştü, API ayakta) NÖTR metin: kullanıcının internetini suçlamaz", async () => {
    mountNotice();
    route = (config) => (config.url === ME ? { status: 200 } : "network");
    await get("/company/orders");
    await settle();
    expect(h.toastError).toHaveBeenCalledTimes(1);
    expect(h.toastError).toHaveBeenCalledWith(NEUTRAL);
    expect(NEUTRAL).not.toMatch(/internet/i);
  });

  it("not yoksa geçit hatası eski 'Sunucu hatası' toast'ını alır", async () => {
    mountNotice();
    route = (config) => (config.url === ME ? { status: 200 } : { status: 502 });
    await get("/company/orders");
    await settle();
    expect(h.toastError).toHaveBeenCalledTimes(1);
    expect(h.toastError).toHaveBeenCalledWith(SERVER);
  });

  it("not çizilmeyen sayfada toast hemen ve nötr metinle", async () => {
    route = () => "network";
    await get("/company/items/1/showcase");
    await settle();
    expect(h.toastError).toHaveBeenCalledWith(NEUTRAL);
  });

  it("MUTASYON not açıkken de toast alır — kullanıcının eylemi sessiz kalmaz", async () => {
    mountNotice();
    route = () => "network";
    await get("/company/orders");
    await settle();
    expect(isServiceUnreachable()).toBe(true);
    expect(h.toastError).not.toHaveBeenCalled();
    await companyApi.post("/company/orders/1/approve").catch(() => {});
    expect(h.toastError).toHaveBeenCalledTimes(1);
    expect(h.toastError).toHaveBeenCalledWith(NEUTRAL);
  });

  it("500 kesinti belirtisi değildir: toast hemen, yoklama yok", async () => {
    mountNotice();
    route = () => ({ status: 500 });
    await get("/company/orders");
    expect(h.toastError).toHaveBeenCalledWith(SERVER);
    expect(callsTo(ME)).toHaveLength(0);
  });

  it("`skipErrorToast` isteği toast basmaz ama sinyal üretir", async () => {
    mountNotice();
    route = () => "network";
    await companyApi.get("/company/team/invite-preview", { skipErrorToast: true }).catch(() => {});
    await settle();
    expect(h.toastError).not.toHaveBeenCalled();
    expect(isServiceUnreachable()).toBe(true);
  });
});

describe("OUTR-6 — kesintide düşen kayıtta TEK hata mesajı, nedeni söyleyen", () => {
  // Hesap Bilgileri › Kaydet ve Üye Davet Et › Davet Gönder: çağıranın catch'i
  // `toast.error(extractErrorMessage(err, "Güncellenemedi"))` basar. Yanıtsız
  // hatada o metin interceptor'ınkinden farklıdır → iki toast üst üste biniyor,
  // nedeni söyleyen altta kalıyordu.
  it("mutateAsync + try/catch (Hesap Bilgileri): yalnız 'Sunucuya ulaşılamadı…' basılır", async () => {
    mountNotice();
    route = () => "network";
    const save = async () => {
      try {
        await companyApi.patch("/company/users/me", { firstName: "Ada" });
      } catch (err) {
        toast.error(extractErrorMessage(err, "Güncellenemedi"));
      }
    };
    await save();
    expect(h.toastError).toHaveBeenCalledTimes(1);
    expect(h.toastError).toHaveBeenCalledWith(NEUTRAL);
  });

  it("gerçek useMutation yolu (`onError` + çağrı başına `onError`): yine tek toast", async () => {
    mountNotice();
    route = () => "network";
    const observer = new MutationObserver(new QueryClient(), {
      mutationFn: () => companyApi.post("/company/users/invitations", { email: "uye@example.com" }),
      onError: (err) => {
        toast.error(extractErrorMessage(err, "Davet gönderilemedi"));
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    await observer
      .mutate(undefined, { onError: (err) => void toast.error(extractErrorMessage(err, "İşlem başarısız")) })
      .catch(() => {});
    unsubscribe();
    expect(h.toastError).toHaveBeenCalledTimes(1);
    expect(h.toastError).toHaveBeenCalledWith(NEUTRAL);
  });

  it("geçidin gövdesiz 502'si de aynı: çağıranın genel metni basılmaz", async () => {
    route = () => ({ status: 502, data: "<html>Bad Gateway</html>" });
    await companyApi.post("/company/orders/1/approve").catch((err) => {
      toast.error(extractErrorMessage(err, "Onaylanamadı"));
    });
    expect(h.toastError).toHaveBeenCalledTimes(1);
    expect(h.toastError).toHaveBeenCalledWith(SERVER);
  });

  it("aynı görevde düşen iki kayıt tek toast üretir", async () => {
    route = () => "network";
    const fail = (url: string, fallback: string) =>
      companyApi.post(url).catch((err) => {
        toast.error(extractErrorMessage(err, fallback));
      });
    await Promise.all([fail("/company/addresses", "Adres eklenemedi"), fail("/company/bank-accounts", "Hesap eklenemedi")]);
    expect(h.toastError.mock.calls.map((call) => call[0])).toEqual([NEUTRAL]);
  });

  it("emici görev bitince kalkar: sonraki hata toast'ı basılır", async () => {
    route = () => "network";
    await companyApi.post("/company/addresses").catch((err) => {
      toast.error(extractErrorMessage(err, "Adres eklenemedi"));
    });
    await nextTask();
    toast.error("Dosya çok büyük");
    expect(h.toastError.mock.calls.map((call) => call[0])).toEqual([NEUTRAL, "Dosya çok büyük"]);
    // Emici kalktı: `toast.error` yine testin casusu.
    expect(toast.error).toBe(h.toastError);
  });

  it("API'nin kendi metni varsa (gövdeli 503) çağıranın toast'ı YUTULMAZ — daha özgül olan odur", async () => {
    route = () => ({ status: 503, data: { message: "AI servisi şu anda kullanılamıyor" } });
    await companyApi.post("/company/ai/search").catch((err) => {
      toast.error(extractErrorMessage(err, "Arama başarısız"));
    });
    expect(h.toastError.mock.calls.map((call) => call[0])).toEqual([SERVER, "AI servisi şu anda kullanılamıyor"]);
  });

  it("okuma (GET) hatası emici kurmaz", async () => {
    route = () => "network";
    await companyApi.get("/company/items/1/showcase").catch(() => {
      toast.error("Vitrin okunamadı");
    });
    await settle();
    expect(h.toastError.mock.calls.map((call) => call[0])).toEqual([NEUTRAL, "Vitrin okunamadı"]);
  });

  it("metin olmayan (JSX) hata toast'ı emiciden geçer", async () => {
    route = () => "network";
    const node = { type: "span", props: {}, key: null } as unknown as React.ReactNode;
    await companyApi.post("/company/addresses").catch(() => {
      toast.error(node);
    });
    expect(h.toastError).toHaveBeenCalledTimes(2);
    expect(h.toastError).toHaveBeenLastCalledWith(node, undefined);
  });
});
