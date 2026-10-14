// @vitest-environment jsdom
import { AxiosError, type AxiosAdapter } from "axios";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PUSH_SESSION_KEY,
  PUSH_TOKEN_KEY,
  PUSH_UNREGISTER_PENDING_KEY,
  resetPushDeviceRequests,
} from "@/lib/native-push";
import { companyApi } from "../api";
import { useCompanyAuthStore } from "../store";

/**
 * OTURUM 401 İLE DÜŞÜNCE CİHAZ BELİRTECİ (inceleme bulgusu, anlık bildirim).
 *
 * Oturum açık çıkış dışında da biter: süre dolar, şifre başka yerde sıfırlanır,
 * yönetici "tüm cihazlardan çıkar" der. 401 dalı yalnız anlık görüntüyü silip
 * girişe yönlendiriyordu; cihaz satırı önceki kişiye bağlı kalıyor, giriş
 * sayfasındaki telefona o kişinin bildirimleri gelmeye devam ediyordu.
 */
const UNREGISTER_URL = "http://localhost:4000/api/company-auth/push-devices/unregister";

const fetchMock = vi.fn();
const unauthorized: AxiosAdapter = (config) =>
  Promise.reject(
    new AxiosError("Unauthorized", AxiosError.ERR_BAD_REQUEST, config, null, {
      data: {},
      status: 401,
      statusText: "",
      headers: {},
      config,
    }),
  );

const originalAdapter = companyApi.defaults.adapter;
const realLocation = window.location;

beforeAll(() => {
  companyApi.defaults.adapter = unauthorized;
});
afterAll(() => {
  companyApi.defaults.adapter = originalAdapter;
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  resetPushDeviceRequests();
  window.localStorage.clear();
  window.sessionStorage.clear();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { href: "https://www.rothern.com/tr/company", pathname: "/tr/company" },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useCompanyAuthStore.setState({ user: null, company: null, permissionsSynced: false } as never);
  Object.defineProperty(window, "location", { configurable: true, writable: true, value: realLocation });
});

const signIn = () =>
  useCompanyAuthStore.setState({ user: { id: "u1" } as never, company: { id: "c1" } as never } as never);

const getMe = () => companyApi.get("/company-auth/me").catch(() => undefined);

describe("companyApi 401 — mobil kabuk anlık bildirim belirteci", () => {
  it("oturum düşünce belirteç sunucudan keepalive ile bırakılır, yönlendirmeden önce bekleyene taşınır", async () => {
    signIn();
    window.localStorage.setItem(PUSH_TOKEN_KEY, "fcm-token-1");
    window.sessionStorage.setItem(PUSH_SESSION_KEY, "u1");
    let answer!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));

    await getMe();

    expect(useCompanyAuthStore.getState().user).toBeNull();
    expect(window.location.href).toContain("/company/login");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(UNREGISTER_URL);
    expect(init).toMatchObject({ method: "POST", keepalive: true });
    expect(JSON.parse(init.body)).toEqual({ token: "fcm-token-1" });
    // Yanıt gelmeden sayfa değişirse sonraki yükleme yeniden dener.
    expect(window.localStorage.getItem(PUSH_TOKEN_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(PUSH_SESSION_KEY)).toBeNull();
    expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBe("fcm-token-1");

    answer(new Response("{}", { status: 200 }));
    await vi.waitFor(() => expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBeNull());
  });

  it("aynı anda düşen birkaç istek tek silme gönderir", async () => {
    signIn();
    window.localStorage.setItem(PUSH_TOKEN_KEY, "fcm-token-1");
    await Promise.all([getMe(), getMe(), getMe()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("belirteç yoksa (tarayıcı) silme isteği atılmaz", async () => {
    signIn();
    await getMe();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("anlık görüntü yokken (oturumu açık bırak kapalı, soğuk açılış) 401 saklı belirteci yine bırakır", async () => {
    window.localStorage.setItem(PUSH_TOKEN_KEY, "fcm-token-1");
    window.sessionStorage.setItem(PUSH_SESSION_KEY, "u1");
    await getMe();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: "fcm-token-1" });
    expect(window.localStorage.getItem(PUSH_TOKEN_KEY)).toBeNull();
    // Sonraki girişte kaydedici yeniden kaydolsun.
    expect(window.sessionStorage.getItem(PUSH_SESSION_KEY)).toBeNull();
    // Kullanıcı yokken yönlendirme yapılmaz (giriş sayfasındaki yanlış şifre gibi).
    expect(window.location.href).toBe("https://www.rothern.com/tr/company");
  });
});
