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
    ...over,
  } as TenderFormData;
}

describe("tenderFormSchema", () => {
  it("geçerli form parse edilir", () => {
    expect(tenderFormSchema.safeParse(validForm()).success).toBe(true);
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

  it("vadeli ödemede gün sayısı zorunlu", () => {
    const bad = tenderFormSchema.safeParse(
      validForm({ paymentTerm: "DEFERRED", paymentDays: undefined }),
    );
    expect(bad.success).toBe(false);
    const ok = tenderFormSchema.safeParse(
      validForm({ paymentTerm: "DEFERRED", paymentDays: 30 }),
    );
    expect(ok.success).toBe(true);
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

  it("SATIS + İngiliz usulü (açık artırma): artış adımı zorunlu", () => {
    const noStep = tenderFormSchema.safeParse(
      validForm({
        listingType: "SATIS",
        minPrice: 1000,
        type: "ENGLISH_AUCTION",
        priceDecrementValue: undefined,
      }),
    );
    expect(noStep.success).toBe(false);
    expect(
      noStep.success
        ? ""
        : noStep.error.issues.map((i) => i.path.join(".")).join(","),
    ).toContain("priceDecrementValue");

    expect(
      tenderFormSchema.safeParse(
        validForm({
          listingType: "SATIS",
          minPrice: 1000,
          type: "ENGLISH_AUCTION",
          priceDecrementType: "AMOUNT",
          priceDecrementValue: 100,
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
