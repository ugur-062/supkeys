/**
 * "Katalogdan ürün ekle (AI)" — kullanıcının YÜKLEDİĞİ katalogdan ürün
 * çıkarımı.
 *
 * Kilitlenen ana iddialar:
 *  · uç HİÇBİR ŞEY YAZMAZ (yazma ayrı onay adımı — `items/import/commit`),
 *  · model KATEGORİ KODU üretemez: kod ipucundan DEĞİL, katalogda ARANARAK
 *    bulunur; bulunamazsa alan boş kalır ve satır uyarı taşır,
 *  · başka firmanın dosya anahtarı reddedilir (IDOR),
 *  · çıktı Excel yoluyla AYNI sözleşme (`ProductImportResult`).
 */
import { BadRequestException } from "@nestjs/common";
import { foldSearchText } from "@rothern/shared";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { ProductExtractService } from "../../src/modules/ai/product-extract/product-extract.service";
import type { AiConfig } from "../../src/modules/ai/ai.config";
import type { AiService } from "../../src/modules/ai/ai.service";
import type { StorageService } from "../../src/modules/storage/storage.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

/** Katalog CSV'si — TEXT yoluna düşer (vision gerekmez). */
const CATALOG_CSV = "Ürün;Açıklama\nDağıtım panosu 400A;IP54 pano\n";

function rig(modelJson: unknown, opts: { csv?: string } = {}) {
  const callAi = jest.fn().mockResolvedValue({
    text: JSON.stringify(modelJson),
    downgraded: false,
    warned: false,
    finishReason: "STOP",
  });
  const storage = {
    checkExists: jest.fn().mockResolvedValue({ exists: true, size: 128 }),
    getObject: jest
      .fn()
      .mockResolvedValue(Buffer.from(opts.csv ?? CATALOG_CSV, "utf8")),
    deleteObject: jest.fn(),
  };
  const service = new ProductExtractService(
    { assertAiAccess: jest.fn(), callAi } as unknown as AiService,
    storage as unknown as StorageService,
    prisma as unknown as PrismaService,
    { maxPages: 20 } as AiConfig,
  );
  return { service, callAi, storage };
}

async function makeCategory(code: string, nameTr: string, level: number) {
  await prisma.category.create({
    data: {
      id: code, code, nameTr, keywords: "",
      searchText: foldSearchText(nameTr),
      level, parentId: null, isActive: true, sortOrder: 0,
    },
  });
}

const key = (companyId: string) => `ai-extract/${companyId}/abc-katalog.csv`;

describe("katalogdan ürün çıkarımı", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("hiçbir şey YAZMAZ — yalnız önizleme döner", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    const { service } = rig({ products: [{ name: "Dağıtım panosu 400A" }] });
    const res = await service.extract(auth, { fileKeys: [key(auth.companyId)] });
    expect(res.rows).toHaveLength(1);
    expect(await prisma.companyItem.count()).toBe(0);
  });

  it("kategori ipucu KATALOGDA aranır — kod modelden gelmez", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    await makeCategory("39121000", "Dağıtım panoları", 3);
    const { service } = rig({
      products: [
        { name: "Pano 400A", categoryHint: "dağıtım panoları" },
        // Model kod yazmaya çalışsa bile ipucu reddedilir (uydurma kod sızmaz).
        { name: "Pano 250A", categoryHint: "39121999" },
        { name: "Ne olduğu belirsiz", categoryHint: "zümrüt anka kuşu" },
      ],
    });
    const res = await service.extract(auth, { fileKeys: [key(auth.companyId)] });
    expect(res.rows[0].categoryId).toBe("39121000");
    expect(res.rows[0].issues[0]).toContain("Dağıtım panoları");
    expect(res.rows[1].categoryId).toBeNull();
    expect(res.rows[2].categoryId).toBeNull();
    expect(res.rows[2].issues[0]).toContain("Kategori bulunamadı");
    expect(res.notices.some((n) => n.includes("kategori katalogda bulunamadı"))).toBe(true);
  });

  it("başka firmanın dosya anahtarını reddeder", async () => {
    const a = await makeCompanyWithUser(prisma);
    const b = await makeCompanyWithUser(prisma);
    const { service, storage } = rig({ products: [{ name: "X" }] });
    await expect(
      service.extract(a.auth, { fileKeys: [key(b.auth.companyId)] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Reddedilen istek dosyayı OKUMAZ bile.
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it("ürün bulunamazsa açık hata verir (boş önizleme göstermez)", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    const { service } = rig({ products: [] });
    await expect(
      service.extract(auth, { fileKeys: [key(auth.companyId)] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("fiyatı okunamayan ürün TEKLİF İSTEYİN olur — uydurulmaz", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    const { service } = rig({
      products: [{ name: "Kablo 3x2.5", priceMode: "FIXED", price: null }],
    });
    const res = await service.extract(auth, { fileKeys: [key(auth.companyId)] });
    expect(res.rows[0].priceMode).toBe("ON_REQUEST");
    expect(res.rows[0].price).toBeNull();
  });

  it("görsellerin aktarılmadığını ve taslak kaldığını açıkça söyler", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    const { service } = rig({ products: [{ name: "Pano" }] });
    const res = await service.extract(auth, { fileKeys: [key(auth.companyId)] });
    expect(res.notices.some((n) => n.includes("TASLAK"))).toBe(true);
  });
});
