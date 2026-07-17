import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORM_VALUES,
  tenderFormSchema,
  type TenderFormData,
} from "../form-schema";

const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

function validForm(over: Partial<TenderFormData> = {}): TenderFormData {
  return {
    ...DEFAULT_FORM_VALUES,
    categoryIds: ["cat-1"],
    title: "Geçerli ihale başlığı",
    bidsCloseAt: future,
    items: [{ name: "Kalem", quantity: 1, unit: "adet" }],
    // 2026-07-11 ürün kararı: teslim şekli + teslimat adresi zorunlu.
    deliveryTerm: "DOMESTIC_DELIVERED",
    deliveryAddressId: "addr-1",
    ...over,
  } as TenderFormData;
}

describe("tenderFormSchema", () => {
  it("geçerli form parse edilir", () => {
    expect(tenderFormSchema.safeParse(validForm()).success).toBe(true);
  });

  it("teslim şekli ve teslimat adresi zorunlu", () => {
    expect(
      tenderFormSchema.safeParse(validForm({ deliveryTerm: undefined }))
        .success,
    ).toBe(false);
    expect(
      tenderFormSchema.safeParse(validForm({ deliveryAddressId: "" })).success,
    ).toBe(false);
  });

  it("fatura adresi: 'teslimatla aynı' tiki kapalıysa seçim zorunlu (yalnız ALIM)", () => {
    expect(
      tenderFormSchema.safeParse(
        validForm({ billingSameAsDelivery: false, billingAddressId: undefined }),
      ).success,
    ).toBe(false);
    expect(
      tenderFormSchema.safeParse(
        validForm({ billingSameAsDelivery: false, billingAddressId: "addr-2" }),
      ).success,
    ).toBe(true);
    // Tik açıkken fatura seçimi istenmez.
    expect(
      tenderFormSchema.safeParse(
        validForm({ billingSameAsDelivery: true, billingAddressId: undefined }),
      ).success,
    ).toBe(true);
  });

  it("başlık en az 3 karakter", () => {
    expect(tenderFormSchema.safeParse(validForm({ title: "ab" })).success).toBe(
      false,
    );
  });

  it("en az 1 kalem zorunlu", () => {
    expect(tenderFormSchema.safeParse(validForm({ items: [] })).success).toBe(
      false,
    );
  });

  it("kapanış tarihi gelecekte olmalı", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const res = tenderFormSchema.safeParse(validForm({ bidsCloseAt: past }));
    expect(res.success).toBe(false);
  });

  it("açılış tarihi kapanıştan önce olmalı", () => {
    const open = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
    const res = tenderFormSchema.safeParse(
      validForm({ bidsOpenAt: open, bidsCloseAt: future }),
    );
    expect(res.success).toBe(false);
  });

  it("vadeli/çek ödemede gün sayısı zorunlu", () => {
    for (const paymentCategory of ["DEFERRED", "CHEQUE"] as const) {
      const bad = tenderFormSchema.safeParse(
        validForm({ paymentCategory, paymentDays: undefined }),
      );
      expect(bad.success).toBe(false);
      const ok = tenderFormSchema.safeParse(
        validForm({ paymentCategory, paymentDays: 30 }),
      );
      expect(ok.success).toBe(true);
    }
  });

  it("mal mukabili: vade OPSİYONEL (boş da, günlü de geçerli)", () => {
    // Vadesiz (teslimde muaccel) — geçerli; DEFERRED/CHEQUE'in aksine gün istemez.
    expect(
      tenderFormSchema.safeParse(
        validForm({ paymentCategory: "MAL_MUKABILI", paymentDays: undefined }),
      ).success,
    ).toBe(true);
    // Vade girilirse de geçerli (teslim + gün takibi).
    expect(
      tenderFormSchema.safeParse(
        validForm({ paymentCategory: "MAL_MUKABILI", paymentDays: 60 }),
      ).success,
    ).toBe(true);
  });

  it("kısmi peşin yalnız yurtiçi ihalede", () => {
    // Yurtiçi: %50 peşin OK (kalan vade opsiyonel).
    expect(
      tenderFormSchema.safeParse(
        validForm({ paymentCategory: "ADVANCE", advancePercent: 50 }),
      ).success,
    ).toBe(true);
    // Uluslararası: %<100 reddedilir, %100 kabul.
    expect(
      tenderFormSchema.safeParse(
        validForm({
          paymentCategory: "ADVANCE",
          advancePercent: 50,
          isInternational: true,
        }),
      ).success,
    ).toBe(false);
    expect(
      tenderFormSchema.safeParse(
        validForm({
          paymentCategory: "ADVANCE",
          advancePercent: 100,
          isInternational: true,
        }),
      ).success,
    ).toBe(true);
  });

  it("akreditifte alt tip zorunlu; Usance vade ister", () => {
    expect(
      tenderFormSchema.safeParse(
        validForm({ paymentCategory: "LETTER_OF_CREDIT", lcType: undefined }),
      ).success,
    ).toBe(false);
    expect(
      tenderFormSchema.safeParse(
        validForm({ paymentCategory: "LETTER_OF_CREDIT", lcType: "SIGHT" }),
      ).success,
    ).toBe(true);
    expect(
      tenderFormSchema.safeParse(
        validForm({
          paymentCategory: "LETTER_OF_CREDIT",
          lcType: "USANCE",
          paymentDays: undefined,
        }),
      ).success,
    ).toBe(false);
    expect(
      tenderFormSchema.safeParse(
        validForm({
          paymentCategory: "LETTER_OF_CREDIT",
          lcType: "USANCE",
          paymentDays: 90,
        }),
      ).success,
    ).toBe(true);
  });

  it("özel ödeme şeklinde koşul notu zorunlu", () => {
    expect(
      tenderFormSchema.safeParse(
        validForm({ paymentCategory: "CUSTOM", paymentNote: " " }),
      ).success,
    ).toBe(false);
    expect(
      tenderFormSchema.safeParse(
        validForm({
          paymentCategory: "CUSTOM",
          paymentNote: "%30 sipariş onayında, kalan mal kabulünde",
        }),
      ).success,
    ).toBe(true);
  });

  it("lojistik ihalede çıkış/varış/kargo zorunlu", () => {
    const bad = tenderFormSchema.safeParse(validForm({ isLogistics: true }));
    expect(bad.success).toBe(false);
    const ok = tenderFormSchema.safeParse(
      validForm({
        isLogistics: true,
        logistics: {
          ...DEFAULT_FORM_VALUES.logistics!,
          originCity: "İstanbul",
          destinationCity: "Ankara",
          cargoType: "Genel kargo",
        },
      }),
    );
    expect(ok.success).toBe(true);
  });

  it("miktar 0'dan büyük olmalı", () => {
    const res = tenderFormSchema.safeParse(
      validForm({ items: [{ name: "K", quantity: 0, unit: "adet" }] }),
    );
    expect(res.success).toBe(false);
  });
});

