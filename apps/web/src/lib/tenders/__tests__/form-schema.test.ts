import { describe, expect, it } from "vitest";
import { createTranslator } from "use-intl/core";
import { WEB_NAMESPACES, messagesFor } from "@rothern/i18n/messages";
import {
  DEFAULT_FORM_VALUES,
  makeTenderFormSchema,
  type TenderFormData,
} from "../form-schema";

/* i18n Faz 2: şema FABRİKA — mesajlar kullanıcının dilinden. Test Türkçe
   katalogla kurar ki beklentiler gerçek metni (ör. "2 yıl") sınasın. */
const tTr = createTranslator({ locale: "tr", messages: messagesFor("tr", WEB_NAMESPACES) as never }) as unknown as (
  key: string,
  values?: Record<string, string | number>,
) => string;
const tenderFormSchema = makeTenderFormSchema((key, values) => tTr(`web.panel.requests.${key}`, values));

const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

function validForm(over: Partial<TenderFormData> = {}): TenderFormData {
  return {
    ...DEFAULT_FORM_VALUES,
    categoryIds: ["cat-1"],
    title: "Geçerli satın alma talebi başlığı",
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

  it("teslim şekli zorunlu; teslimat adresi OPSİYONEL (W2 — hizmet/lojistik)", () => {
    expect(
      tenderFormSchema.safeParse(validForm({ deliveryTerm: undefined }))
        .success,
    ).toBe(false);
    // W2: adressiz ihale artık geçerli (backend @IsOptional ile hizalı).
    expect(
      tenderFormSchema.safeParse(validForm({ deliveryAddressId: "" })).success,
    ).toBe(true);
  });

  it("W1: görünürlük üç değeri de kabul eder (CONNECTIONS = Davetli/Herkese-Açık arası)", () => {
    for (const visibility of ["PRIVATE", "CONNECTIONS", "PUBLIC"] as const) {
      expect(
        tenderFormSchema.safeParse(validForm({ visibility })).success,
      ).toBe(true);
    }
    // Geçersiz değer reddedilir (enum kapalı — üçüncü tanım sızmaz).
    expect(
      tenderFormSchema.safeParse(
        validForm({ visibility: "EVERYONE" as never }),
      ).success,
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

  it("mal mukabili her talepte seçilebilir (2026-09-21: kapsam kısıtı kalktı); vade OPSİYONEL", () => {
    expect(tenderFormSchema.safeParse(validForm({ paymentCategory: "MAL_MUKABILI" })).success).toBe(true);
    expect(tenderFormSchema.safeParse(validForm({ paymentCategory: "MAL_MUKABILI", paymentDays: undefined })).success).toBe(true);
    expect(tenderFormSchema.safeParse(validForm({ paymentCategory: "MAL_MUKABILI", paymentDays: 60 })).success).toBe(true);
  });

  it("kısmi peşin görünürlük ülkesinden bağımsız", () => {
    expect(tenderFormSchema.safeParse(validForm({ paymentCategory: "ADVANCE", advancePercent: 50 })).success).toBe(true);
    expect(tenderFormSchema.safeParse(validForm({ paymentCategory: "ADVANCE", advancePercent: 50, targetCountries: [] })).success).toBe(true);
    expect(tenderFormSchema.safeParse(validForm({ paymentCategory: "ADVANCE", advancePercent: 100, targetCountries: ["DE", "TR"] })).success).toBe(true);
  });

  it("akreditif: alt tip zorunlu; Usance vade ister; açık hesap da her talepte", () => {
    expect(tenderFormSchema.safeParse(validForm({ paymentCategory: "LETTER_OF_CREDIT", lcType: "SIGHT" })).success).toBe(true);
    expect(tenderFormSchema.safeParse(validForm({ paymentCategory: "LETTER_OF_CREDIT", lcType: undefined })).success).toBe(false);
    expect(tenderFormSchema.safeParse(validForm({ paymentCategory: "LETTER_OF_CREDIT", lcType: "USANCE", paymentDays: undefined })).success).toBe(false);
    expect(tenderFormSchema.safeParse(validForm({ paymentCategory: "LETTER_OF_CREDIT", lcType: "USANCE", paymentDays: 90 })).success).toBe(true);
    expect(tenderFormSchema.safeParse(validForm({ paymentCategory: "OPEN_ACCOUNT", targetCountries: [] })).success).toBe(true);
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

  it("lojistik satın alma talebinde çıkış/varış/kargo zorunlu", () => {
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

describe("tenderFormSchema — İngiliz usulü (açık eksiltme)", () => {
  it("artış adımı ARANMAZ (minimum pay kaldırıldı)", () => {
    // Minimum pay 2026-07-13'te kaldırıldı — paysız pazarlık formu geçerli.
    expect(
      tenderFormSchema.safeParse(validForm({ type: "ENGLISH_AUCTION" })).success,
    ).toBe(true);
  });

  it("bilinmeyen fiyat alanları (taban/hemen-al) forma sızmaz", () => {
    const res = tenderFormSchema.safeParse(
      validForm({ minPrice: 1000, buyNowPrice: 1500 } as unknown as Partial<TenderFormData>),
    );
    expect(res.success).toBe(true);
    if (res.success) {
      expect("minPrice" in res.data).toBe(false);
      expect("buyNowPrice" in res.data).toBe(false);
    }
  });
});
