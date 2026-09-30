import { encodeSystemText, parseSystemText, parseVerificationReason, paymentMethodCode } from "@rothern/shared";

/**
 * Sistemin yazdığı gerekçe/ödeme metinleri KOD olarak saklanır (2026-09-27,
 * çok dillilik) — eskiden Türkçe cümle saklanıp her dilde Türkçe görünüyordu.
 * Eski kayıtlar da tanınmalı (veri dönüşümü yok).
 */
describe("sistem metni — kodla sakla, dilde çiz", () => {
  it("kodlu metin gidiş-dönüş: kod + kullanıcının serbest metni", () => {
    const raw = encodeSystemText("ORDER_REJECTED", "  stok bitti ");
    expect(raw).toBe("[[ORDER_REJECTED]] stok bitti");
    expect(parseSystemText(raw)).toEqual({ code: "ORDER_REJECTED", text: "stok bitti" });
    expect(parseSystemText(encodeSystemText("CANCEL_REQUEST_APPROVED"))).toEqual({
      code: "CANCEL_REQUEST_APPROVED",
      text: "",
    });
  });

  it("eski Türkçe kayıtlar tanınır", () => {
    expect(parseSystemText("Sipariş satıcı tarafından reddedildi: stok bitti")).toEqual({
      code: "ORDER_REJECTED",
      text: "stok bitti",
    });
    expect(parseSystemText("Satıcı iptal talebi onaylandı").code).toBe("CANCEL_REQUEST_APPROVED");
    expect(parseSystemText("[Yönetici] destek #42")).toEqual({ code: "ADMIN", text: "destek #42" });
    expect(parseSystemText("Akreditif ödemesi banka kanalından alındı").code).toBe("LC_PAID_VIA_BANK");
  });

  it("kullanıcının serbest metni kod sanılmaz; bilinmeyen kod ham kalır", () => {
    expect(parseSystemText("belge eksik")).toEqual({ code: null, text: "belge eksik" });
    expect(parseSystemText("[[BILINMEYEN]] x")).toEqual({ code: null, text: "[[BILINMEYEN]] x" });
    expect(parseSystemText(null)).toEqual({ code: null, text: "" });
  });

  it("prototip anahtarı adındaki serbest metin kod sanılmaz (derin denetim LU-10)", () => {
    for (const word of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
      expect(parseSystemText(word)).toEqual({ code: null, text: word });
      expect(parseVerificationReason(word)).toEqual({ code: null, note: word });
    }
  });

  it("ödeme yöntemi: yeni kod ve eski 'Akreditif' aynı; çek tanınır; serbest metin null", () => {
    expect(paymentMethodCode("LETTER_OF_CREDIT")).toBe("LETTER_OF_CREDIT");
    expect(paymentMethodCode("Akreditif")).toBe("LETTER_OF_CREDIT");
    expect(paymentMethodCode("Çek")).toBe("CHEQUE");
    expect(paymentMethodCode("Havale")).toBeNull();
    expect(paymentMethodCode(null)).toBeNull();
  });
});
