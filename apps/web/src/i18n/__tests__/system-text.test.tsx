// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { encodeSystemText, LC_PAYMENT_METHOD } from "@rothern/shared";
import { messagesFor } from "@rothern/i18n/messages";
import { useBidDeliveryTimeLabel, usePaymentMethodLabel, useSystemText } from "../domain";

/**
 * Sistemin yazdığı metinler ve teklif teslim süresi okuyucunun dilinde
 * (2026-09-27). Testler TR katalogla koşar (vitest.setup) — EN/RU karşılığı
 * katalogdan ayrıca denetlenir.
 */
describe("useSystemText — kodla saklanan gerekçe", () => {
  it("kodlu ve eski Türkçe kayıt aynı cümleye çizilir; serbest metin aynen", () => {
    const { result } = renderHook(() => useSystemText());
    const f = result.current;
    expect(f(encodeSystemText("ORDER_REJECTED", "stok bitti"))).toBe(
      "Sipariş satıcı tarafından reddedildi: stok bitti",
    );
    expect(f("Sipariş satıcı tarafından reddedildi: stok bitti")).toBe(
      "Sipariş satıcı tarafından reddedildi: stok bitti",
    );
    expect(f(encodeSystemText("ADMIN", "destek #42"))).toBe("[Yönetici] destek #42");
    expect(f(encodeSystemText("CANCEL_REQUEST_APPROVED"))).toBe("Satıcı iptal talebi onaylandı");
    expect(f("belge eksik")).toBe("belge eksik");
  });

  it("ödeme yöntemi: akreditif kodu ve eski 'Akreditif' çevrilir, serbest metin aynen", () => {
    const { result } = renderHook(() => usePaymentMethodLabel());
    expect(result.current(LC_PAYMENT_METHOD)).toBe("Akreditif");
    expect(result.current("Akreditif")).toBe("Akreditif");
    expect(result.current("Havale")).toBe("Havale");
    expect(result.current(null)).toBeNull();
  });

  it("EN/RU katalogda Türkçe kalmaz", () => {
    for (const locale of ["en", "ru"] as const) {
      const web = messagesFor(locale, ["web"]).web as unknown as { domain: Record<string, Record<string, string>> };
      for (const ns of ["systemText", "paymentMethod", "bidDeliveryTime"]) {
        for (const [k, v] of Object.entries(web.domain[ns]!)) {
          expect(/[çğıöşüÇĞİÖŞÜ]|hafta|\bay\b/.test(v), `${locale} ${ns}.${k}=${v}`).toBe(false);
        }
      }
    }
  });
});

describe("useBidDeliveryTimeLabel", () => {
  it("kod → etiket; boş → null; bilinmeyen kod aynen", () => {
    const { result } = renderHook(() => useBidDeliveryTimeLabel());
    expect(result.current("STOKTAN")).toBe("Stoktan (hemen)");
    expect(result.current("M3_PLUS")).toBe("3 aydan uzun");
    expect(result.current(null)).toBeNull();
    expect(result.current("X")).toBe("X");
  });
});
