import { describe, expect, it, vi } from "vitest";
import { deepLinkTarget, nativeAppPlugin, nativeListener } from "./native-shell";

const HERE = "https://www.rothern.com/company";

describe("mobil kabuk köprüsü", () => {
  it("tarayıcıda (köprü yok ya da yerel değil) eklenti dönmez", () => {
    expect(nativeAppPlugin(undefined)).toBeNull();
    expect(nativeAppPlugin({})).toBeNull();
    expect(nativeAppPlugin({ Capacitor: { isNativePlatform: () => false, Plugins: { App: {} } } })).toBeNull();
  });

  it("kabukta App eklentisini döner", () => {
    const App = {};
    expect(nativeAppPlugin({ Capacitor: { isNativePlatform: () => true, Plugins: { App } } })).toBe(App);
  });

  it("aynı kökendeki sayfa bağlantısı açılır (dil ön eki ve sorgu korunur)", () => {
    const url = "https://www.rothern.com/en/company/kayit?ref=abc&redirect=/company/ilan/1";
    expect(deepLinkTarget(url, HERE)).toBe(url);
  });

  it("başka köken, rota işleyicisi, bozuk ve zaten açık adres açılmaz", () => {
    expect(deepLinkTarget("https://staging.supkeys.com/company", HERE)).toBeNull();
    expect(deepLinkTarget("https://www.rothern.com/api/email/unsubscribe?t=x", HERE)).toBeNull();
    expect(deepLinkTarget("com.rothern.app://x", HERE)).toBeNull();
    expect(deepLinkTarget("bozuk", HERE)).toBeNull();
    expect(deepLinkTarget(undefined, HERE)).toBeNull();
    expect(deepLinkTarget(HERE, HERE)).toBeNull();
  });
});

describe("nativeListener — yerel dinleyici tutamacı", () => {
  // Sayfa `@capacitor/core` taşımaz: kabuğun enjekte ettiği eski biçimde
  // `addListener` tutamacı SÖZ DEĞİL, doğrudan döner (native-bridge.js).
  it("eşzamanlı dönen tutamaç kabul edilir ve kaldırılır", async () => {
    const remove = vi.fn();
    const listener = nativeListener(() => ({ remove }));
    await listener.ready;
    listener.remove();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("söz dönen tutamaç kabul edilir; söz gelmeden kaldırılırsa geldiğinde kaldırılır", async () => {
    const remove = vi.fn();
    let resolve!: (h: { remove: () => void }) => void;
    const listener = nativeListener(() => new Promise((r) => (resolve = r)));
    listener.remove();
    expect(remove).not.toHaveBeenCalled();
    resolve({ remove });
    await listener.ready;
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("fırlatan ya da reddeden kurulum fırlatmaz; ready yine çözülür", async () => {
    const thrown = nativeListener(() => {
      throw new Error("bridge");
    });
    await expect(thrown.ready).resolves.toBeUndefined();
    expect(() => thrown.remove()).not.toThrow();
    const rejected = nativeListener(() => Promise.reject(new Error("bridge")));
    await expect(rejected.ready).resolves.toBeUndefined();
    const failingRemove = nativeListener(() => ({
      remove: () => {
        throw new Error("gone");
      },
    }));
    await failingRemove.ready;
    expect(() => failingRemove.remove()).not.toThrow();
  });
});
