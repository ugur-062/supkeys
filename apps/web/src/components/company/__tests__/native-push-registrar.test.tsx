// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTIFICATION_KEY } from "@/hooks/use-notifications";
import { markCompanyLoggingOut, resetCompanyLoggingOut } from "@/lib/company-auth/logout-flag";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import {
  PUSH_TOKEN_KEY,
  PUSH_UNREGISTER_PENDING_KEY,
  resetPushDeviceRequests,
  runPushDeviceRequest,
} from "@/lib/native-push";

const h = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { post: h.post, get: vi.fn() } }));

import { NativePushRegistrar } from "../native-push-registrar";

type Listener = (data: unknown) => void;

/**
 * Kabuğun enjekte ettiği köprünün sahtesi. Varsayılan `addListener` gerçek
 * kabuktaki gibi tutamacı DOĞRUDAN döner; `asyncHandles` çekirdek paket
 * biçimini (söz) dener.
 */
function installShell({
  platform = "android",
  permission = "granted",
  afterRequest = "granted",
  asyncHandles = false,
  native = true,
}: {
  platform?: string;
  permission?: string;
  afterRequest?: string;
  asyncHandles?: boolean;
  native?: boolean;
} = {}) {
  const listeners = new Map<string, Set<Listener>>();
  const calls: string[] = [];
  const plugin = {
    checkPermissions: vi.fn(async () => {
      calls.push("check");
      return { receive: permission };
    }),
    requestPermissions: vi.fn(async () => {
      calls.push("request");
      return { receive: afterRequest };
    }),
    createChannel: vi.fn(async () => {
      calls.push("channel");
    }),
    register: vi.fn(async () => {
      calls.push("register");
    }),
    addListener: vi.fn((event: string, cb: Listener) => {
      calls.push(`listen:${event}`);
      const set = listeners.get(event) ?? new Set<Listener>();
      set.add(cb);
      listeners.set(event, set);
      const handle = { remove: vi.fn(() => void set.delete(cb)) };
      return asyncHandles ? Promise.resolve(handle) : handle;
    }),
  };
  (window as unknown as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => native,
    getPlatform: () => platform,
    Plugins: { PushNotifications: plugin },
  };
  return {
    plugin,
    calls,
    emit: (event: string, data: unknown) => listeners.get(event)?.forEach((cb) => cb(data)),
    count: (event: string) => listeners.get(event)?.size ?? 0,
  };
}

function signIn(synced = true) {
  useCompanyAuthStore.setState({
    user: { id: "u1" } as never,
    company: { id: "c1" } as never,
    permissionsSynced: synced,
  } as never);
}

function renderRegistrar(qc = new QueryClient()) {
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <NativePushRegistrar />
      </QueryClientProvider>,
    ),
  };
}

