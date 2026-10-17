// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { post: h.post } }));

import { PUSH_TOKEN_KEY, resetPushDeviceRequests } from "@/lib/native-push";
import { rebindStoredPushToken } from "../use-company-account";

/**
 * Şifre değişimi oturum sürümünü artırır; bu cihazın bildirim kaydı eski sürümde
 * kalırsa sunucu telefona göndermez. Değişimden sonra saklı belirteç taze
 * oturumla yeniden yazılır.
 */
const withShell = (platform: string) =>
  Object.defineProperty(window, "Capacitor", {
    configurable: true,
    value: {
      isNativePlatform: () => true,
      getPlatform: () => platform,
      Plugins: { PushNotifications: {} },
    },
  });

beforeEach(() => {
  h.post.mockReset();
  h.post.mockResolvedValue({ data: { ok: true } });
  resetPushDeviceRequests();
  window.localStorage.clear();
});
afterEach(() => {
  delete (window as { Capacitor?: unknown }).Capacitor;
});

describe("rebindStoredPushToken", () => {
  it("kabukta saklı belirteci platformuyla yeniden kaydeder", async () => {
    withShell("android");
    window.localStorage.setItem(PUSH_TOKEN_KEY, "fcm-token-1");
    await rebindStoredPushToken();
    expect(h.post).toHaveBeenCalledWith(
      "/company-auth/push-devices",
      { token: "fcm-token-1", platform: "android" },
      { skipErrorToast: true },
    );
  });

  it("tarayıcıda ya da belirteç yokken istek atmaz", async () => {
    window.localStorage.setItem(PUSH_TOKEN_KEY, "fcm-token-1");
    await rebindStoredPushToken();
    expect(h.post).not.toHaveBeenCalled();

    window.localStorage.clear();
    withShell("ios");
    await rebindStoredPushToken();
    expect(h.post).not.toHaveBeenCalled();
  });

  it("istek düşerse fırlatmaz", async () => {
    withShell("ios");
    window.localStorage.setItem(PUSH_TOKEN_KEY, "fcm-token-1");
    h.post.mockRejectedValueOnce(new Error("network"));
    await expect(rebindStoredPushToken()).resolves.toBeUndefined();
  });
});
