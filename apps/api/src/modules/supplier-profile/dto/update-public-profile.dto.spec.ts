import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdatePublicProfileDto } from "./update-public-profile.dto";

/**
 * V2-PUBLIC-PROFILE — DTO validation testleri.
 *
 * NOT: apps/api'da şu an Jest yüklü değil (test paketi V2-7 refactor'da kırık).
 * Test runner kurulduğunda bu spec çalıştırılabilir hale gelir — DTO contract'ı
 * kalıcı şekilde belgelemek için bırakıldı.
 *
 * Bug fix regression: kullanıcı boş URL alanlarıyla "Kaydet" tıkladığında @IsUrl
 * reddediyordu; EmptyToUndefined transform'u boşluğu undefined'a çevirir.
 */
async function expectValid(payload: Partial<UpdatePublicProfileDto>) {
  const dto = plainToInstance(UpdatePublicProfileDto, payload);
  const errors = await validate(dto);
  return errors;
}

describe("UpdatePublicProfileDto", () => {
  describe("URL alanları", () => {
    it("boş string'i hata olmadan kabul eder (kullanıcı alanı temizleyebilir)", async () => {
      const errors = await expectValid({
        website: "",
        linkedinUrl: "",
        instagramUrl: "",
      });
      expect(errors).toEqual([]);
    });

    it("sadece whitespace'i hata olmadan kabul eder", async () => {
      const errors = await expectValid({ website: "   " });
      expect(errors).toEqual([]);
    });

    it("geçerli https URL'i kabul eder", async () => {
      const errors = await expectValid({
        website: "https://example.com",
        linkedinUrl: "https://linkedin.com/company/abc",
      });
      expect(errors).toEqual([]);
    });

    it("protokolsüz URL'i reddeder (require_protocol)", async () => {
      const errors = await expectValid({ website: "example.com" });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe("website");
    });

    it("geçersiz string'i reddeder", async () => {
      const errors = await expectValid({ website: "not a url" });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("slug", () => {
    it("boş string'i kabul eder (silme niyeti)", async () => {
      const errors = await expectValid({ slug: "" });
      expect(errors).toEqual([]);
    });

    it("küçük harf + rakam + tire kombinasyonunu kabul eder", async () => {
      const errors = await expectValid({ slug: "abc-tekstil-2026" });
      expect(errors).toEqual([]);
    });

    it("büyük harf veya boşluk içeren slug'ı reddeder", async () => {
      const errors = await expectValid({ slug: "ABC Firma" });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe("slug");
    });

    it("Türkçe karakter içeren slug'ı reddeder", async () => {
      const errors = await expectValid({ slug: "şirket" });
      expect(errors.length).toBeGreaterThan(0);
    });

    it("60 karakterden uzun slug'ı reddeder", async () => {
      const errors = await expectValid({ slug: "a".repeat(61) });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("services", () => {
    it("max 20 etikete izin verir", async () => {
      const errors = await expectValid({
        services: Array.from({ length: 20 }, (_, i) => `Hizmet-${i}`),
      });
      expect(errors).toEqual([]);
    });

    it("21+ etiketi reddeder", async () => {
      const errors = await expectValid({
        services: Array.from({ length: 21 }, (_, i) => `Hizmet-${i}`),
      });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("aboutText", () => {
    it("boş string'i kabul eder", async () => {
      const errors = await expectValid({ aboutText: "" });
      expect(errors).toEqual([]);
    });

    it("2000 karakter limit'i içinde geçerli", async () => {
      const errors = await expectValid({ aboutText: "a".repeat(2000) });
      expect(errors).toEqual([]);
    });

    it("2001+ karakteri reddeder", async () => {
      const errors = await expectValid({ aboutText: "a".repeat(2001) });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("publicEnabled", () => {
    it("true kabul eder", async () => {
      const errors = await expectValid({ publicEnabled: true });
      expect(errors).toEqual([]);
    });
    it("false kabul eder", async () => {
      const errors = await expectValid({ publicEnabled: false });
      expect(errors).toEqual([]);
    });
  });

  describe("Bug fix regression — gerçekçi tam form payload'u", () => {
    it("kullanıcı tüm URL alanlarını boş bırakıp kaydet'e basabilir", async () => {
      const errors = await expectValid({
        slug: "demo-firma",
        publicEnabled: true,
        aboutText: "Bir tedarikçi firmasıyız.",
        services: ["Tekstil"],
        website: "",
        linkedinUrl: "",
        instagramUrl: "",
      });
      expect(errors).toEqual([]);
    });
  });
});
