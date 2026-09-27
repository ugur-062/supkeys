import { generateSlug, listingPath, slugifyText } from "@rothern/shared";
import { ensureUniqueCompanySlug, pickFreeSlug } from "../../src/common/company/company-slug";

/**
 * Kayıt tüm ülkelere açıldı (2026-09-27): Türkçe dışı adlar da okunur slug
 * üretmeli; Türkçe girdinin slug'ı BİREBİR aynı kalmalı (mevcut slug'lar donuk).
 */
describe("slugifyText / generateSlug — çeviriyazı", () => {
  it("Türkçe davranış değişmez", () => {
    expect(slugifyText("Çelik Boru Alımı")).toBe("celik-boru-alimi");
    expect(slugifyText("İSTANBUL Çelik ğüşö")).toBe("istanbul-celik-guso");
    expect(generateSlug("ABC Tekstil A.Ş.")).toBe("abc-tekstil");
    expect(generateSlug("Demo Şirket Ltd. Şti.")).toBe("demo-sirket");
  });

  it("Kiril (Rusça, Ukraynaca, Kazakça)", () => {
    expect(generateSlug("ООО Ромашка")).toBe("ooo-romashka");
    expect(slugifyText("Щука Жёлтый")).toBe("shchuka-zheltyy");
    expect(slugifyText("Київ Ґанок")).toBe("kiyiv-ganok");
    expect(slugifyText("Қазақстан Өнім")).toBe("kazakstan-onim");
  });

  it("Almanca, Lehçe, İskandinav ve aksanlı Latin", () => {
    expect(slugifyText("Großhandel")).toBe("grosshandel");
    expect(slugifyText("Łódź Møller")).toBe("lodz-moller");
    expect(slugifyText("Crème Brûlée Ñandú Ærø")).toBe("creme-brulee-nandu-aero");
  });

  it("çeviriyazısı olmayan yazı boş döner; Latin parça korunur", () => {
    expect(slugifyText("深圳华强电子有限公司")).toBe("");
    expect(slugifyText("مرحبا")).toBe("");
    expect(generateSlug("東京 Trading Co.")).toBe("trading-co");
  });

  it("boş başlıklı talep adresi yalnız numara taşır (sonda tire yok)", () => {
    expect(listingPath("ROT-000042", "深圳采购")).toBe("/talep/rot-000042");
    expect(listingPath("ROT-000042", "Трубы стальные")).toBe("/talep/rot-000042-truby-stalnye");
  });
});

describe("pickFreeSlug — tek sorgu", () => {
  it("boş adayı seçer, tek çağrı yapar", async () => {
    const taken = jest.fn(async (c: string[]) => c.filter((s) => s === "abc" || s === "abc-2"));
    await expect(pickFreeSlug("abc", taken)).resolves.toBe("abc-3");
    expect(taken).toHaveBeenCalledTimes(1);
  });
  it("hepsi doluysa zamana düşer", async () => {
    const out = await pickFreeSlug("abc", async (c) => c);
    expect(out).toMatch(/^abc-[0-9a-z]+$/);
    expect(out).not.toBe("abc-51");
  });
});

describe("ensureUniqueCompanySlug — Latin olmayan ad", () => {
  function db(rothernId: string | null, taken: string[] = []) {
    return {
      company: {
        findUnique: jest.fn(async () => ({ rothernId })),
        findMany: jest.fn(async ({ where }: { where: { slug: { in: string[] } } }) =>
          where.slug.in.filter((s) => taken.includes(s)).map((slug) => ({ slug })),
        ),
      },
    };
  }

  it("Çince ad → Rothern ID tabanlı slug (Türkçe 'firma' değil)", async () => {
    const d = db("AB12-CD34");
    await expect(ensureUniqueCompanySlug(d as never, "深圳华强电子有限公司", "c1")).resolves.toBe("company-ab12-cd34");
    expect(d.company.findMany).toHaveBeenCalledTimes(1);
  });

  it("Rus ad çeviriyazıyla; çakışmada ek alır", async () => {
    const d = db("X", ["ooo-romashka"]);
    await expect(ensureUniqueCompanySlug(d as never, "ООО Ромашка", "c1")).resolves.toBe("ooo-romashka-2");
    expect(d.company.findUnique).not.toHaveBeenCalled();
  });

  it("Rothern ID yoksa kayıt kimliğine düşer", async () => {
    const d = db(null);
    await expect(ensureUniqueCompanySlug(d as never, "مرحبا", "clabcdefgh12345678")).resolves.toBe("company-12345678");
  });
});
