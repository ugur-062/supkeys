import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  MAX_COMPANY_MAIN_CATEGORIES,
  MAX_COMPANY_SUB_CATEGORIES,
  MAX_COMPANY_SUB_PICKS,
  expandCompanyCategorySelection,
} from "@rothern/shared";
import { CompleteOnboardingDto } from "../../src/modules/company-auth/dto/onboarding.dto";
import { UpdateCompanyProfileDto } from "../../src/modules/company-profile/dto/update-company-profile.dto";
import {
  normalizeCategorySelection,
  validateCategorySelection,
} from "../../src/common/helpers/category-selection.helper";
import type { PrismaService } from "../../src/common/prisma/prisma.service";

/**
 * FİRMA KATEGORİ TAVANI — TEK SAYI, ÜÇ KAPI.
 *
 * BULGU (2026-09-14): ana kategori tavanı ÜÇ AYRI değerdi —
 *   · kayıt DTO'su ..................... 3
 *   · ayarlar ekranı ................... 10 (prop hiç geçilmemiş, varsayılan)
 *   · ayarlar DTO'su ................... 50
 * Sonuç: `validateCategorySelection`'ın "1-3" kuralı ayarlar yolunda HİÇ
 * çalışmıyordu ve kayıtta 3'e sıkışan firma ayarlardan 50 segment yazıp
 * bildirim havuzunu şişirebiliyordu.
 *
 * Bu dosya sayıyı değil İLİŞKİYİ kilitler: üç kapı da shared'deki AYNI sabiti
 * okumak zorunda. Tavan değişirse testler değişmeden yeşil kalır; kapılardan
 * biri kendi sayısına dönerse kırmızı olur.
 */

/** `findMany`/`count` dışını çağırmayan sahte Prisma — DB gerekmez. */
function sahtePrisma(): PrismaService {
  return {
    category: {
      findMany: ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          where.id.in.map((id) => ({ id, nameTr: `Kategori ${id}` })),
        ),
      count: ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.length),
    },
  } as unknown as PrismaService;
}

/** N tane sahte segment kodu (XX000000 biçimi zorunlu değil, doğrulama sahte). */
const segmentler = (n: number) =>
  Array.from({ length: n }, (_, i) => `${String(10 + i)}000000`);
/**
 * n adet AYRI yaprak. Aynı sınıfın altında toplanmasınlar diye sınıf hanesi
 * de değişiyor — `deepestCategoryPicks` ata olanları eleyeceği için aksi hâlde
 * seçim sayısı beklenenden az çıkardı.
 */
const yapraklar = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const sinif = String(10 + Math.floor(i / 90)).padStart(2, "0");
    const yaprak = String((i % 90) + 10);
    return `39${sinif}${yaprak}01`;
  });

async function hatalar(cls: new () => object, payload: object, alan: string) {
  const errs = await validate(plainToInstance(cls, payload));
  return errs.filter((e) => e.property === alan);
}

