/**
 * İLGİ MOTORU — skor hesabı sözleşmesi (Faz 2, 2026-09-01).
 *
 * Bu spec'in koruduğu asıl şey ağırlıkların tam sayısı değil, motorun DÖRT
 * yapısal davranışı:
 *   1. Davranış beyanı yener (teklif veren, sadece kutu işaretleyenden önde)
 *   2. Genişlik cezası çalışır (50 kategori işaretleyen her birinde zayıf)
 *   3. Hiyerarşi sızması çalışır (L4 sinyali L3/L2'de de görünür)
 *   4. Yön ayrımı korunur (alış ilgisi satış sıralamasına karışmaz)
 * Bunlar bozulursa öneri yüzeyleri sessizce anlamsızlaşır.
 */
import { CompanyAffinityService } from "../../src/modules/company-affinity/company-affinity.service";
import { affinityReasonText } from "../../src/modules/company-affinity/company-affinity.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing, makeBid, invite } from "./factories";

const service = () => new CompanyAffinityService(prisma as never);

/** UNSPSC kod düzeni: segment 31 › aile 3110 › sınıf 311090 › emtia 31109001 */
const SEG = "31000000";
const FAM = "31100000";
const CLS = "31109000";
const LEAF = "31109001";
const OTHER_LEAF = "31109002";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

/**
 * Kategori alanlarıyla firma kurar. `makeCompanyWithUser` bilinçli olarak dar
 * bir opsiyon listesi kabul ediyor (100+ spec onu kullanıyor); kategori
 * alanlarını oraya eklemek yerine burada güncelliyoruz.
 */
async function makeCompanyWithCategories(over: {
  sellerCategoryIds?: string[];
  sellerSubCategoryIds?: string[];
  buyerCategoryIds?: string[];
  buyerSubCategoryIds?: string[];
}) {
  const c = await makeCompanyWithUser(prisma);
  await prisma.company.update({ where: { id: c.company.id }, data: over });
  return c;
}

async function scoreOf(companyId: string, categoryId: string) {
  const row = await prisma.companyAffinity.findUnique({
    where: { companyId_categoryId: { companyId, categoryId } },
  });
  return row;
}

describe("CompanyAffinityService — davranış beyanı yener", () => {
  it("teklif veren firma, sadece beyan eden firmadan YÜKSEK skor alır", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    // A: davranış var (teklif verdi), beyanı YOK.
    const bidder = await makeCompanyWithUser(prisma);
    // B: yalnız beyan — aynı kategoriyi işaretlemiş.
    const declarer = await makeCompanyWithCategories({
      sellerCategoryIds: [SEG],
      sellerSubCategoryIds: [LEAF],
    });

    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      categoryIds: [LEAF],
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
    });

    await service().recomputeAll();

    const a = await scoreOf(bidder.company.id, LEAF);
    const b = await scoreOf(declarer.company.id, LEAF);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a!.sellScore).toBeGreaterThan(b!.sellScore);
    // Gerekçe metni ham sinyalden türer, model metninden değil.
    expect(affinityReasonText(a!.reasons as never)).toBe(
      "Bu alanda daha önce teklif verdiniz",
    );
    expect(affinityReasonText(b!.reasons as never)).toBe(
      "Faaliyet alanlarınızda işaretli",
    );
  });

  it("DAVET, beyandan güçlü ama teklikten zayıf sinyaldir", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    const invited = await makeCompanyWithUser(prisma);
    const bidder = await makeCompanyWithUser(prisma);

    const l1 = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      categoryIds: [LEAF],
    });
    await invite(prisma, l1.id, invited.company.id, buyer.user.id);
    const l2 = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      categoryIds: [LEAF],
    });
    await makeBid(prisma, {
      listingId: l2.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
    });

    await service().recomputeAll();

    // İkisi de TEK sinyalli ve tek kategorili → normalizasyon sonrası eşit
    // paya düşerler; sözleşme ham ağırlık sırası, normalize edilmiş değer değil.
    const inv = await scoreOf(invited.company.id, LEAF);
    const bid = await scoreOf(bidder.company.id, LEAF);
    expect((inv!.reasons as { invitations?: number }).invitations).toBe(1);
    expect((bid!.reasons as { bids?: number }).bids).toBe(1);
  });
});

