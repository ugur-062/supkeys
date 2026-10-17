// @vitest-environment jsdom
/**
 * DOSYA İNDİRME VE YAZDIRMA TEK YOLU (mobil kabuk 2026-10-16) — tarayıcıda
 * bugünkü davranış bire bir; kabukta Filesystem + Share ve kabuğun kendi
 * `RothernPrint` eklentisi; eklentisiz eski kabukta `unsupported`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blobToBase64, isUserCancel, printHtml, REVOKE_DELAY_MS, safeFileName, saveFile } from "./save-file";

type ShellWindow = Window & { Capacitor?: unknown };

function installShell(plugins: Record<string, unknown> | undefined) {
  (window as ShellWindow).Capacitor = { isNativePlatform: () => true, Plugins: plugins };
}

function shellPlugins() {
  const writeFile = vi.fn<(opts: { path: string; data: string; directory: string }) => Promise<{ uri: string }>>(
    async () => ({ uri: "file:///data/user/0/com.rothern.app/cache/x" }),
  );
  const share = vi.fn<(opts: { title?: string; dialogTitle?: string; files?: string[] }) => Promise<unknown>>(
    async () => ({}),
  );
  const print = vi.fn<(opts: { html: string; name: string }) => Promise<unknown>>(async () => undefined);
  return {
    writeFile,
    share,
    print,
    plugins: { Filesystem: { writeFile }, Share: { share }, RothernPrint: { print } },
  };
}

const realCreate = URL.createObjectURL;
const realRevoke = URL.revokeObjectURL;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let clicked: HTMLAnchorElement[];

beforeEach(() => {
  createObjectURL = vi.fn(() => "blob:rothern/1");
  revokeObjectURL = vi.fn();
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
  clicked = [];
  // jsdom gezinmeyi uygulamaz — tıklanan bağlantıyı yakala, gezinme yok.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
});

afterEach(() => {
  delete (window as ShellWindow).Capacitor;
  URL.createObjectURL = realCreate;
  URL.revokeObjectURL = realRevoke;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("safeFileName — önbelleğe yazılacak ad", () => {
  it("uzantıyı ve Türkçe harfleri korur", () => {
    expect(safeFileName("Şartname çözüm ÖĞÜ İı.pdf")).toBe("Şartname çözüm ÖĞÜ İı.pdf");
    expect(safeFileName("kalem-sablonu.xlsx")).toBe("kalem-sablonu.xlsx");
    expect(safeFileName("Отчёт за май.xlsx")).toBe("Отчёт за май.xlsx");
  });

  it("yol ve dosya sistemi ayırıcılarını, denetim karakterlerini atar", () => {
    expect(safeFileName("rapor/2026:Ağustos?.xlsx")).toBe("rapor-2026-Ağustos-.xlsx");
    expect(safeFileName('a\\b*c"d<e>f|g.txt')).toBe("a-b-c-d-e-f-g.txt");
    expect(safeFileName("a\u0000b\nc.txt")).toBe("a-b-c.txt");
  });

  it("dizin atlama ve gizli dosya üretmez", () => {
    expect(safeFileName("../../etc/passwd")).toBe("etc-passwd");
    expect(safeFileName("..xlsx")).toBe("dosya.xlsx");
    expect(safeFileName("  .rapor.xlsx  ")).toBe("rapor.xlsx");
  });

  it("boş ad yedeğe düşer, uzantı kalır", () => {
    expect(safeFileName("")).toBe("dosya");
    expect(safeFileName("///")).toBe("dosya");
    expect(safeFileName("/.xlsx")).toBe("dosya.xlsx");
    expect(safeFileName("", "rothern")).toBe("rothern");
  });

  it("çok uzun adı uzantıyı koruyarak kısaltır; ayrık Unicode birleşir (NFC)", () => {
    const long = `${"a".repeat(300)}.xlsx`;
    expect(safeFileName(long)).toBe(`${"a".repeat(100)}.xlsx`);
    // Kısaltma vekil çiftini (emoji) bölmez; kesimde sona kalan nokta düşer.
    const emojiName = safeFileName(`${"a".repeat(99)}😀b.txt`);
    expect(emojiName).toBe(`${"a".repeat(99)}😀.txt`);
    expect(emojiName).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(safeFileName(`${"a".repeat(99)}.b.txt`)).toBe(`${"a".repeat(99)}.txt`);
    expect(safeFileName("şart.pdf")).toBe("şart.pdf");
  });
});

describe("blobToBase64", () => {
  it("data: öneki olmadan base64 döner", async () => {
    expect(await blobToBase64(new Blob(["hello"], { type: "text/plain" }))).toBe("aGVsbG8=");
    expect(await blobToBase64(new Blob(["ğ"], { type: "text/plain" }))).toBe(btoa("Ä\u009f"));
  });

  it("boş blob → boş dize ('data:' öneki veri sanılmaz)", async () => {
    expect(await blobToBase64(new Blob([]))).toBe("");
  });
});

describe("isUserCancel", () => {
  it("iOS / Android paylaşım iptalini tanır, başka hatayı tanımaz", () => {
    expect(isUserCancel(new Error("Share canceled"))).toBe(true);
    expect(isUserCancel({ message: "User cancelled" })).toBe(true);
    expect(isUserCancel("Cancelled by user")).toBe(true);
    expect(isUserCancel(new Error("disk full"))).toBe(false);
    expect(isUserCancel(undefined)).toBe(false);
  });
});

describe("saveFile — tarayıcı (bugünkü <a download> yolu)", () => {
  // Bırakma zamanlayıcısı testten sonra gerçek saatte ateşlenmesin.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("bağlantıyı dosya adıyla tıklar, nesne adresini bir süre SONRA bırakır", async () => {
    const blob = new Blob(["x"]);
    const outcome = await saveFile(blob, "rapor.xlsx");

    expect(outcome).toBe("downloaded");
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toBe("rapor.xlsx");
    expect(clicked[0]!.getAttribute("href")).toBe("blob:rothern/1");
    // Hemen bırakılmaz (Firefox / Safari boş dosya indirirdi).
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_DELAY_MS - 1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:rothern/1");
  });

  it("tarayıcıda dosya adı OLDUĞU GİBİ kalır (indirme adı değişmez)", async () => {
    await saveFile(new Blob(["x"]), "teklif-şablonu ROT-000846.xlsx");
    expect(clicked[0]!.download).toBe("teklif-şablonu ROT-000846.xlsx");
  });

  it("köprü yerel değilse (isNativePlatform false) tarayıcı yolu", async () => {
    (window as ShellWindow).Capacitor = { isNativePlatform: () => false, Plugins: shellPlugins().plugins };
    expect(await saveFile(new Blob(["x"]), "a.txt")).toBe("downloaded");
    expect(clicked).toHaveLength(1);
  });
});

describe("saveFile — mobil kabuk (Filesystem + Share)", () => {
  it("önbelleğe base64 yazar (güvenli ad, CACHE), paylaşım sayfasını dosyayla açar", async () => {
    const p = shellPlugins();
    installShell(p.plugins);

    const outcome = await saveFile(new Blob(["hello"], { type: "text/plain" }), "rapor/Ağustos:2026.xlsx");

    expect(outcome).toBe("shared");
    expect(p.writeFile).toHaveBeenCalledWith({
      path: "rapor-Ağustos-2026.xlsx",
      data: "aGVsbG8=",
      directory: "CACHE",
    });
    expect(p.share).toHaveBeenCalledWith({
      title: "rapor-Ağustos-2026.xlsx",
      dialogTitle: "rapor-Ağustos-2026.xlsx",
      files: ["file:///data/user/0/com.rothern.app/cache/x"],
    });
    // Tarayıcı yolu hiç çalışmaz.
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clicked).toHaveLength(0);
  });

  it("başlık verilirse paylaşım sayfası onu kullanır", async () => {
    const p = shellPlugins();
    installShell(p.plugins);
    await saveFile(new Blob(["x"]), "a.txt", { title: "Kurtarma kodları" });
    expect(p.share).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Kurtarma kodları", dialogTitle: "Kurtarma kodları" }),
    );
  });

  it("kullanıcı paylaşım sayfasını kapatırsa 'cancelled' (hata değil)", async () => {
    const p = shellPlugins();
    p.share.mockRejectedValueOnce(new Error("Share canceled"));
    installShell(p.plugins);
    expect(await saveFile(new Blob(["x"]), "a.txt")).toBe("cancelled");

    p.share.mockRejectedValueOnce({ message: "User cancelled the share" });
    expect(await saveFile(new Blob(["x"]), "a.txt")).toBe("cancelled");
  });

  it("başka yerel hata FIRLATILIR", async () => {
    const p = shellPlugins();
    p.writeFile.mockRejectedValueOnce(new Error("No space left on device"));
    installShell(p.plugins);
    await expect(saveFile(new Blob(["x"]), "a.txt")).rejects.toThrow("No space left on device");
    expect(p.share).not.toHaveBeenCalled();
  });

  it("uri dönmeyen yazım hata sayılır (paylaşım açılmaz)", async () => {
    const p = shellPlugins();
    p.writeFile.mockResolvedValueOnce({ uri: "" });
    installShell(p.plugins);
    await expect(saveFile(new Blob(["x"]), "a.txt")).rejects.toThrow();
    expect(p.share).not.toHaveBeenCalled();
  });

  it("eklentisiz eski uygulama sürümü → 'unsupported', hiçbir şey indirilmez", async () => {
    installShell({ App: {}, Browser: { open() {} } });
    expect(await saveFile(new Blob(["x"]), "a.txt")).toBe("unsupported");
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clicked).toHaveLength(0);
  });

  it("yalnız biri varsa da 'unsupported' (Filesystem var, Share yok)", async () => {
    const p = shellPlugins();
    installShell({ Filesystem: p.plugins.Filesystem });
    expect(await saveFile(new Blob(["x"]), "a.txt")).toBe("unsupported");
    expect(p.writeFile).not.toHaveBeenCalled();
  });

  it("köprü henüz enjekte edilmemiş kabuk (yalnız kullanıcı aracısı eki) → 'unsupported'", async () => {
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 (Linux; Android 14) RothernApp/1.0",
      configurable: true,
    });
    try {
      expect(await saveFile(new Blob(["x"]), "a.txt")).toBe("unsupported");
      expect(clicked).toHaveLength(0);
    } finally {
      delete (window.navigator as { userAgent?: string }).userAgent;
    }
  });

  it("platformda uygulanmamış eklenti (UNIMPLEMENTED) eksik sayılır", async () => {
    const p = shellPlugins();
    p.writeFile.mockRejectedValueOnce({ code: "UNIMPLEMENTED", message: "Filesystem plugin is not implemented on ios" });
    installShell(p.plugins);
    expect(await saveFile(new Blob(["x"]), "a.txt")).toBe("unsupported");
  });
});

describe("printHtml — tarayıcı (sipariş sayfasının önceki yolu)", () => {
  function fakeWindow() {
    const doc = { write: vi.fn(), close: vi.fn() };
    return { document: doc, focus: vi.fn(), print: vi.fn() };
  }

  it("pencereyi EŞZAMANLI açar (tıklama etkinliği), belgeyi yazar, kapatır, yazdırır", async () => {
    const w = fakeWindow();
    const open = vi.spyOn(window, "open").mockReturnValue(w as unknown as Window);

    const pending = printHtml("<!doctype html><title>ORD-1</title>", "ORD-1");
    // İlk await'ten önce açıldı — açılır pencere engelleyicisi tıklamayı görür.
    expect(open).toHaveBeenCalledWith("", "_blank", "width=800,height=900");
    expect(await pending).toBe("printed");

    expect(w.document.write).toHaveBeenCalledWith("<!doctype html><title>ORD-1</title>");
    expect(w.document.close).toHaveBeenCalled();
    expect(w.focus).toHaveBeenCalled();
    expect(w.print).toHaveBeenCalled();
    // Sıra: yaz → kapat → odakla → yazdır.
    expect(w.document.close.mock.invocationCallOrder[0]!).toBeLessThan(w.print.mock.invocationCallOrder[0]!);
  });

  it("açılır pencere engellenirse 'blocked' (çağıran söyler)", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    expect(await printHtml("<p/>", "x")).toBe("blocked");
  });
});

describe("printHtml — mobil kabuk (RothernPrint)", () => {
  it("HTML'i ve güvenli iş adını eklentiye verir; pencere açmaz", async () => {
    const p = shellPlugins();
    installShell(p.plugins);
    const open = vi.spyOn(window, "open");

    expect(await printHtml("<!doctype html><p>Sipariş</p>", "Sipariş/ORD-2026-0001")).toBe("printed");
    expect(p.print).toHaveBeenCalledWith({ html: "<!doctype html><p>Sipariş</p>", name: "Sipariş-ORD-2026-0001" });
    expect(open).not.toHaveBeenCalled();
  });

  it("eklentisiz eski sürüm → 'unsupported', pencere açılmaz", async () => {
    installShell({ App: {} });
    const open = vi.spyOn(window, "open");
    expect(await printHtml("<p/>", "ORD-1")).toBe("unsupported");
    expect(open).not.toHaveBeenCalled();
  });

  it("UNIMPLEMENTED → 'unsupported'; başka hata fırlatılır", async () => {
    const p = shellPlugins();
    installShell(p.plugins);
    p.print.mockRejectedValueOnce({ code: "UNIMPLEMENTED", message: "not implemented" });
    expect(await printHtml("<p/>", "ORD-1")).toBe("unsupported");
    p.print.mockRejectedValueOnce(new Error("print service unavailable"));
    await expect(printHtml("<p/>", "ORD-1")).rejects.toThrow("print service unavailable");
  });
});
