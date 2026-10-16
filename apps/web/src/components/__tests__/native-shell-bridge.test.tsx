// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUSH_UNREGISTER_PENDING_KEY, resetPushDeviceRequests } from "@/lib/native-push";
import { registerLeaveCheck } from "@/lib/leave-guard";
import { NativeShellBridge } from "../native-shell-bridge";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: router.push, replace: vi.fn(), prefetch: vi.fn() }),
}));

const HERE = "https://www.rothern.com/tr/company";

type Listener = (data: unknown) => void;

/** Gerçek kabuktaki gibi `addListener` tutamacı DOĞRUDAN (söz değil) döner. */
function installShell({
  withPush = true,
  launchUrl,
  browser,
}: { withPush?: boolean; launchUrl?: string; browser?: { open: (o: { url: string }) => unknown } } = {}) {
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
    Plugins: { App, ...(withPush ? { PushNotifications } : {}), ...(browser ? { Browser: browser } : {}) },
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
  router.push.mockReset();
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

/** Gövdeye yeni sekme bağlantısı ekler (React dışı — kart içi bağlantının DOM'u). */
function addLink(href: string, attrs: Record<string, string> = { target: "_blank", rel: "noopener noreferrer" }) {
  const a = document.createElement("a");
  a.setAttribute("href", href);
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  a.textContent = "Bağlantı";
  document.body.appendChild(a);
  return a;
}

/** Tıklar; varsayılan davranışın engellenip engellenmediğini döner. */
function clickLink(el: Element, init: MouseEventInit = {}) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  el.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("NativeShellBridge — kabukta yeni sekme bağlantısı aynı pencerede (mobil denetim g05)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("aynı kökendeki _blank bağlantı istemci yönlendiricisiyle, ham yolla açılır", async () => {
    installShell();
    render(<NativeShellBridge />);
    await settle();
    expect(document.documentElement.hasAttribute("data-native-shell")).toBe(true);
    const link = addLink("/tr/company/urun/acme/boru?x=1#bilgi-iste");
    expect(clickLink(link)).toBe(true);
    await settle();
    expect(router.push).toHaveBeenCalledWith("/tr/company/urun/acme/boru?x=1#bilgi-iste");
    expect(assign).not.toHaveBeenCalled();
  });

  it("bağlantının kendi stopPropagation'ı (kart içi 'Bilgi iste') yakalamayı kesmez", async () => {
    installShell();
    render(<NativeShellBridge />);
    await settle();
    const link = addLink("/urunler");
    link.addEventListener("click", (e) => e.stopPropagation());
    expect(clickLink(link)).toBe(true);
    await settle();
    expect(router.push).toHaveBeenCalledWith("/urunler");
  });

  it("dış köken, değiştirici tuş ve dosya adresi dokunulmadan geçer", async () => {
    installShell();
    render(<NativeShellBridge />);
    await settle();
    expect(clickLink(addLink("https://example.com/x"))).toBe(false);
    expect(clickLink(addLink("/urunler"), { metaKey: true })).toBe(false);
    expect(clickLink(addLink("/sitemap.xml"))).toBe(false);
    await settle();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("tarayıcıda hiçbir bağlantıya dokunmaz", async () => {
    render(<NativeShellBridge />);
    await settle();
    expect(document.documentElement.hasAttribute("data-native-shell")).toBe(false);
    expect(clickLink(addLink("/urunler"))).toBe(false);
    await settle();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("kullanıcı aracısındaki RothernApp/ eki yeterli (köprü henüz yokken)", async () => {
    const ua = vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone) RothernApp/1.0");
    try {
      render(<NativeShellBridge />);
      await settle();
      expect(clickLink(addLink("/firmalar"))).toBe(true);
      await settle();
      expect(router.push).toHaveBeenCalledWith("/firmalar");
    } finally {
      ua.mockRestore();
    }
  });

  it("kaydedilmemiş değişiklik: 'kal' denirse gezinilmez, 'ayrıl' denirse gezinilir", async () => {
    installShell();
    render(<NativeShellBridge />);
    await settle();
    const answer = vi.fn<() => boolean>().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const unregister = registerLeaveCheck(answer);
    try {
      expect(clickLink(addLink("/urunler"))).toBe(true);
      await settle();
      expect(router.push).not.toHaveBeenCalled();
      expect(clickLink(addLink("/firmalar"))).toBe(true);
      await settle();
      expect(router.push).toHaveBeenCalledWith("/firmalar");
      expect(answer).toHaveBeenCalledTimes(2);
    } finally {
      unregister();
    }
  });

  it("data-shell-browser (sözleşme belgesi) uygulama içi tarayıcıda açılır; eklenti yoksa dokunulmaz", async () => {
    const open = vi.fn(async () => undefined);
    installShell({ browser: { open } });
    const first = render(<NativeShellBridge />);
    await settle();
    const doc = addLink("/sozlesmeler/kvkk", { target: "_blank", "data-shell-browser": "" });
    expect(clickLink(doc)).toBe(true);
    await settle();
    expect(open).toHaveBeenCalledWith({ url: "https://www.rothern.com/sozlesmeler/kvkk" });
    expect(router.push).not.toHaveBeenCalled();
    first.unmount();

    installShell();
    render(<NativeShellBridge />);
    await settle();
    expect(clickLink(doc)).toBe(false);
    await settle();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("sökülünce dinleyici ve işaret kalkar", async () => {
    installShell();
    const { unmount } = render(<NativeShellBridge />);
    await settle();
    unmount();
    expect(document.documentElement.hasAttribute("data-native-shell")).toBe(false);
    expect(clickLink(addLink("/urunler"))).toBe(false);
    await settle();
    expect(router.push).not.toHaveBeenCalled();
  });
});

// Dosyanın SON bloğu: bekçi sökülmez (modül ömrü), yazılan pay sonraki testlere taşınırdı.
describe("NativeShellBridge — güvenli alan payı 404 kabuğunda korunur (smoke-public#new0)", () => {
  it("modül yüklenince kurulan bekçi, React'in <html> özniteliklerini silmesinden sonra payı geri yazar", async () => {
    const html = document.documentElement;
    // Kabuk (Capacitor SystemBars) payı yazar — bileşen henüz çizilmeden.
    html.style.setProperty("--safe-area-inset-top", "47px");
    await settle();
    // 404 kabuğu: React `<html>` tekilini devralırken bütün öznitelikleri siler.
    html.removeAttribute("style");
    await settle();
    expect(html.style.getPropertyValue("--safe-area-inset-top")).toBe("47px");
    // Bağlanma da (tekrar çağrı) ikinci kez yazmaz / bozmaz.
    render(<NativeShellBridge />);
    await settle();
    expect(html.style.getPropertyValue("--safe-area-inset-top")).toBe("47px");
  });
});