describe("Firma kategori tavanı — tek kaynak", () => {
  describe("validateCategorySelection (servis kapısı)", () => {
    it("tavan kadar ana kategoriyi KABUL eder", async () => {
      const r = await validateCategorySelection(
        sahtePrisma(),
        segmentler(MAX_COMPANY_MAIN_CATEGORIES),
        [],
      );
      expect(r.mainIds).toHaveLength(MAX_COMPANY_MAIN_CATEGORIES);
    });

    it("tavanın bir fazlasını REDDEDER", async () => {
      await expect(
        validateCategorySelection(
          sahtePrisma(),
          segmentler(MAX_COMPANY_MAIN_CATEGORIES + 1),
          [],
        ),
      ).rejects.toThrow(new RegExp(`1-${MAX_COMPANY_MAIN_CATEGORIES}`));
    });

    it("sıfır kategoriyi REDDEDER — eşleşme sinyali olmadan firma sessiz kalır", async () => {
      await expect(
        validateCategorySelection(sahtePrisma(), [], []),
      ).rejects.toThrow(new RegExp(`1-${MAX_COMPANY_MAIN_CATEGORIES}`));
    });

    it("ana liste boş gelse de alt kodların segmenti türetilir (code-category-8)", async () => {
      // Eskiden reddediliyordu; artık sunucu web ile aynı dönüşümü uygular ve
      // alt kodun segmenti ana eksene yazılır — firma yine sessiz kalmaz.
      const r = await validateCategorySelection(sahtePrisma(), [], yapraklar(3));
      expect(r.mainIds).toEqual(["39000000"]);
    });

    it("SEÇİM tavanını uygular — depolama tavanından ayrı", async () => {
      await expect(
        validateCategorySelection(
          sahtePrisma(),
          segmentler(1),
          yapraklar(MAX_COMPANY_SUB_PICKS + 1),
        ),
      ).rejects.toThrow(new RegExp(String(MAX_COMPANY_SUB_PICKS)));
    });

    it("tavan kadar seçim GEÇER — ata zinciri seçim sayılmaz", async () => {
      // Her yaprak L2+L3+L4 olarak saklanır; 50 seçim ~150 kayıt eder ve
      // DEPOLAMA tavanının (200) altında kalır. Tek sayı kullanılsaydı bu
      // koşum anlamsız bir hatayla düşerdi.
      const secim = yapraklar(MAX_COMPANY_SUB_PICKS);
      const depo = [
        ...new Set(secim.flatMap((c) => [c, `${c.slice(0, 6)}00`, `${c.slice(0, 4)}0000`])),
      ];
      expect(depo.length).toBeLessThanOrEqual(MAX_COMPANY_SUB_CATEGORIES);
      const r = await validateCategorySelection(sahtePrisma(), segmentler(1), depo);
      expect(r.subIds.length).toBe(depo.length);
    });

    it("yinelenen kod tavanı boşa harcamaz (tekilleştirme ÖNCE)", async () => {
      const tek = segmentler(1)[0];
      const r = await validateCategorySelection(
        sahtePrisma(),
        Array(MAX_COMPANY_MAIN_CATEGORIES + 3).fill(tek),
        [],
      );
      expect(r.mainIds).toEqual([tek]);
    });
  });

  /**
   * code-category-8: ata zinciri ve segment türetimi yalnız tarayıcıdaydı.
   * Sunucu artık aynı dönüşümü (shared `expandCompanyCategorySelection`)
   * tavan denetimlerinden ÖNCE uygular.
   */
  describe("sunucu dönüşümü — normalizeCategorySelection (code-category-8)", () => {
    it("zincirsiz yaprak: L2 + L3 alt listeye, segment ana listeye eklenir", () => {
      expect(normalizeCategorySelection([], ["39121614"])).toEqual({
        mainIds: ["39000000"],
        subIds: ["39121614", "39120000", "39121600"],
      });
    });

    it("alt kodun segmenti ana listede yoksa eklenir, gelen segment korunur", () => {
      const r = normalizeCategorySelection(["11000000"], ["39121614"]);
      expect(r.mainIds).toEqual(["11000000", "39000000"]);
    });

    it("web'in gönderdiği (zaten tam) beyan AYNEN kalır — sıra dahil", () => {
      // Web: sektör geneli segment önce, sonra seçimlerin zinciri sırayla.
      const web = expandCompanyCategorySelection(
        ["39121614", "40141600", "39121615", "31171500"],
        ["23000000"],
      );
      expect(normalizeCategorySelection(web.mainIds, web.subIds)).toEqual(web);
      // Atası torundan SONRA yazılmış tam liste de yeniden sıralanmaz.
      const ters = ["39121614", "39121600", "39120000"];
      expect(normalizeCategorySelection(["39000000"], ters).subIds).toEqual(ters);
    });

    it("geçersiz kod ve alt listedeki segment ATILMAZ — doğrulama reddetsin diye kalır", () => {
      const r = normalizeCategorySelection(["39120000", "x1"], ["abc", "40000000", "39121600"]);
      expect(r.mainIds).toEqual(["39120000", "x1", "39000000"]);
      expect(r.subIds).toEqual(["abc", "40000000", "39121600", "39120000"]);
    });

    it("servis kapısı dönüşmüş listeyi döner ve saklatır", async () => {
      const r = await validateCategorySelection(sahtePrisma(), ["11000000"], ["39121614"]);
      expect(r.mainIds).toEqual(["11000000", "39000000"]);
      expect(r.subIds).toEqual(["39121614", "39120000", "39121600"]);
      expect(r.mainNames).toHaveLength(2);
    });

    it("ana kategori tavanı TÜRETİLEN segmentlerle birlikte sayılır", async () => {
      // 5 segment + başka segmentte bir yaprak = 6 → DTO geçer, servis reddeder.
      await expect(
        validateCategorySelection(
          sahtePrisma(),
          segmentler(MAX_COMPANY_MAIN_CATEGORIES),
          ["39121614"],
        ),
      ).rejects.toThrow(new RegExp(`1-${MAX_COMPANY_MAIN_CATEGORIES}`));
    });

    it("depolama tavanı zincir EKLENDİKTEN sonra ölçülür", async () => {
      // Seçim tavanını aşmayan ama zinciriyle depolama tavanını aşan beyan
      // kurulamaz (50 seçim × 3 = 150 < 200); tersini kilitle: tavan kadar
      // zincirsiz yaprak, zinciriyle birlikte tavanın ALTINDA saklanır.
      const secim = yapraklar(MAX_COMPANY_SUB_PICKS);
      const r = await validateCategorySelection(sahtePrisma(), [], secim);
      expect(r.subIds.length).toBeGreaterThan(secim.length);
      expect(r.subIds.length).toBeLessThanOrEqual(MAX_COMPANY_SUB_CATEGORIES);
      for (const c of secim) {
        expect(r.subIds).toEqual(
          expect.arrayContaining([c, `${c.slice(0, 6)}00`, `${c.slice(0, 4)}0000`]),
        );
      }
    });
  });

  describe("DTO kapıları — kayıt ve ayarlar AYNI sayıyı uygular", () => {
    const taban = {
      legalName: "Örnek Ltd.",
      companyType: "LIMITED",
      country: "TR",
      taxNumber: "1234567890",
      city: "İstanbul",
      addressLine: "Moda Cad. No:1",
      declarationAccepted: true,
    };

    it("kayıt: tavan kadar geçer, bir fazlası düşer", async () => {
      expect(
        await hatalar(
          CompleteOnboardingDto,
          { ...taban, mainCategoryIds: segmentler(MAX_COMPANY_MAIN_CATEGORIES) },
          "mainCategoryIds",
        ),
      ).toHaveLength(0);
      expect(
        await hatalar(
          CompleteOnboardingDto,
          {
            ...taban,
            mainCategoryIds: segmentler(MAX_COMPANY_MAIN_CATEGORIES + 1),
          },
          "mainCategoryIds",
        ),
      ).toHaveLength(1);
    });

    it("ayarlar: ANA kategori artık 50'ye kadar kabul ETMEZ — kayıtla aynı tavan", async () => {
      for (const alan of ["buyerCategoryIds", "sellerCategoryIds"] as const) {
        expect(
          await hatalar(
            UpdateCompanyProfileDto,
            { [alan]: segmentler(MAX_COMPANY_MAIN_CATEGORIES) },
            alan,
          ),
        ).toHaveLength(0);
        expect(
          await hatalar(
            UpdateCompanyProfileDto,
            { [alan]: segmentler(MAX_COMPANY_MAIN_CATEGORIES + 1) },
            alan,
          ),
        ).toHaveLength(1);
      }
    });

    it("alt kategori DEPOLAMA tavanı iki DTO'da da aynı", async () => {
      expect(
        await hatalar(
          CompleteOnboardingDto,
          {
            ...taban,
            mainCategoryIds: segmentler(1),
            subCategoryIds: yapraklar(MAX_COMPANY_SUB_CATEGORIES + 1),
          },
          "subCategoryIds",
        ),
      ).toHaveLength(1);
      expect(
        await hatalar(
          UpdateCompanyProfileDto,
          { sellerSubCategoryIds: yapraklar(MAX_COMPANY_SUB_CATEGORIES + 1) },
          "sellerSubCategoryIds",
        ),
      ).toHaveLength(1);
    });
  });
});
