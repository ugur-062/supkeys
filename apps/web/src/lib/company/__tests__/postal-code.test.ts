import { describe, expect, it } from "vitest";
import { cleanPostal, isInvalidTrPostal, postalInputMaxLength } from "../postal-code";

/**
 * Posta kodu kuralı (arayüz testi D-133; kayıt denetimi 2026-10 resignup-2).
 * Türkiye'de önce rakam dışı ayıklanır, SONRA ilk beş rakam alınır — kutunun
 * yerel `maxLength`i bu sırayı bozuyordu (yapıştırılan " 34710" → "3471").
 */
describe("posta kodu", () => {
  it("Türkiye: önce rakam dışını ayıklar, sonra ilk beş rakamı alır", () => {
    expect(cleanPostal(" 34710", true)).toBe("34710");
    expect(cleanPostal("34 710", true)).toBe("34710");
    expect(cleanPostal("TR-34710", true)).toBe("34710");
    expect(cleanPostal("347101234", true)).toBe("34710");
    expect(cleanPostal("", true)).toBe("");
  });

  it("diğer ülkeler: harf, rakam, boşluk ve tire kalır; büyük harfe çevrilir", () => {
    expect(cleanPostal("sw1a 1aa", false)).toBe("SW1A 1AA");
    expect(cleanPostal("1012-ab!", false)).toBe("1012-AB");
  });

  it("Türkiye'de kutuya yerel maxLength VERİLMEZ (tarayıcı metni ayıklamadan önce keser); diğer ülkede çağıranın sınırı", () => {
    expect(postalInputMaxLength(true, 12)).toBeUndefined();
    expect(postalInputMaxLength(true, 20)).toBeUndefined();
    expect(postalInputMaxLength(false, 12)).toBe(12);
    expect(postalInputMaxLength(false, 20)).toBe(20);
  });

  it("TR posta kodu denetimi: boş serbest, beş rakam geçerli", () => {
    expect(isInvalidTrPostal("")).toBe(false);
    expect(isInvalidTrPostal("34710")).toBe(false);
    expect(isInvalidTrPostal("3471")).toBe(true);
  });
});
