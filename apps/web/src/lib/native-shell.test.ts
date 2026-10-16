import { describe, expect, it, vi } from "vitest";
import {
  deepLinkTarget,
  isNativeShell,
  nativeAppPlugin,
  nativeBrowserPlugin,
  nativeListener,
  shellLinkAction,
} from "./native-shell";

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

/** Sahte bağlantı: `closest("a[href]")` kendisini döner. */
function anchor(attrs: Record<string, string>) {
  const el = {
    getAttribute: (name: string) => (name in attrs ? attrs[name] : null),
    hasAttribute: (name: string) => name in attrs,
    closest: (selector: string) => (selector === "a[href]" && "href" in attrs ? el : null),
  };
  return el;
}

const click = (target: unknown, extra: Partial<Record<string, unknown>> = {}) => ({
  defaultPrevented: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  target: target as EventTarget,
  ...extra,
});

describe("isNativeShell — kabuğu tanıma", () => {
  it("köprü yerelse ya da kullanıcı aracısında RothernApp/ eki varsa kabuk", () => {
    expect(isNativeShell({ Capacitor: { isNativePlatform: () => true } })).toBe(true);
    expect(isNativeShell({ navigator: { userAgent: "Mozilla/5.0 (iPhone) RothernApp/1.0" } })).toBe(true);
  });

  it("tarayıcıda kabuk değil; köprü fırlatırsa da değil", () => {
    expect(isNativeShell(undefined)).toBe(false);
    expect(isNativeShell({ navigator: { userAgent: "Mozilla/5.0 Safari" } })).toBe(false);
    expect(isNativeShell({ Capacitor: { isNativePlatform: () => false } })).toBe(false);
    expect(
      isNativeShell({
        Capacitor: {
          isNativePlatform: () => {
            throw new Error("x");
          },
        },
      }),
    ).toBe(false);
  });

  it("Browser eklentisi yalnız kabukta ve open işlevi varsa döner", () => {
    const Browser = { open: () => undefined };
    expect(nativeBrowserPlugin({ Capacitor: { isNativePlatform: () => true, Plugins: { Browser } } })).toBe(Browser);
    expect(nativeBrowserPlugin({ Capacitor: { isNativePlatform: () => false, Plugins: { Browser } } })).toBeNull();
    expect(nativeBrowserPlugin({ Capacitor: { isNativePlatform: () => true, Plugins: {} } })).toBeNull();
    expect(nativeBrowserPlugin(undefined)).toBeNull();
  });
});

describe("shellLinkAction — kabukta yeni sekme bağlantısı (mobil denetim g05)", () => {
  const PAGE = "https://www.rothern.com/en/company/purchasing/products";

  it("aynı kökendeki _blank sayfa bağlantısı aynı pencerede; ham yol + sorgu + çapa (ön ek yeniden eklenmez)", () => {
    const a = anchor({ href: "/en/company/product/acme/pipe?x=1#inquiry", target: "_blank", rel: "noopener noreferrer" });
    expect(shellLinkAction(click(a), PAGE)).toEqual({
      kind: "same-window",
      href: "https://www.rothern.com/en/company/product/acme/pipe?x=1#inquiry",
      path: "/en/company/product/acme/pipe?x=1#inquiry",
    });
    // Mutlak aynı köken adresi ve büyük harfli hedef de.
    const abs = anchor({ href: "https://www.rothern.com/firmalar", target: "_BLANK" });
    expect(shellLinkAction(click(abs), PAGE)).toMatchObject({ kind: "same-window", path: "/firmalar" });
  });

  it("bağlantının içindeki öğeye dokunuş da bağlantıyı bulur", () => {
    const a = anchor({ href: "/urunler", target: "_blank" });
    const icon = { closest: (s: string) => (s === "a[href]" ? a : null) };
    expect(shellLinkAction(click(icon), PAGE)).toMatchObject({ kind: "same-window", path: "/urunler" });
  });

  it("dış köken, aynı pencere hedefi, indirme ve http(s) dışı adres dokunulmadan geçer", () => {
    expect(shellLinkAction(click(anchor({ href: "https://example.com/x", target: "_blank" })), PAGE)).toBeNull();
    expect(shellLinkAction(click(anchor({ href: "https://cdn.rothern.com/a.pdf", target: "_blank" })), PAGE)).toBeNull();
    expect(shellLinkAction(click(anchor({ href: "/urunler" })), PAGE)).toBeNull();
    expect(shellLinkAction(click(anchor({ href: "/urunler", target: "_self" })), PAGE)).toBeNull();
    expect(shellLinkAction(click(anchor({ href: "/urunler", target: "_blank", download: "" })), PAGE)).toBeNull();
    expect(shellLinkAction(click(anchor({ href: "mailto:a@b.com", target: "_blank" })), PAGE)).toBeNull();
    expect(shellLinkAction(click({ closest: () => null }), PAGE)).toBeNull();
    expect(shellLinkAction(click(null), PAGE)).toBeNull();
  });

  it("rota işleyicisi, Next varlığı ve dosya adresi sayfa değildir — dokunulmaz", () => {
    for (const href of ["/api/email/unsubscribe?t=x", "/_next/static/a.js", "/sitemap.xml", "/llms.txt", "/.well-known/assetlinks.json", "/rothern-logo.png"]) {
      expect(shellLinkAction(click(anchor({ href, target: "_blank" })), PAGE)).toBeNull();
    }
  });

  it("değiştirici tuş, orta / sağ tuş ve başka dinleyicinin işlediği tıklama dokunulmaz", () => {
    const a = anchor({ href: "/urunler", target: "_blank" });
    for (const extra of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
      expect(shellLinkAction(click(a, extra), PAGE)).toBeNull();
    }
  });

  it("data-shell-browser işaretli bağlantı uygulama içi tarayıcıya", () => {
    const a = anchor({ href: "/sozlesmeler/kvkk", target: "_blank", "data-shell-browser": "" });
    expect(shellLinkAction(click(a), PAGE)).toEqual({
      kind: "in-app-browser",
      href: "https://www.rothern.com/sozlesmeler/kvkk",
    });
  });
});