/** Akışın birkaç mikro görevlik zincirini boşaltır. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  h.post.mockReset();
  h.post.mockResolvedValue({ data: { ok: true } });
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetCompanyLoggingOut();
  resetPushDeviceRequests();
  signIn();
});

afterEach(() => {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  useCompanyAuthStore.setState({ user: null, company: null, permissionsSynced: false } as never);
});

describe("NativePushRegistrar", () => {
  it("normal tarayıcıda hiçbir şey yapmaz ve hiçbir şey çizmez", async () => {
    const { container } = renderRegistrar();
    await settle();
    expect(container).toBeEmptyDOMElement();
    expect(h.post).not.toHaveBeenCalled();
  });

  it("köprü var ama yerel değilse eklentiye dokunmaz", async () => {
    const shell = installShell({ native: false });
    renderRegistrar();
    await settle();
    expect(shell.plugin.checkPermissions).not.toHaveBeenCalled();
    expect(shell.plugin.addListener).not.toHaveBeenCalled();
  });

  it("oturum eşitlenmeden (/me gelmeden) başlamaz", async () => {
    signIn(false);
    const shell = installShell();
    renderRegistrar();
    await settle();
    expect(shell.plugin.checkPermissions).not.toHaveBeenCalled();
  });

  it("izin reddedilmişse sormaz ve kayıt olmaz", async () => {
    const shell = installShell({ permission: "denied" });
    renderRegistrar();
    await waitFor(() => expect(shell.plugin.checkPermissions).toHaveBeenCalled());
    await settle();
    expect(shell.plugin.requestPermissions).not.toHaveBeenCalled();
    expect(shell.plugin.createChannel).not.toHaveBeenCalled();
    expect(shell.plugin.register).not.toHaveBeenCalled();
  });

  it("izin sorulmamışsa BİR kez sorar; reddedilirse kayıt olmaz", async () => {
    const shell = installShell({ permission: "prompt", afterRequest: "denied" });
    renderRegistrar();
    await waitFor(() => expect(shell.plugin.requestPermissions).toHaveBeenCalledTimes(1));
    await settle();
    expect(shell.plugin.register).not.toHaveBeenCalled();
  });

  it("Android, izin var: önce kanal, sonra kayıt; belirteç platformla yazılır ve saklanır", async () => {
    const shell = installShell({ platform: "android" });
    renderRegistrar();
    await waitFor(() => expect(shell.plugin.register).toHaveBeenCalled());
    expect(shell.calls.filter((c) => !c.startsWith("listen:"))).toEqual(["check", "channel", "register"]);
    // Belirteç olayı kaçmasın: dinleyici kayıttan önce kurulur.
    expect(shell.calls.indexOf("listen:registration")).toBeLessThan(shell.calls.indexOf("register"));
    expect(shell.plugin.createChannel).toHaveBeenCalledWith({
      id: "default",
      name: "Bildirimler",
      importance: 4,
      vibration: true,
    });

    act(() => shell.emit("registration", { value: "fcm-token-1" }));
    await waitFor(() =>
      expect(h.post).toHaveBeenCalledWith(
        "/company-auth/push-devices",
        { token: "fcm-token-1", platform: "android" },
        { skipErrorToast: true },
      ),
    );
    expect(window.localStorage.getItem(PUSH_TOKEN_KEY)).toBe("fcm-token-1");
  });

  it("iOS: izin sorulur, kanal kurulmaz, kayıt iOS platformuyla yazılır (söz dönen tutamaçla da)", async () => {
    const shell = installShell({ platform: "ios", permission: "prompt", asyncHandles: true });
    renderRegistrar();
    await waitFor(() => expect(shell.plugin.register).toHaveBeenCalled());
    expect(shell.plugin.requestPermissions).toHaveBeenCalledTimes(1);
    expect(shell.plugin.createChannel).not.toHaveBeenCalled();
    act(() => shell.emit("registration", { value: "apns-fcm" }));
    await waitFor(() =>
      expect(h.post).toHaveBeenCalledWith(
        "/company-auth/push-devices",
        { token: "apns-fcm", platform: "ios" },
        { skipErrorToast: true },
      ),
    );
  });

  it("kayıt hatası ve sunucu hatası görünmez, fırlatmaz", async () => {
    h.post.mockRejectedValue(new Error("network"));
    const shell = installShell();
    renderRegistrar();
    await waitFor(() => expect(shell.plugin.register).toHaveBeenCalled());
    act(() => shell.emit("registrationError", { error: "no play services" }));
    act(() => shell.emit("registration", { value: "tok" }));
    await settle();
    expect(h.post).toHaveBeenCalledTimes(1);
  });

  it("sunucu kaydı başarısızsa sonraki kurulum yeniden kaydolur", async () => {
    h.post.mockRejectedValueOnce(new Error("network"));
    const shell = installShell();
    const first = renderRegistrar();
    await waitFor(() => expect(shell.plugin.register).toHaveBeenCalledTimes(1));
    act(() => shell.emit("registration", { value: "tok" }));
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
    await settle();
    first.unmount();

    renderRegistrar();
    await waitFor(() => expect(shell.plugin.register).toHaveBeenCalledTimes(2));
    act(() => shell.emit("registration", { value: "tok" }));
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(2));
  });

  it("uygulama öndeyken gelen bildirim zil ve Bildirimler sorgularını tazeler", async () => {
    const shell = installShell();
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    renderRegistrar(qc);
    await waitFor(() => expect(shell.count("pushNotificationReceived")).toBe(1));
    act(() => shell.emit("pushNotificationReceived", { title: "x", body: "y", data: {} }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: NOTIFICATION_KEY });
  });

  it("uygulama açılışı başına bir kez: belirteç geldikten sonra yeniden kurulumda izin/kayıt tekrarlanmaz; sökülünce dinleyiciler kalkar", async () => {
    const shell = installShell();
    const first = renderRegistrar();
    await waitFor(() => expect(shell.plugin.register).toHaveBeenCalledTimes(1));
    act(() => shell.emit("registration", { value: "fcm-token-1" }));
    first.unmount();
    expect(shell.count("registration")).toBe(0);
    expect(shell.count("registrationError")).toBe(0);
    expect(shell.count("pushNotificationReceived")).toBe(0);

    renderRegistrar();
    await waitFor(() => expect(shell.count("registration")).toBe(1));
    await settle();
    expect(shell.plugin.checkPermissions).toHaveBeenCalledTimes(1);
    expect(shell.plugin.register).toHaveBeenCalledTimes(1);
  });

  it("akış yarıda sökülürse sonraki kurulumda yeniden koşar", async () => {
    const shell = installShell();
    let release!: () => void;
    shell.plugin.checkPermissions.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ receive: "granted" });
        }),
    );
    const first = renderRegistrar();
    await waitFor(() => expect(shell.plugin.checkPermissions).toHaveBeenCalledTimes(1));
    first.unmount();
    release();
    await settle();
    expect(shell.plugin.register).not.toHaveBeenCalled();

    renderRegistrar();
    await waitFor(() => expect(shell.plugin.register).toHaveBeenCalledTimes(1));
    expect(shell.plugin.checkPermissions).toHaveBeenCalledTimes(2);
  });

  // İnceleme bulgusu: `register()` hemen çözülür, belirteç sonra olayla gelir;
  // iOS olayı dinleyicisiz anda düşürür. Arada sökülen kurulum akışı "bitti"
  // sayıyordu ve o açılışta kayıt bir daha denenmiyordu.
  it("register() çözüldü ama belirteç gelmeden sökülürse sonraki kurulum yeniden kaydolur", async () => {
    const shell = installShell({ platform: "ios" });
    const first = renderRegistrar();
    await waitFor(() => expect(shell.plugin.register).toHaveBeenCalledTimes(1));
    await settle();
    first.unmount();

    renderRegistrar();
    await waitFor(() => expect(shell.plugin.register).toHaveBeenCalledTimes(2));
    act(() => shell.emit("registration", { value: "apns-fcm" }));
    await waitFor(() =>
      expect(h.post).toHaveBeenCalledWith(
        "/company-auth/push-devices",
        { token: "apns-fcm", platform: "ios" },
        { skipErrorToast: true },
      ),
    );
  });

  it("kayıt hatası da akışı bitirir: yeniden kurulumda kayıt tekrarlanmaz", async () => {
    const shell = installShell();
    const first = renderRegistrar();
    await waitFor(() => expect(shell.plugin.register).toHaveBeenCalledTimes(1));
    act(() => shell.emit("registrationError", { error: "no play services" }));
    first.unmount();

    renderRegistrar();
    await waitFor(() => expect(shell.count("registration")).toBe(1));
    await settle();
    expect(shell.plugin.register).toHaveBeenCalledTimes(1);
  });

  // İnceleme bulgusu: çıkış beklerken gelen belirteç saklanıp oturum hâlâ
  // geçerliyken kaydediliyordu → satır çıkıştan sonra kişiye bağlı kalıyordu.
  it("çıkış sürerken gelen belirteç saklanmaz ve sunucuya yazılmaz", async () => {
    const shell = installShell();
    renderRegistrar();
    await waitFor(() => expect(shell.plugin.register).toHaveBeenCalled());
    markCompanyLoggingOut();
    act(() => shell.emit("registration", { value: "fcm-token-1" }));
    await settle();
    expect(h.post).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(PUSH_TOKEN_KEY)).toBeNull();
  });

  it("kayıt isteği sürmekte olan silmenin ardından gider", async () => {
    const shell = installShell();
    let finishUnregister!: () => void;
    void runPushDeviceRequest(() => new Promise<void>((resolve) => (finishUnregister = resolve)));
    renderRegistrar();
    await waitFor(() => expect(shell.plugin.register).toHaveBeenCalled());
    act(() => shell.emit("registration", { value: "fcm-token-1" }));
    await settle();
    expect(h.post).not.toHaveBeenCalled();
    await act(async () => {
      finishUnregister();
    });
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
  });

  it("kayıt başarısı aynı belirtecin önceki çıkıştan kalan bekleyen silmesini kaldırır", async () => {
    window.localStorage.setItem(PUSH_UNREGISTER_PENDING_KEY, "fcm-token-1");
    const shell = installShell();
    renderRegistrar();
    await waitFor(() => expect(shell.plugin.register).toHaveBeenCalled());
    act(() => shell.emit("registration", { value: "fcm-token-1" }));
    await waitFor(() => expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBeNull());
  });

  it("kayıt başarısızsa ya da belirteç farklıysa bekleyen silme kalır", async () => {
    window.localStorage.setItem(PUSH_UNREGISTER_PENDING_KEY, "old-token");
    const shell = installShell();
    renderRegistrar();
    await waitFor(() => expect(shell.plugin.register).toHaveBeenCalled());
    act(() => shell.emit("registration", { value: "fcm-token-1" }));
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
    await settle();
    expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBe("old-token");

    window.localStorage.setItem(PUSH_UNREGISTER_PENDING_KEY, "fcm-token-1");
    h.post.mockRejectedValueOnce(new Error("network"));
    act(() => shell.emit("registration", { value: "fcm-token-1" }));
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(2));
    await settle();
    expect(window.localStorage.getItem(PUSH_UNREGISTER_PENDING_KEY)).toBe("fcm-token-1");
  });
});
