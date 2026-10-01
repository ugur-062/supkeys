import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CompanyItemsController } from "../../src/modules/company-items/company-items.controller";

/**
 * Arayüz testi Y-11 / O-100: vitrin DTO'su video adresini İZİNLİ LİSTEYLE
 * (YouTube/Vimeo, https), dış bağlantıyı yalnız https olarak kabul eder;
 * görsel tavanı ortak sabitten (`MAX_PRODUCT_IMAGES` = 8). Eskiden yalnız
 * uzunluk denetleniyordu (`javascript:` bile kaydediliyordu).
 */
const ShowcaseDto = (
  Reflect.getMetadata("design:paramtypes", CompanyItemsController.prototype, "updateShowcase") as unknown[]
)[2] as new () => object;

const errs = (body: Record<string, unknown>) =>
  validateSync(plainToInstance(ShowcaseDto, body)).map((e) => e.property);

describe("ShowcaseDto video ve dış bağlantı", () => {
  it("YouTube ve Vimeo kabul; başka konak, http ve javascript: reddedilir", () => {
    expect(errs({ videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })).toEqual([]);
    expect(errs({ videoUrl: "https://youtu.be/dQw4w9WgXcQ" })).toEqual([]);
    expect(errs({ videoUrl: "https://vimeo.com/76979871" })).toEqual([]);
    expect(errs({ videoUrl: "https://example.com/video.mp4" })).toEqual(["videoUrl"]);
    expect(errs({ videoUrl: "http://www.youtube.com/watch?v=dQw4w9WgXcQ" })).toEqual(["videoUrl"]);
    expect(errs({ videoUrl: "javascript:alert(1)" })).toEqual(["videoUrl"]);
  });

  it("dış bağlantı yalnız https; boş/null alanı temizler", () => {
    expect(errs({ externalUrl: "https://firma.com/urun" })).toEqual([]);
    expect(errs({ externalUrl: "javascript:alert(1)" })).toEqual(["externalUrl"]);
    expect(errs({ externalUrl: "ftp://firma.com" })).toEqual(["externalUrl"]);
    expect(errs({ videoUrl: null, externalUrl: null })).toEqual([]);
    expect(errs({ videoUrl: "", externalUrl: "  " })).toEqual([]);
  });

  it("görsel tavanı 8", () => {
    const img = (n: number) => Array.from({ length: n }, (_, i) => `https://cdn/x${i}.webp`);
    expect(errs({ images: img(8) })).toEqual([]);
    expect(errs({ images: img(9) })).toEqual(["images"]);
  });
});
