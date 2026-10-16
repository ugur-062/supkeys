// @vitest-environment jsdom
/**
 * BİLGİ TALEPLERİ — telefon davranışı (mobil denetim g05/g08):
 *  - açık konuşma adreste (`?talep=`): tek panelde açılış Geri'ye kayıt bırakır,
 *    ekrandaki geri oku o kaydı geri alır, sistem Geri'si konuşmayı kapatır;
 *  - "Yanıt bekleyen" süzgecinde yanıt gönderilince konuşma yerinde kalır,
 *    panel habersiz başka alıcının konuşmasına GEÇMEZ;
 *  - dokunmatikte Ctrl+Enter kısayolu ve ipucu yok;
 *  - geri okunun dokunma alanı 44 px.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { cloneElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: () => true,
  useCompanyAuth: () => ({ user: null, company: null }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get, post: h.post } }));
// Adres çubuğu gerçek kaynak: Next `pushState`/`replaceState`i `useSearchParams`e yansıtır.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => "/company/satis/bilgi-talepleri",
}));

import { INQUIRY_THREAD_STATE_KEY, InquiriesView } from "../inquiries-view";
import { PanelInquiryDialog } from "../panel-inquiry-dialog";

const BASE = "/company/satis/bilgi-talepleri";
const now = new Date().toISOString();
const inquiry = (id: string, name: string, message: string, replies: unknown[] = []) => ({
  id,
  name,
  companyName: null,
  message,
  quantity: null,
  receivedAt: now,
  hasAccount: true,
  product: { id: `p-${id}`, name: "Dağıtım Panosu", slug: "pano" },
  replies,
});
const R1 = inquiry("r1", "Ayşe Demir", "Stok var mı?");
const R2 = inquiry("r2", "Mehmet Kaya", "Fiyat bilgisi?");
const page = (items: unknown[]) => ({
  data: {
    items,
    total: items.length,
    openCount: items.filter((i) => (i as { replies: unknown[] }).replies.length === 0).length,
  },
});

const originalMatchMedia = window.matchMedia;
function setCoarse(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === "(pointer: coarse)" ? coarse : false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  return {
    ...view,
    // Yeni öğe nesnesi: aynı öğe verilirse React çizimi atlar (Next'te adres
    // değişimini `useSearchParams` bağlamı tetikler).
    rerender: () => view.rerender(<QueryClientProvider client={qc}>{cloneElement(ui)}</QueryClientProvider>),
  };
}

/** Liste sütunu (telefonda konuşma açıkken gizlenir). */
const listColumn = () => screen.getByRole("list", { name: "Bilgi talepleri" }).parentElement!;

const scrollTo = vi.fn();
beforeEach(() => {
  window.history.replaceState(null, "", BASE);
  h.get.mockReset().mockResolvedValue(page([R1, R2]));
  h.post.mockReset();
  setCoarse(false);
  scrollTo.mockReset();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
});
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

