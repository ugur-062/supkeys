// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PUSH_REQUEST_ORDER_WAIT_MS,
  PUSH_SESSION_KEY,
  PUSH_TOKEN_KEY,
  PUSH_UNREGISTER_PENDING_KEY,
  clearPendingPushUnregister,
  clearPushToken,
  markPushStarted,
  nativePush,
  pushActionTarget,
  pushStartedThisSession,
  pushTokenValue,
  readPushToken,
  releasePushToken,
  resetPushDeviceRequests,
  retryPendingPushUnregister,
  runPushDeviceRequest,
  sendPushUnregister,
  storePushToken,
  unmarkPushStarted,
} from "./native-push";

const HERE = "https://www.rothern.com/company";
const UNREGISTER_URL = "http://localhost:4000/api/company-auth/push-devices/unregister";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  resetPushDeviceRequests();
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Bekleyen söz zincirlerini boşaltır. */
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("nativePush — köprü okuma", () => {
  const PushNotifications = { register: vi.fn() };

  it("tarayıcıda (köprü yok ya da yerel değil) null; yerel değilken eklenti ve platform okunmaz", () => {
    expect(nativePush(undefined)).toBeNull();
    expect(nativePush({})).toBeNull();
    const getPlatform = vi.fn(() => "android");
    expect(
      nativePush({ Capacitor: { isNativePlatform: () => false, getPlatform, Plugins: { PushNotifications } } }),
    ).toBeNull();
    expect(getPlatform).not.toHaveBeenCalled();
  });

  it("kabukta eklenti ve platform döner", () => {
    const win = { Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { PushNotifications } } };
    expect(nativePush(win)).toEqual({ plugin: PushNotifications, platform: "ios" });
  });

  it("eklentisi kurulmamış kabuk, bilinmeyen platform ve fırlatan köprü null", () => {
    expect(nativePush({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "android", Plugins: {} } })).toBeNull();
    expect(
      nativePush({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "web", Plugins: { PushNotifications } } }),
    ).toBeNull();
    expect(
      nativePush({
        Capacitor: {
          isNativePlatform: () => {
            throw new Error("bridge");
          },
        },
      }),
    ).toBeNull();
  });
});

describe("pushTokenValue", () => {
  it("dolu belirteci kırpıp döner; boş, metin olmayan ve 4096'dan uzun değer null", () => {
    expect(pushTokenValue({ value: "  abc  " })).toBe("abc");
    expect(pushTokenValue({ value: "" })).toBeNull();
    expect(pushTokenValue({ value: 42 })).toBeNull();
    expect(pushTokenValue(undefined)).toBeNull();
    expect(pushTokenValue({ value: "x".repeat(4096) })).toHaveLength(4096);
    expect(pushTokenValue({ value: "x".repeat(4097) })).toBeNull();
  });
});

describe("pushActionTarget — bildirime dokunma", () => {
  it("aynı kökendeki data.url açılır", () => {
    const url = "https://www.rothern.com/company/satinalma/talepler/abc";
    expect(pushActionTarget({ notification: { data: { url } } }, HERE)).toBe(url);
  });

  it("yabancı köken, rota işleyicisi, url'siz ya da bozuk veri açılmaz", () => {
    expect(pushActionTarget({ notification: { data: { url: "https://evil.example/company" } } }, HERE)).toBeNull();
    expect(pushActionTarget({ notification: { data: { url: "https://www.rothern.com/api/x" } } }, HERE)).toBeNull();
    expect(pushActionTarget({ notification: { data: { type: "BID_RECEIVED" } } }, HERE)).toBeNull();
    expect(pushActionTarget({ notification: { data: { url: 7 } } }, HERE)).toBeNull();
    expect(pushActionTarget({ notification: { data: "x" } }, HERE)).toBeNull();
    expect(pushActionTarget({}, HERE)).toBeNull();
    expect(pushActionTarget(undefined, HERE)).toBeNull();
  });
});

