import { describe, expect, it } from "vitest";
import {
  normalizeSeedPrice,
  seedBidItemPrice,
} from "@/lib/tenders/carried-bid-price";

/**
 * Arayüz testi son tur S-SELL: kalem bazlı USD fiyatlı teklif pazarlık turuna
 * taşınınca form USD fiyatı ₺ sütununa ham yazıyor, gönderim kalem birimini
 * taşıdığı için sunucu 400 dönüyordu. Tohum, kalem birimi kullanılamayan
 * talepte fiyatı damgayla ana birime çevirmeli.
 */
describe("seedBidItemPrice", () => {
  it("pazarlıkta USD kalem: fxToBase damgasıyla ₺'ye çevrilir, birim düşer", () => {
    const r = seedBidItemPrice(
      { unitPrice: "2.75", currency: "USD", fxToBase: "49.123456789012" },
      { bidCurrency: "TRY", allowItemCurrency: false },
    );
    // 2,75 × 49,123456789012 = 135,08950616978… → YUKARI 135,09
    expect(r).toEqual({ price: "135.09", currency: "", converted: true });
  });

  it("çevrim yukarı yuvarlar — değiştirilmeden gönderim önceki teklifin altına inmez", () => {
    const r = seedBidItemPrice(
      { unitPrice: "1", currency: "EUR", fxToBase: "50.001" },
      { bidCurrency: "TRY", allowItemCurrency: false },
    );
    expect(r.price).toBe("50.01");
  });

  it("tam sonuç yuvarlanmaz", () => {
    const r = seedBidItemPrice(
      { unitPrice: "2", currency: "USD", fxToBase: "40.5" },
      { bidCurrency: "TRY", allowItemCurrency: false },
    );
    expect(r.price).toBe("81");
  });

  it("damgasız yabancı kalem: fiyat boş bırakılır (yanlış birimde sessiz fiyat yok)", () => {
    const r = seedBidItemPrice(
      { unitPrice: "2.75", currency: "USD", fxToBase: null },
      { bidCurrency: "TRY", allowItemCurrency: false },
    );
    expect(r).toEqual({ price: "", currency: "", converted: true });
  });

  it("kapalı zarf (kalem birimi serbest): fiyat ve birim aynen korunur", () => {
    const r = seedBidItemPrice(
      { unitPrice: "2.75", currency: "USD", fxToBase: "49" },
      { bidCurrency: "TRY", allowItemCurrency: true },
    );
    expect(r).toEqual({ price: "2.75", currency: "USD", converted: false });
  });

  it("ana birimdeki kalem çevrilmez", () => {
    expect(
      seedBidItemPrice(
        { unitPrice: "1400.25", currency: "TRY", fxToBase: null },
        { bidCurrency: "TRY", allowItemCurrency: false },
      ),
    ).toEqual({ price: "1400.25", currency: "", converted: false });
    expect(
      seedBidItemPrice(
        { unitPrice: "1400.25", currency: null },
        { bidCurrency: "TRY", allowItemCurrency: false },
      ).converted,
    ).toBe(false);
  });
});

describe("normalizeSeedPrice", () => {
  it("kesirli fiyat 2 haneyle döner (alan '1.500,5' değil '1.500,50' göstersin)", () => {
    expect(normalizeSeedPrice("1500.5")).toBe("1500.50");
    expect(normalizeSeedPrice("1500.50")).toBe("1500.50");
    expect(normalizeSeedPrice("0.5")).toBe("0.50");
  });
  it("tam sayı ve sondaki sıfırlar", () => {
    expect(normalizeSeedPrice("1500")).toBe("1500");
    expect(normalizeSeedPrice("1500.00")).toBe("1500");
  });
});
