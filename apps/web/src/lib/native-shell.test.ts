import { describe, expect, it } from "vitest";
import { deepLinkTarget, nativeAppPlugin } from "./native-shell";

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
