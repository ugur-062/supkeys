import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CompanyItemsController } from "../../src/modules/company-items/company-items.controller";

/**
 * Arayüz testi Y-11 / O-100: vitrin DTO'su video ve dış bağlantıda YALNIZ
 * biçim/uzunluk denetler; izinli liste (YouTube/Vimeo) ve https kuralı
 * serviste, yalnız DEĞİŞEN değerde (`assertShowcaseLinks` — davranış testi
 * `test/integration/free-tier-showcase.spec.ts`). DTO'da kalsaydı kural
 * öncesinden kalmış eski değer her kaydı 400'e düşürürdü (gözden geçirme).
 * Görsel tavanı ortak sabitten (`MAX_PRODUCT_IMAGES` = 8).
 */
const ShowcaseDto = (
  Reflect.getMetadata("design:paramtypes", CompanyItemsController.prototype, "updateShowcase") as unknown[]
)[2] as new () => object;

const errs = (body: Record<string, unknown>) =>
  validateSync(plainToInstance(ShowcaseDto, body)).map((e) => e.property);

describe("ShowcaseDto video ve dış bağlantı", () => {
  it("kural öncesinden kalmış eski değerler DTO'dan geçer (kural serviste, yalnız değişende)", () => {
    expect(errs({ videoUrl: "https://www.dailymotion.com/video/x8abc" })).toEqual([]);
    expect(errs({ videoUrl: "www.youtube.com/watch?v=dQw4w9WgXcQ" })).toEqual([]);
    expect(errs({ externalUrl: "http://firma.com/urun" })).toEqual([]);
    expect(errs({ videoUrl: null, externalUrl: null })).toEqual([]);
    expect(errs({ videoUrl: "", externalUrl: "  " })).toEqual([]);
  });

  it("uzunluk ve tür yine DTO'da", () => {
    expect(errs({ videoUrl: `https://youtu.be/${"x".repeat(500)}` })).toEqual(["videoUrl"]);
    expect(errs({ externalUrl: 42 })).toEqual(["externalUrl"]);
  });

  it("görsel tavanı 8", () => {
    const img = (n: number) => Array.from({ length: n }, (_, i) => `https://cdn/x${i}.webp`);
    expect(errs({ images: img(8) })).toEqual([]);
    expect(errs({ images: img(9) })).toEqual(["images"]);
  });
});