describe("tenderFormSchema — sınır tavanları (F2/F3, backend DTO birebir)", () => {
  it("F2: kapanış 2 yıldan ileri olamaz", () => {
    const tooFar = new Date(
      Date.now() + 3 * 365 * 24 * 3600 * 1000,
    ).toISOString();
    const res = tenderFormSchema.safeParse(validForm({ bidsCloseAt: tooFar }));
    expect(res.success).toBe(false);
    if (!res.success)
      expect(res.error.issues.some((i) => /2 yıl/.test(i.message))).toBe(true);
  });

  it("F3: quantity 1e9'dan büyük olamaz", () => {
    const res = tenderFormSchema.safeParse(
      validForm({ items: [{ name: "K", quantity: 2_000_000_000, unit: "adet" }] }),
    );
    expect(res.success).toBe(false);
  });

  it("F3: quantity en fazla 3 ondalık", () => {
    const res = tenderFormSchema.safeParse(
      validForm({ items: [{ name: "K", quantity: 1.2345, unit: "adet" }] }),
    );
    expect(res.success).toBe(false);
  });

  it("F3: quantity 0.001 geçerli, 3 ondalık geçerli", () => {
    const res = tenderFormSchema.safeParse(
      validForm({ items: [{ name: "K", quantity: 0.001, unit: "adet" }] }),
    );
    expect(res.success).toBe(true);
  });
});