describe("belirteç deposu", () => {
  it("yazılır, okunur, silinir (anahtar rothern:push-token)", () => {
    expect(readPushToken()).toBeNull();
    storePushToken("tok-1");
    expect(window.localStorage.getItem(PUSH_TOKEN_KEY)).toBe("tok-1");
    expect(readPushToken()).toBe("tok-1");
    clearPushToken();
    expect(readPushToken()).toBeNull();
  });

  it("açılış işareti kullanıcıya bağlı; silme yalnız aynı kullanıcınınkini kaldırır; clearPushToken onu da siler", () => {
    expect(pushStartedThisSession("u1")).toBe(false);
    markPushStarted("u1");
    expect(window.sessionStorage.getItem(PUSH_SESSION_KEY)).toBe("u1");
    expect(pushStartedThisSession("u1")).toBe(true);
    expect(pushStartedThisSession("u2")).toBe(false);
    unmarkPushStarted("u2");
    expect(pushStartedThisSession("u1")).toBe(true);
    unmarkPushStarted("u1");
    expect(pushStartedThisSession("u1")).toBe(false);
    markPushStarted("u1");
    clearPushToken();
    expect(pushStartedThisSession("u1")).toBe(false);
  });

  it("depo fırlatırsa hiçbiri fırlatmaz", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readPushToken()).toBeNull();
    expect(() => storePushToken("t")).not.toThrow();
    expect(() => clearPushToken()).not.toThrow();
    expect(pushStartedThisSession("u1")).toBe(false);
    expect(() => markPushStarted("u1")).not.toThrow();
    expect(() => unmarkPushStarted("u1")).not.toThrow();
    expect(() => clearPendingPushUnregister("t")).not.toThrow();
    // Depo kapalıyken de silme isteği gider (yalnız yeniden deneme olmaz).
    await expect(releasePushToken("t")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(retryPendingPushUnregister()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("sendPushUnregister — sayfa değişse de giden silme isteği", () => {
  it("keepalive, çerezsiz, JSON gövdeli POST; yalnız 2xx true", async () => {
    await expect(sendPushUnregister("tok-1")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(UNREGISTER_URL);
    expect(init).toMatchObject({ method: "POST", keepalive: true, credentials: "omit" });
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ token: "tok-1" });

    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));
    await expect(sendPushUnregister("tok-1")).resolves.toBe(false);
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    await expect(sendPushUnregister("tok-1")).resolves.toBe(false);
  });
});

describe("releasePushToken — çıkış / oturum düşmesi", () => {
  it("belirteç yoksa istek atmaz", async () => {
    await expect(releasePushToken()).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("istek gitmeden belirteci bekleyen silmeye taşır; 2xx gelince bekleyen de kalkar", async () => {
    storePushToken("tok-1");
    markPushStarted("u1");
    let answer!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const done = releasePushToken();
    // Eşzamanlı: sayfa hemen değişse de sonraki yükleme yeniden dener.
    expect(readPushToken()).toBeNull();
    expect(pushStartedThisSession("u1")).toBe(false);
    expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    answer(new Response("{}", { status: 200 }));
    await expect(done).resolves.toBe(true);
    expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBeNull();
  });

  it("istek başarısızsa belirteç yeniden denenmek üzere bekler; sonraki yükleme dener ve kaldırır", async () => {
    storePushToken("tok-1");
    fetchMock.mockResolvedValueOnce(new Response("", { status: 503 }));
    await expect(releasePushToken()).resolves.toBe(false);
    expect(readPushToken()).toBeNull();
    expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBe("tok-1");

    await expect(retryPendingPushUnregister()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ token: "tok-1" });
    expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBeNull();
  });

  it("bekleyen silme yoksa yeniden deneme istek atmaz; başka belirteç yazıldıysa ona dokunulmaz", async () => {
    await expect(retryPendingPushUnregister()).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    window.localStorage.setItem(PUSH_UNREGISTER_PENDING_KEY, "tok-2");
    clearPendingPushUnregister("tok-1");
    expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBe("tok-2");
    clearPendingPushUnregister("tok-2");
    expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBeNull();
  });

  it("sıralı silme, sürmekte olan kayıt isteği bitmeden gönderilmez", async () => {
    storePushToken("tok-1");
    let finishRegister!: () => void;
    const register = runPushDeviceRequest(() => new Promise<void>((resolve) => (finishRegister = resolve)));
    const done = releasePushToken(readPushToken(), { ordered: true });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    finishRegister();
    await register;
    await expect(done).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sırasız silme (oturum düşmesi) HEMEN gider ama sonraki kayıt onun ardından gider", async () => {
    storePushToken("tok-1");
    let answer!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const released = releasePushToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const register = vi.fn(async () => "ok");
    const registered = runPushDeviceRequest(register);
    await flush();
    expect(register).not.toHaveBeenCalled();
    answer(new Response("{}", { status: 200 }));
    await released;
    await expect(registered).resolves.toBe("ok");
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("askıda kalan önceki istek sırayı en çok PUSH_REQUEST_ORDER_WAIT_MS tutar", async () => {
    vi.useFakeTimers();
    try {
      void runPushDeviceRequest(() => new Promise(() => {}));
      const next = vi.fn(async () => "ok");
      const done = runPushDeviceRequest(next);
      await vi.advanceTimersByTimeAsync(PUSH_REQUEST_ORDER_WAIT_MS - 1);
      expect(next).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await expect(done).resolves.toBe("ok");
    } finally {
      vi.useRealTimers();
    }
  });
});