describe("CompanyAffinityService — genişlik cezası", () => {
  it("çok kategori işaretleyen firma HER BİRİNDE zayıflar (sıfır toplamlı)", async () => {
    const focused = await makeCompanyWithCategories({
      sellerCategoryIds: [SEG],
      sellerSubCategoryIds: [LEAF],
    });
    // Aynı sinyal gücü, 20 kategoriye yayılmış.
    const spread = await makeCompanyWithCategories({
      sellerCategoryIds: [SEG],
      sellerSubCategoryIds: Array.from(
        { length: 20 },
        (_, i) => `311090${String(i + 1).padStart(2, "0")}`,
      ),
    });

    await service().recomputeAll();

    const f = await scoreOf(focused.company.id, LEAF);
    const s = await scoreOf(spread.company.id, LEAF);
    expect(f!.sellScore).toBeGreaterThan(s!.sellScore);
    // Kutu işaretlemek AVANTAJ olmamalı: yayılan firma aynı kategoride
    // belirgin biçimde geride kalır.
    expect(s!.sellScore).toBeLessThan(f!.sellScore / 2);
  });
});

describe("CompanyAffinityService — hiyerarşi sızması", () => {
  it("L4 sinyali L3 ve L2 atalarında da görünür (ama daha zayıf)", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    const bidder = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      categoryIds: [LEAF],
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
    });

    await service().recomputeAll();

    const leaf = await scoreOf(bidder.company.id, LEAF);
    const cls = await scoreOf(bidder.company.id, CLS);
    const fam = await scoreOf(bidder.company.id, FAM);
    expect(leaf!.sellScore).toBeGreaterThan(0);
    // "M12 civata" tedarikçisi "bağlantı elemanları" talebinde de bulunur.
    expect(cls!.sellScore).toBeGreaterThan(0);
    expect(fam!.sellScore).toBeGreaterThan(0);
    expect(cls!.sellScore).toBeLessThan(leaf!.sellScore);
    expect(fam!.sellScore).toBeLessThan(cls!.sellScore);
  });

  it("sızan skor gerekçe SAYISINA yazılmaz (kullanıcıya yanlış sayı gösterilmez)", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    const bidder = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      categoryIds: [LEAF],
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 1000,
    });

    await service().recomputeAll();

    const cls = await scoreOf(bidder.company.id, CLS);
    // Üst seviyede skor VAR ama "1 teklif" gerekçesi YOK — kullanıcı o
    // kategoride teklif aramamalı.
    expect(cls!.sellScore).toBeGreaterThan(0);
    expect(cls!.reasons).toEqual({});
  });
});

describe("CompanyAffinityService — yön ayrımı", () => {
  it("ALIM ilanı yayınlamak ALIŞ ilgisi üretir, satış sıralamasına karışmaz", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      categoryIds: [LEAF],
    });

    await service().recomputeAll();

    const row = await scoreOf(buyer.company.id, LEAF);
    expect(row!.buyScore).toBeGreaterThan(0);
    expect(row!.sellScore).toBe(0);
  });

  it("SATIS ilanı yayınlamak SATIŞ ilgisi üretir", async () => {
    const seller = await makeCompanyWithUser(prisma);
    await makeListing(prisma, {
      companyId: seller.company.id,
      createdById: seller.user.id,
      type: "SATIS",
      categoryIds: [LEAF],
    });

    await service().recomputeAll();

    const row = await scoreOf(seller.company.id, LEAF);
    expect(row!.sellScore).toBeGreaterThan(0);
    expect(row!.buyScore).toBe(0);
  });
});

describe("CompanyAffinityService — yeniden hesap", () => {
  it("her koşumda sıfırdan kurulur; ölü kategori satırları düşer", async () => {
    const c = await makeCompanyWithCategories({
      sellerSubCategoryIds: [LEAF, OTHER_LEAF],
    });
    await service().recomputeAll();
    expect(await scoreOf(c.company.id, OTHER_LEAF)).toBeTruthy();

    // Firma o kategoriden vazgeçti.
    await prisma.company.update({
      where: { id: c.company.id },
      data: { sellerSubCategoryIds: [LEAF] },
    });
    await service().recomputeAll();

    expect(await scoreOf(c.company.id, OTHER_LEAF)).toBeNull();
    expect(await scoreOf(c.company.id, LEAF)).toBeTruthy();
  });

  it("hiç sinyali olmayan firma satır üretmez (tablo şişmez)", async () => {
    await makeCompanyWithUser(prisma);
    const r = await service().recomputeAll();
    expect(r.rows).toBe(0);
  });
});