describe("tenderFormSchema — SATIS (satış ihalesi)", () => {
  it("SATIS: taban fiyat zorunlu; verilince geçer", () => {
    const noMin = tenderFormSchema.safeParse(
      validForm({ listingType: "SATIS" }),
    );
    expect(noMin.success).toBe(false);
    expect(
      noMin.success
        ? ""
        : noMin.error.issues.map((i) => i.path.join(".")).join(","),
    ).toContain("minPrice");

    expect(
      tenderFormSchema.safeParse(
        validForm({ listingType: "SATIS", minPrice: 1000 }),
      ).success,
    ).toBe(true);
  });

  it("SATIS: hemen-al taban fiyattan düşük olamaz", () => {
    const bad = tenderFormSchema.safeParse(
      validForm({ listingType: "SATIS", minPrice: 1000, buyNowPrice: 500 }),
    );
    expect(bad.success).toBe(false);
    expect(
      tenderFormSchema.safeParse(
        validForm({ listingType: "SATIS", minPrice: 1000, buyNowPrice: 1500 }),
      ).success,
    ).toBe(true);
  });

  it("ALIM'da taban fiyat kuralları uygulanmaz", () => {
    expect(
      tenderFormSchema.safeParse(validForm({ listingType: "ALIM" })).success,
    ).toBe(true);
  });

  it("SATIS + İngiliz usulü (açık artırma): artış adımı ARANMAZ (minimum pay kaldırıldı)", () => {
    // Minimum pay 2026-07-13'te kaldırıldı — paysız pazarlık formu geçerli.
    expect(
      tenderFormSchema.safeParse(
        validForm({
          listingType: "SATIS",
          minPrice: 1000,
          type: "ENGLISH_AUCTION",
        }),
      ).success,
    ).toBe(true);
  });

  it("KALEM fiyatlandırma: kalem tabanı zorunlu, hemen-al ≥ taban; toplu taban aranmaz", () => {
    const noItemFloor = tenderFormSchema.safeParse(
      validForm({ listingType: "SATIS", priceScope: "KALEM" }),
    );
    expect(noItemFloor.success).toBe(false);
    expect(
      noItemFloor.success
        ? ""
        : noItemFloor.error.issues.map((i) => i.path.join(".")).join(","),
    ).toContain("minUnitPrice");

    const badBuyNow = tenderFormSchema.safeParse(
      validForm({
        listingType: "SATIS",
        priceScope: "KALEM",
        items: [
          {
            name: "Kalem",
            quantity: 1,
            unit: "adet",
            minUnitPrice: 100,
            buyNowUnitPrice: 50,
          },
        ],
      }),
    );
    expect(badBuyNow.success).toBe(false);

    expect(
      tenderFormSchema.safeParse(
        validForm({
          listingType: "SATIS",
          priceScope: "KALEM",
          items: [
            {
              name: "Kalem",
              quantity: 1,
              unit: "adet",
              minUnitPrice: 100,
              buyNowUnitPrice: 150,
            },
          ],
        }),
      ).success,
    ).toBe(true);
  });

  it("SATIS + RFQ: artış adımı gerektirmez", () => {
    expect(
      tenderFormSchema.safeParse(
        validForm({ listingType: "SATIS", minPrice: 1000, type: "RFQ" }),
      ).success,
    ).toBe(true);
  });
});
