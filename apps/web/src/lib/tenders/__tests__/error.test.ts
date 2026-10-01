import { describe, expect, it } from "vitest";
import { errorToastedGlobally, extractErrorMessage } from "../error";

const axiosErr = (data: unknown) => ({
  isAxiosError: true,
  response: { data },
});

describe("extractErrorMessage", () => {
  it("axios string message döner", () => {
    expect(
      extractErrorMessage(axiosErr({ message: "Sunucu hatası" }), "yedek"),
    ).toBe("Sunucu hatası");
  });

  it("axios dizi message birleştirilir", () => {
    expect(
      extractErrorMessage(axiosErr({ message: ["a", "b"] }), "yedek"),
    ).toBe("a, b");
  });

  it("axios message yoksa fallback", () => {
    expect(extractErrorMessage(axiosErr({}), "yedek")).toBe("yedek");
  });

  it("düz Error mesajını döner", () => {
    expect(extractErrorMessage(new Error("patladı"), "yedek")).toBe("patladı");
  });

  it("alan hataları: ilk 3 + kalan sayısı çoğul mesajla (dil köprüsü yoksa Türkçe)", () => {
    const errors = { a: "A hatalı", b: "B hatalı", c: "C hatalı", d: "D hatalı", e: "E hatalı" };
    expect(extractErrorMessage(axiosErr({ message: "Doğrulama hatası", errors }), "yedek")).toBe(
      "A hatalı · B hatalı · C hatalı (+2 alan daha)",
    );
  });

  it("alan etiketi verilirse hata alan adıyla basılır (arayüz testi D-054)", () => {
    const errors = { aboutText: "En fazla 2000 karakter olabilir", "services.3": "Çok uzun", other: "X" };
    expect(
      extractErrorMessage(axiosErr({ message: "Doğrulama hatası", errors }), "yedek", {
        aboutText: "Hakkında",
        services: "Hizmetler",
      }),
    ).toBe("Hakkında: En fazla 2000 karakter olabilir · Hizmetler: Çok uzun · X");
  });

  it("bilinmeyen değerde fallback", () => {
    expect(extractErrorMessage("string", "yedek")).toBe("yedek");
    expect(extractErrorMessage(null, "yedek")).toBe("yedek");
  });
});

describe("errorToastedGlobally (arayüz testi D-255)", () => {
  it("5xx ve ağ hatası interceptor'da toast'lanmış sayılır", () => {
    expect(errorToastedGlobally({ isAxiosError: true, response: { status: 500, data: {} } })).toBe(true);
    expect(errorToastedGlobally({ isAxiosError: true, response: undefined })).toBe(true);
  });

  it("4xx ve axios dışı hata çağıranda gösterilir", () => {
    expect(errorToastedGlobally({ isAxiosError: true, response: { status: 409, data: {} } })).toBe(false);
    expect(errorToastedGlobally(new Error("x"))).toBe(false);
  });
});