describe("InquiriesView — açık konuşma adreste (Android Geri)", () => {
  it("tek panelde açılış ?talep= ile Geri'ye kayıt bırakır; ekrandaki geri oku kaydı geri alır", async () => {
    const push = vi.spyOn(window.history, "pushState");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    wrap(<InquiriesView portal="satis" />);
    fireEvent.click(await screen.findByRole("button", { name: /Mehmet Kaya/ }));

    expect(push).toHaveBeenCalledTimes(1);
    // Kayıt işaretli: Geri/İleri sonrası da geri oku onu tanır.
    expect(push.mock.calls[0]![0]).toEqual({ [INQUIRY_THREAD_STATE_KEY]: true });
    expect(new URLSearchParams(window.location.search).get("talep")).toBe("r2");
    expect(listColumn().className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(screen.getByText("Fiyat bilgisi?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Listeye dön" }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(listColumn().className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it("yan yana düzende (lg+) adres yerinde yazılır, geçmiş şişmez", async () => {
    window.matchMedia = ((query: string) => ({
      matches: query === "(min-width: 64rem)",
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    const push = vi.spyOn(window.history, "pushState");
    wrap(<InquiriesView portal="satis" />);
    fireEvent.click(await screen.findByRole("button", { name: /Mehmet Kaya/ }));
    expect(push).not.toHaveBeenCalled();
    expect(new URLSearchParams(window.location.search).get("talep")).toBe("r2");
  });

  it("sistem Geri'si (adresten ?talep= düşer) konuşmayı kapatır, listeye döner", async () => {
    const view = wrap(<InquiriesView portal="satis" />);
    fireEvent.click(await screen.findByRole("button", { name: /Mehmet Kaya/ }));
    expect(listColumn().className).toMatch(/(^|\s)hidden(\s|$)/);

    act(() => window.history.replaceState(null, "", BASE));
    view.rerender();
    await waitFor(() => expect(listColumn().className).not.toMatch(/(^|\s)hidden(\s|$)/));
  });

  // Mobil denetim g05 (yeniden doğrulama): Geri ile listeye dönüp İleri ile
  // konuşmaya gelince ref sıfırlanmıştı; geri oku `replaceState` yazıyor, iki
  // liste kaydı yan yana kalıyor, sistem Geri'si iki kez basılmak zorundaydı.
  it("İleri ile dönülen (işaretli) konuşma kaydında geri oku history.back() kullanır", async () => {
    window.history.replaceState({ [INQUIRY_THREAD_STATE_KEY]: true }, "", `${BASE}?talep=r2`);
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const replace = vi.spyOn(window.history, "replaceState");
    wrap(<InquiriesView portal="satis" />);
    expect(await screen.findByText("Fiyat bilgisi?")).toBeInTheDocument();
    replace.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Listeye dön" }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("işaretsiz kayıt (derin bağlantı): geri oku adresi yerinde temizler, Geri'ye dokunmaz", async () => {
    window.history.replaceState(null, "", `${BASE}?talep=r2`);
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    wrap(<InquiriesView portal="satis" />);
    expect(await screen.findByText("Fiyat bilgisi?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Listeye dön" }));
    expect(back).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    expect(listColumn().className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  // Mobil denetim g05: sistem Geri'sinde tarayıcı konumu liste gizliyken geri
  // yüklüyor, kısa sayfada ~185 px'e kırpılıyordu (dokunulan satır ekran dışı).
  it("sistem Geri'si listeyi açılıştaki kaydırma konumuna döndürür", async () => {
    const view = wrap(<InquiriesView portal="satis" />);
    const row = await screen.findByRole("button", { name: /Mehmet Kaya/ });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 1309 });
    try {
      fireEvent.click(row);
      expect(listColumn().className).toMatch(/(^|\s)hidden(\s|$)/);
      // Konuşma açıkken sayfa kısa: tarayıcının kırptığı konum.
      Object.defineProperty(window, "scrollY", { configurable: true, value: 185 });
      act(() => window.history.replaceState(null, "", BASE));
      view.rerender();
      await waitFor(() => expect(listColumn().className).not.toMatch(/(^|\s)hidden(\s|$)/));
      expect(scrollTo).toHaveBeenLastCalledWith(0, 1309);
    } finally {
      Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    }
  });

  it("süzgeç değişince eski liste konumuna dönülmez", async () => {
    h.get.mockResolvedValue(page([R1, { ...R2, replies: [{ id: "x", body: "Var", createdAt: now }] }]));
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    wrap(<InquiriesView portal="satis" />);
    const row = await screen.findByRole("button", { name: /Ayşe Demir/ });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 900 });
    try {
      fireEvent.click(row);
      fireEvent.click(screen.getByRole("button", { name: /Yanıtlanan/ }));
      await waitFor(() => expect(listColumn().className).not.toMatch(/(^|\s)hidden(\s|$)/));
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    }
  });

  it("derin bağlantı ?talep=r2 konuşmayı açık getirir", async () => {
    window.history.replaceState(null, "", `${BASE}?talep=r2`);
    wrap(<InquiriesView portal="satis" />);
    expect(await screen.findByText("Fiyat bilgisi?")).toBeInTheDocument();
    expect(screen.queryByText("Stok var mı?")).not.toBeInTheDocument();
    expect(listColumn().className).toMatch(/(^|\s)hidden(\s|$)/);
  });

  it("geri okunun dokunma alanı 44 px (p-3 + -m-3, ok aynı yerde)", async () => {
    wrap(<InquiriesView portal="satis" />);
    fireEvent.click(await screen.findByRole("button", { name: /Mehmet Kaya/ }));
    const cls = screen.getByRole("button", { name: "Listeye dön" }).className;
    expect(cls).toMatch(/(^|\s)p-3(\s|$)/);
    expect(cls).toMatch(/(^|\s)-m-3(\s|$)/);
  });
});

describe("InquiriesView — yanıttan sonra konuşma yerinde kalır (g08)", () => {
  it("'Yanıt bekleyen'de yanıt gönderilince panel başka alıcıya GEÇMEZ; gönderilen yanıt görünür", async () => {
    const reply = { id: "rep1", body: "Evet, stokta var.", createdAt: now };
    h.post.mockResolvedValue({ data: reply });
    wrap(<InquiriesView portal="satis" />);
    fireEvent.click(await screen.findByRole("button", { name: /Yanıt bekleyen/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ayşe Demir/ }));
    expect(screen.getByText("Stok var mı?")).toBeInTheDocument();

    // Sunucu artık r1'i yanıtlanmış döndürür.
    h.get.mockResolvedValue(page([{ ...R1, replies: [reply] }, R2]));
    fireEvent.change(screen.getByPlaceholderText("Yanıtınızı yazın…"), { target: { value: "Evet, stokta var." } });
    fireEvent.click(screen.getByRole("button", { name: "Yanıtla" }));

    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
    // Yenilenen liste geldi (yanıt balonu göründü) — konuşma hâlâ r1.
    expect(await screen.findByText("Evet, stokta var.")).toBeInTheDocument();
    expect(screen.getByText("Stok var mı?")).toBeInTheDocument();
    expect(screen.queryByText("Fiyat bilgisi?")).not.toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("talep")).toBe("r1");
  });

  it("süzgeç değişince açık konuşma düşerse başka konuşmaya geçilmez, listeye dönülür", async () => {
    h.get.mockResolvedValue(page([R1, { ...R2, replies: [{ id: "x", body: "Var", createdAt: now }] }]));
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    wrap(<InquiriesView portal="satis" />);
    fireEvent.click(await screen.findByRole("button", { name: /Ayşe Demir/ }));
    expect(listColumn().className).toMatch(/(^|\s)hidden(\s|$)/);
    // Açık konuşma (yanıtsız) "Yanıtlanan" süzgecinde yok.
    fireEvent.click(screen.getByRole("button", { name: /Yanıtlanan/ }));
    await waitFor(() => expect(listColumn().className).not.toMatch(/(^|\s)hidden(\s|$)/));
    expect(window.history.back).toHaveBeenCalledTimes(1);
  });
});

describe("InquiriesView — dokunmatikte kısayol yok (g08)", () => {
  it("dokunmatik: ipucu 'Ctrl+Enter' içermez, Ctrl+Enter göndermez", async () => {
    setCoarse(true);
    wrap(<InquiriesView portal="satis" />);
    fireEvent.click(await screen.findByRole("button", { name: /Ayşe Demir/ }));
    expect(screen.getByText("Yanıtınız alıcının panelinde görünür.")).toBeInTheDocument();
    expect(screen.queryByText(/Ctrl\+Enter/)).not.toBeInTheDocument();
    const box = screen.getByPlaceholderText("Yanıtınızı yazın…");
    expect(box).toHaveAttribute("enterkeyhint", "enter");
    fireEvent.change(box, { target: { value: "Merhaba, stok var." } });
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    expect(h.post).not.toHaveBeenCalled();
  });

  it("masaüstü: ipucu kısayolu söyler, Ctrl+Enter gönderir", async () => {
    h.post.mockResolvedValue({ data: { id: "rep", body: "x", createdAt: now } });
    wrap(<InquiriesView portal="satis" />);
    fireEvent.click(await screen.findByRole("button", { name: /Ayşe Demir/ }));
    expect(screen.getByText(/Ctrl\+Enter ile gönder/)).toBeInTheDocument();
    const box = screen.getByPlaceholderText("Yanıtınızı yazın…");
    fireEvent.change(box, { target: { value: "Merhaba, stok var." } });
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
  });
});

/**
 * Mobil denetim g05: "Bilgi iste" kutusu ortalanmış ve kaydırılamıyordu —
 * ekran klavyesi açılınca başlık ve Kapat ekranın üstünde kalıyordu. Panel
 * görünür yüksekliğe (`dvh`) sığar; gövde kendi içinde kayar; hata satırı ve
 * "Talebi gönder" gövdenin altında yapışkan şeritte. r3-comm#new1: ikinci
 * eylem ("talebime ekle") ve notu şeritte DEĞİL, gövdeyle kayar — klavye +
 * hata ile sabit şerit ekranın yarısından çoğunu alıyordu.
 */
describe("PanelInquiryDialog — telefonda kaydırılır, eylem ve hata görünür", () => {
  const seed = { productName: "Pano", unit: "adet", categoryId: "39121600", keywords: [], companyName: "İkinci Firma" };
  const open = () =>
    wrap(
      <PanelInquiryDialog
        open
        onClose={() => undefined}
        companySlug="ikinci-firma"
        productSlug="pano"
        productName="Pano"
        companyName="İkinci Firma"
        seed={seed}
      />,
    );

  it("panel dvh ile sınırlı; gövde kayar; gönder düğmesi gövdenin altında yapışkan şeritte", () => {
    open();
    const title = screen.getByText("Bilgi / teklif iste");
    const panel = title.closest("[id^='headlessui-dialog-panel']") as HTMLElement;
    // Üst güvenli pay (mobil kabuk) da düşülür; pay 0 iken 100dvh − 1rem.
    expect(panel.className).toMatch(/max-h-\[calc\(100dvh-1rem-var\(--safe-top\)\)\]/);
    expect(panel.className).toMatch(/(^|\s)flex-col(\s|$)/);

    const message = screen.getByLabelText(/Mesajınız/);
    const body = message.closest(".overflow-y-auto") as HTMLElement;
    expect(body).not.toBeNull();
    const submit = screen.getByRole("button", { name: "Talebi gönder" });
    const strip = submit.parentElement as HTMLElement;
    expect(body.contains(strip)).toBe(true);
    expect(strip.className).toMatch(/(^|\s)sticky(\s|$)/);
    expect(strip.className).toMatch(/(^|\s)bottom-0(\s|$)/);
    expect(strip.className).toMatch(/(^|\s)bg-white(\s|$)/);
    // Alt güvenli pay formda: kayan gövde ana ekran çizgisinin üstünde biter.
    expect((body.parentElement as HTMLElement).className).toMatch(/max-sm:pb-\(--safe-bottom\)/);
    // Kapat: görünüm aynı, dokunma alanı görünmez katmanla 44 px.
    const close = screen.getByRole("button", { name: "Kapat" });
    expect(close.className).toMatch(/after:-inset-2/);
  });

  it("ikinci eylem ve notu yapışkan şeritte değil, gövdeyle kayar; sıra alanlar → gönder → ikinci eylem", () => {
    open();
    const message = screen.getByLabelText(/Mesajınız/);
    const body = message.closest(".overflow-y-auto") as HTMLElement;
    const submit = screen.getByRole("button", { name: "Talebi gönder" });
    const strip = submit.parentElement as HTMLElement;
    const toTender = screen.getByRole("button", { name: "Bu ürünü satın alma talebime ekle" });
    const note = screen.getByText(/Bilgi talebi tek firmaya gider/);
    for (const el of [toTender, note]) {
      expect(body.contains(el)).toBe(true);
      expect(strip.contains(el)).toBe(false);
      expect(el.closest(".sticky")).toBeNull();
    }
    // DOM sırası = görünen sıra (sekme sırası da aynı).
    expect(message.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(submit.compareDocumentPosition(toTender) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("şeridin yüksekliği gövdenin scroll-padding-bottom'u olur (hata satırıyla büyür)", async () => {
    const observers: { cb: ResizeObserverCallback; el?: Element }[] = [];
    class FakeRO {
      constructor(private cb: ResizeObserverCallback) {}
      observe(el: Element) {
        observers.push({ cb: this.cb, el });
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", FakeRO);
    try {
      open();
      const submit = screen.getByRole("button", { name: "Talebi gönder" });
      const strip = submit.parentElement as HTMLElement;
      const body = screen.getByLabelText(/Mesajınız/).closest(".overflow-y-auto") as HTMLElement;
      const entry = observers.find((o) => o.el === strip);
      expect(entry).toBeDefined();
      Object.defineProperty(strip, "offsetHeight", { configurable: true, value: 160 });
      act(() => entry!.cb([], {} as ResizeObserver));
      expect(body.style.scrollPaddingBottom).toBe("160px");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("odaklanan / yazılan alan ve klavye (pencere küçülür) → odaktaki alan şeridin üstüne kaydırılır", async () => {
    const scrollIntoView = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    try {
      open();
      const message = screen.getByLabelText(/Mesajınız/);
      message.focus();
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(message);
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" });

      scrollIntoView.mockClear();
      fireEvent.input(message, { target: { value: "Yeni satır\nikinci" } });
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));

      scrollIntoView.mockClear();
      window.dispatchEvent(new Event("resize"));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(message);

      // Odak gövdenin dışındaysa (Kapat) kaydırma yok.
      scrollIntoView.mockClear();
      screen.getByRole("button", { name: "Kapat" }).focus();
      window.dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 50));
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  // Mobil denetim g05: hata hem satırda hem küresel toast'ta çıkıyordu; klavye
  // açıkken toast kutunun başlığını ve Kapat'ını örtüyordu.
  it("gönderim küresel hata toast'ını kapatır (hata yalnız kutuda)", async () => {
    h.post.mockResolvedValue({ data: { id: "inq1" } });
    open();
    fireEvent.change(screen.getByLabelText(/Mesajınız/), {
      target: { value: "Bu ürün için fiyat bilgisi rica ederim." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Talebi gönder" }));
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
    expect(h.post.mock.calls[0]![0]).toBe("/company/inquiries");
    expect(h.post.mock.calls[0]![2]).toEqual({ skipErrorToast: true });
  });

  it("yanıtsız istek (ağ): kutuda nedeni söyleyen bağlantı metni", async () => {
    const { AxiosError } = await import("axios");
    h.post.mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"));
    open();
    fireEvent.change(screen.getByLabelText(/Mesajınız/), {
      target: { value: "Bu ürün için fiyat bilgisi rica ederim." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Talebi gönder" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Sunucuya ulaşılamadı/);
  });

  // r3-comm#new0: istek `skipErrorToast` olduğundan çevrili küresel "Sunucu
  // hatası" toast'ı yok; Nest'in varsayılan 500 gövdesi ("Internal server
  // error") TR/RU arayüzde tek mesaj olarak kalıyordu.
  it.each([500, 502, 503])("5xx (%i): ham gövde değil çevrili sunucu metni", async (status) => {
    const { AxiosError } = await import("axios");
    const err = new AxiosError("Request failed", "ERR_BAD_RESPONSE", undefined, undefined, {
      status,
      statusText: "",
      headers: {},
      config: { headers: {} } as never,
      data: { statusCode: status, message: "Internal server error" },
    });
    h.post.mockRejectedValue(err);
    open();
    fireEvent.change(screen.getByLabelText(/Mesajınız/), {
      target: { value: "Bu ürün için fiyat bilgisi rica ederim." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Talebi gönder" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Sunucu hatası, lütfen tekrar deneyin");
    expect(alert).not.toHaveTextContent(/Internal server error/);
  });

  it("4xx: sunucunun (çevrili) gerekçesi gösterilir", async () => {
    const { AxiosError } = await import("axios");
    const msg = "Bu ürün için zaten bir talep gönderdiniz.";
    const err = new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 409,
      statusText: "",
      headers: {},
      config: { headers: {} } as never,
      data: { statusCode: 409, message: msg },
    });
    h.post.mockRejectedValue(err);
    open();
    fireEvent.change(screen.getByLabelText(/Mesajınız/), {
      target: { value: "Bu ürün için fiyat bilgisi rica ederim." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Talebi gönder" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(msg);
  });

  it("sunucu hatası yapışkan şeritte (gönder düğmesinin üstünde) duyurulur", async () => {
    h.post.mockRejectedValue(new Error("boom"));
    open();
    fireEvent.change(screen.getByLabelText(/Mesajınız/), {
      target: { value: "Bu ürün için fiyat bilgisi rica ederim." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Talebi gönder" }));
    const alert = await screen.findByRole("alert");
    const submit = screen.getByRole("button", { name: "Talebi gönder" });
    expect(alert.parentElement).toBe(submit.parentElement);
    expect(alert.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // İstek dışı (beklenmeyen JS) hatanın İngilizce `message`ı kullanıcıya basılmaz.
  it("istek dışı hata: ham mesaj değil çevrili 'gönderilemedi' metni", async () => {
    h.post.mockRejectedValue(new TypeError("Cannot read properties of undefined"));
    open();
    fireEvent.change(screen.getByLabelText(/Mesajınız/), {
      target: { value: "Bu ürün için fiyat bilgisi rica ederim." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Talebi gönder" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Talep gönderilemedi");
    expect(alert).not.toHaveTextContent(/Cannot read/);
  });
});

