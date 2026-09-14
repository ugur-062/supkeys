import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  MAX_COMPANY_MAIN_CATEGORIES,
  MAX_COMPANY_SUB_CATEGORIES,
  MAX_COMPANY_SUB_PICKS,
} from "@rothern/shared";
import { CompleteOnboardingDto } from "../../src/modules/company-auth/dto/onboarding.dto";
import { UpdateCompanyProfileDto } from "../../src/modules/company-profile/dto/update-company-profile.dto";
import { validateCategorySelection } from "../../src/common/helpers/category-selection.helper";
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

    it("sıfır ana kategoriyi REDDEDER — eşleşme sinyali olmadan firma sessiz kalır", async () => {
      await expect(
        validateCategorySelection(sahtePrisma(), [], yapraklar(3)),
      ).rejects.toThrow();
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
