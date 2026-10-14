// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUSH_UNREGISTER_PENDING_KEY, resetPushDeviceRequests } from "@/lib/native-push";
import { NativeShellBridge } from "../native-shell-bridge";

const HERE = "https://www.rothern.com/tr/company";

type Listener = (data: unknown) => void;

/** Gerçek kabuktaki gibi `addListener` tutamacı DOĞRUDAN (söz değil) döner. */
function installShell({ withPush = true, launchUrl }: { withPush?: boolean; launchUrl?: string } = {}) {
  const listeners = new Map<string, Set<Listener>>();
  const addListener = (event: string, cb: Listener) => {
    const set = listeners.get(event) ?? new Set<Listener>();
    set.add(cb);
    listeners.set(event, set);
    return { remove: vi.fn(() => void set.delete(cb)) };
  };
  const App = { addListener: vi.fn(addListener), getLaunchUrl: vi.fn(async () => ({ url: launchUrl })) };
  const PushNotifications = { addListener: vi.fn(addListener) };
  (window as unknown as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "android",
    Plugins: withPush ? { App, PushNotifications } : { App },
  };
  return {
    App,
    PushNotifications,
    emit: (event: string, data: unknown) => listeners.get(event)?.forEach((cb) => cb(data)),
    count: (event: string) => listeners.get(event)?.size ?? 0,
  };
}

const assign = vi.fn();
const realLocation = window.location;
const fetchMock = vi.fn();

beforeEach(() => {
  assign.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  resetPushDeviceRequests();
  window.sessionStorage.clear();
  window.localStorage.clear();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { href: HERE, assign },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  Object.defineProperty(window, "location", { configurable: true, writable: true, value: realLocation });
});

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

describe("NativeShellBridge", () => {
  it("tarayıcıda hiçbir şey yapmaz ve çizmez", async () => {
    const { container } = render(<NativeShellBridge />);
    await settle();
    expect(container).toBeEmptyDOMElement();
    expect(assign).not.toHaveBeenCalled();
  });

  it("bildirime dokununca aynı kökendeki data.url açılır", async () => {
    const shell = installShell();
    render(<NativeShellBridge />);
    await settle();
    const url = "https://www.rothern.com/tr/company/bildirimler";
    act(() =>
      shell.emit("pushNotificationActionPerformed", {
        actionId: "tap",
        notification: { data: { type: "BID_RECEIVED", url } },
      }),
    );
    expect(assign).toHaveBeenCalledWith(url);
  });

  it("yabancı köken, rota işleyicisi ya da url'siz bildirim açılmaz", async () => {
    const shell = installShell();
    render(<NativeShellBridge />);
    await settle();
    act(() => {
      shell.emit("pushNotificationActionPerformed", {
        notification: { data: { url: "https://evil.example/company" } },
      });
      shell.emit("pushNotificationActionPerformed", {
        notification: { data: { url: "https://www.rothern.com/api/email/unsubscribe" } },
      });
      shell.emit("pushNotificationActionPerformed", { notification: { data: { type: "X" } } });
      shell.emit("pushNotificationActionPerformed", {});
    });
    expect(assign).not.toHaveBeenCalled();
  });

  // Gerçek kabukta `addListener` söz döndürmez: eski `.then` zinciri burada
  // TypeError fırlatıp kök düzeni düşürürdü.
  it("devredilen bağlantı (appUrlOpen) eşzamanlı tutamaçla çalışır", async () => {
    const shell = installShell({ withPush: false });
    render(<NativeShellBridge />);
    await settle();
    act(() => shell.emit("appUrlOpen", { url: "https://www.rothern.com/tr/company/ilan/1" }));
    expect(assign).toHaveBeenCalledWith("https://www.rothern.com/tr/company/ilan/1");
  });

  it("açılış bağlantısı oturum başına bir kez açılır", async () => {
    installShell({ launchUrl: "https://www.rothern.com/tr/company/ilan/2" });
    const first = render(<NativeShellBridge />);
    await settle();
    expect(assign).toHaveBeenCalledTimes(1);
    first.unmount();
    render(<NativeShellBridge />);
    await settle();
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("sökülünce dinleyiciler kalkar", async () => {
    const shell = installShell();
    const { unmount } = render(<NativeShellBridge />);
    await settle();
    expect(shell.count("pushNotificationActionPerformed")).toBe(1);
    expect(shell.count("appUrlOpen")).toBe(1);
    unmount();
    expect(shell.count("pushNotificationActionPerformed")).toBe(0);
    expect(shell.count("appUrlOpen")).toBe(0);
  });

  // İnceleme bulgusu: çıkışta / oturum düşünce silinemeyen belirteç hiç yeniden
  // denenmiyordu; telefon giriş sayfasındayken önceki kişinin bildirimleri gelirdi.
  it("önceki çıkıştan kalan bekleyen silme yüklemede yeniden denenir; 2xx ile kalkar", async () => {
    window.localStorage.setItem(PUSH_UNREGISTER_PENDING_KEY, "fcm-token-1");
    installShell();
    render(<NativeShellBridge />);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:4000/api/company-auth/push-devices/unregister");
    expect(init).toMatchObject({ method: "POST", keepalive: true });
    expect(JSON.parse(init.body)).toEqual({ token: "fcm-token-1" });
    expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBeNull();
  });

  it("yeniden deneme başarısızsa bekleyen silme sonraki yükleme için kalır", async () => {
    window.localStorage.setItem(PUSH_UNREGISTER_PENDING_KEY, "fcm-token-1");
    fetchMock.mockResolvedValue(new Response("", { status: 503 }));
    installShell();
    render(<NativeShellBridge />);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBe("fcm-token-1");
  });

  it("bekleyen silme yoksa, bildirim eklentisi yoksa ya da tarayıcıdaysa istek atılmaz", async () => {
    installShell();
    const first = render(<NativeShellBridge />);
    await settle();
    first.unmount();
    window.localStorage.setItem(PUSH_UNREGISTER_PENDING_KEY, "fcm-token-1");
    installShell({ withPush: false });
    const second = render(<NativeShellBridge />);
    await settle();
    second.unmount();
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    render(<NativeShellBridge />);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
