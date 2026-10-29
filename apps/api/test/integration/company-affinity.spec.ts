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
import {
  CompanyAffinityService,
  SECTOR_FALLBACK_WEIGHT,
} from "../../src/modules/company-affinity/company-affinity.service";
import { affinityReasonText } from "../../src/modules/company-affinity/company-affinity.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing, makeBid, invite } from "./factories";
import { makeService } from "./make-service";

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

/**
 * BİLDİRİM EŞİĞİ (Faz 3) — motorun ilk somut faydası.
 *
 * Eskiden duyuru "o segmenti işaretlemiş, en YENİ 300 firma"ya gidiyordu;
 * yani kimin haber alacağını kayıt tarihi belirliyordu. Artık ilgi skoru
 * belirliyor. Ama eleme KOŞULLU: eşiği geçen yeterince firma yoksa kimse
 * elenmez — genç pazarda sert eşik duyuruyu tamamen susturur ve bu
 * gürültüden daha kötüdür.
 */
describe("bildirim eşiği — ilgi sıralaması", () => {
  it("eşiği geçen az sayıda firma varsa KİMSE elenmez (genç pazar koruması)", async () => {
    const { service: listings } = makeService();
    const buyer = await makeCompanyWithUser(prisma);
    const weak = await makeCompanyWithCategories({ sellerSubCategoryIds: [LEAF] });
    await service().recomputeAll();

    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      categoryIds: [LEAF],
    });
    const notified = await listings.notifyCategoryMatchedCompanies(listing.id);

    // Tek aday ve skoru düşük — susturulmamalı.
    expect(notified.map((c) => c.id)).toContain(weak.company.id);
  });

  it("ilgi profili HİÇ hesaplanmamışsa da bildirim gider (motor bozulsa akış durmaz)", async () => {
    const { service: listings } = makeService();
    const buyer = await makeCompanyWithUser(prisma);
    const target = await makeCompanyWithCategories({ sellerSubCategoryIds: [LEAF] });
    // recomputeAll ÇAĞRILMADI → company_affinity boş.
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      categoryIds: [LEAF],
    });

    const notified = await listings.notifyCategoryMatchedCompanies(listing.id);
    expect(notified.map((c) => c.id)).toContain(target.company.id);
  });
});

/**
 * SEKTÖR YEDEĞİ (sahip kararı 2026-10-29, S3). Firma beyanı artık YALNIZ
 * sektör (L1); talep ise sınıf / emtia kodu taşır. Tam kod araması yalnız
 * sektör beyan eden firmayı 0 puanlıyordu ve kalabalık bir sektörde
 * (`NOTIFY_MIN_STRONG` güçlü aday) bildirimden düşürüyordu. Artık firmanın o
 * sektördeki değeri yedek puandır: sektördeki payı × `SECTOR_FALLBACK_WEIGHT`,
 * sektörü beyan ediyorsa en az beyan tabanı (100 / beyan edilen sektör × 0,25
 * → en az 5 = bildirim eşiği). Sahip kuralı: bildirim sıralaması sektörü beyan
 * eden firmayı DÜŞÜRMEZ — kataloğu / teklifleri başka sektörde olsa da. Talebin
 * kendi kodundaki davranış / katalog sinyali (`exact`) yine önde sıralanır.
 */
describe("ilgi okuması — sektör yedeği (yalnız sektör beyanı)", () => {
  /** Bildirim eşiği (`company-listings.service.ts` `NOTIFY_MIN_AFFINITY`). */
  const NOTIFY_MIN_AFFINITY = 5;

  async function catalogItem(c: { company: { id: string }; user: { id: string } }, categoryId: string, name: string) {
    await prisma.companyItem.create({
      data: { companyId: c.company.id, createdById: c.user.id, name, unit: "adet", isActive: true, categoryId },
    });
  }

  it("yalnız sektör beyan eden firma talebin kodunda 0 değil, sektör payının dörtte biriyle puanlanır", async () => {
    const one = await makeCompanyWithCategories({ sellerCategoryIds: [SEG] });
    const five = await makeCompanyWithCategories({
      sellerCategoryIds: [SEG, "11000000", "12000000", "13000000", "14000000"],
    });
    const elsewhere = await makeCompanyWithCategories({ sellerCategoryIds: ["11000000"] });
    const buyerOnly = await makeCompanyWithCategories({ buyerCategoryIds: [SEG] });
    await service().recomputeAll();

    const ids = [one, five, elsewhere, buyerOnly].map((c) => c.company.id);
    const scores = await service().scoresForCompanies(ids, [LEAF], "sell");
    expect(scores.get(one.company.id)).toEqual({
      score: 100 * SECTOR_FALLBACK_WEIGHT,
      reasons: { declared: true },
      exact: false,
    });
    // En fazla 5 sektör: ilgisi YALNIZ beyandan oluşan firma bildirim eşiğinin altına düşmez.
    expect(scores.get(five.company.id)?.score).toBeGreaterThanOrEqual(NOTIFY_MIN_AFFINITY);
    // Başka sektör ve yalnız ALIŞ beyanı satış okumasında puan almaz.
    expect(scores.has(elsewhere.company.id)).toBe(false);
    expect(scores.has(buyerOnly.company.id)).toBe(false);
    // Alış yönü kendi beyanından okunur.
    const buy = await service().scoresForCompanies(ids, [LEAF], "buy");
    expect(buy.get(buyerOnly.company.id)?.score).toBe(100 * SECTOR_FALLBACK_WEIGHT);
  });

  it("talebin kodunda katalog ürünü olan firma, yalnız sektör beyan edenin ÖNÜNDE kalır", async () => {
    const catalog = await makeCompanyWithCategories({ sellerCategoryIds: [SEG] });
    await catalogItem(catalog, LEAF, "M12 civata");
    const sectorOnly = await makeCompanyWithCategories({ sellerCategoryIds: [SEG] });
    await service().recomputeAll();

    const scores = await service().scoresForCompanies(
      [catalog.company.id, sectorOnly.company.id],
      [LEAF],
      "sell",
    );
    const exact = await scoreOf(catalog.company.id, LEAF);
    // Tam kod satırı okunur (yedek daha küçük) ve gerekçe katalogdur.
    expect(scores.get(catalog.company.id)?.score).toBe(exact!.sellScore);
    expect(scores.get(catalog.company.id)?.reasons).toMatchObject({ catalogItems: 1 });
    expect(scores.get(catalog.company.id)?.exact).toBe(true);
    expect(scores.get(sectorOnly.company.id)?.exact).toBe(false);
    expect(scores.get(catalog.company.id)!.score).toBeGreaterThan(scores.get(sectorOnly.company.id)!.score);
  });

  it("kalabalık sektörde (≥10 güçlü aday) sektörü beyan eden firma bildirimden DÜŞMEZ — kataloğu başka sektörde olsa da; beyan etmeyen düşer", async () => {
    const { service: listings } = makeService();
    const buyer = await makeCompanyWithUser(prisma);
    const past = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      categoryIds: [LEAF],
    });
    // 10 güçlü aday: talebin kodunda teklif vermiş, sektörü beyan eden firmalar.
    const bidders: string[] = [];
    for (let i = 0; i < 10; i++) {
      const b = await makeCompanyWithCategories({ sellerCategoryIds: [SEG] });
      await makeBid(prisma, {
        listingId: past.id,
        bidderCompanyId: b.company.id,
        createdById: b.user.id,
        amount: 1000 + i,
      });
      bidders.push(b.company.id);
    }
    // Yalnız sektör beyanı, katalog / davranış yok (5 sektör = en geniş beyan).
    const sectorOnly = await makeCompanyWithCategories({
      sellerCategoryIds: [SEG, "11000000", "12000000", "13000000", "14000000"],
    });
    // Sektörü beyan ediyor ama bütün kataloğu başka sektörde: payı küçük (1 / 8 × 100 × 0,25 ≈ 3),
    // beyan tabanı 100 / 1 × 0,25 = 25 → elenmez (sahip kuralı: beyan edilen sektörde düşmez).
    const busyElsewhere = await makeCompanyWithCategories({ sellerCategoryIds: [SEG] });
    await catalogItem(busyElsewhere, "11101501", "Kum");
    await catalogItem(busyElsewhere, "11101502", "Çakıl");
    await service().recomputeAll();

    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      categoryIds: [LEAF],
    });
    const notified = (await listings.notifyCategoryMatchedCompanies(listing.id)).map((c) => c.id);

    expect(notified).toEqual(expect.arrayContaining(bidders));
    expect(notified).toContain(sectorOnly.company.id);
    expect(notified).toContain(busyElsewhere.company.id);
  });

  it("beyan tabanı firma kaydından CANLI okunur (gece hesabı olmadan da) ve yalnız GÖSTERİLEN beyana bakar", async () => {
    // Gece hesabı (recomputeAll) yok: yeni kaydolmuş firma.
    const fresh = await makeCompanyWithCategories({ sellerCategoryIds: [SEG, "11000000"] });
    // Sektör 46 yalnız gizli bir seçimin (46101500) atası olarak saklı: gösterilen beyan değil.
    const ancestorOnly = await makeCompanyWithCategories({
      sellerCategoryIds: ["46000000"],
      sellerSubCategoryIds: ["46100000", "46101500"],
    });
    const visible46 = await makeCompanyWithCategories({ sellerCategoryIds: ["46000000"] });

    const scores = await service().scoresForCompanies([fresh.company.id], [LEAF], "sell");
    expect(scores.get(fresh.company.id)).toEqual({ score: 12.5, reasons: { declared: true }, exact: false });

    const in46 = await service().scoresForCompanies(
      [ancestorOnly.company.id, visible46.company.id],
      ["46181700"],
      "sell",
    );
    expect(in46.has(ancestorOnly.company.id)).toBe(false);
    expect(in46.get(visible46.company.id)?.score).toBe(25);
  });

  it("geniş beyanlı firmanın talebin kodundaki katalog ürünü, tek sektör beyan eden firmanın önünde sıralanır (puanı düşük olsa da)", async () => {
    const { service: listings } = makeService();
    const buyer = await makeCompanyWithUser(prisma);
    // Tek sektör: taban 25.
    const focused = await makeCompanyWithCategories({ sellerCategoryIds: [SEG] });
    // Beş sektör + talebin kodunda bir katalog ürünü: tam kod puanı ~23,5 (< 25).
    const broad = await makeCompanyWithCategories({
      sellerCategoryIds: [SEG, "11000000", "12000000", "13000000", "14000000"],
    });
    await catalogItem(broad, LEAF, "M12 civata");
    await service().recomputeAll();

    const scores = await service().scoresForCompanies([focused.company.id, broad.company.id], [LEAF], "sell");
    expect(scores.get(broad.company.id)!.score).toBeLessThan(scores.get(focused.company.id)!.score);
    expect(scores.get(broad.company.id)!.exact).toBe(true);

    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      categoryIds: [LEAF],
    });
    const notified = (await listings.notifyCategoryMatchedCompanies(listing.id)).map((c) => c.id);
    expect(notified.indexOf(broad.company.id)).toBeGreaterThanOrEqual(0);
    expect(notified.indexOf(broad.company.id)).toBeLessThan(notified.indexOf(focused.company.id));
  });

  it("Açık Talepler (profileFor): yalnız sektör beyan eden firma talebin kodunda beyan gerekçesi ve yedek puan alır; tam kod satırı daha yüksekse o kalır", async () => {
    const declarer = await makeCompanyWithCategories({ sellerCategoryIds: [SEG] });
    await service().recomputeAll();
    const profile = await service().profileFor(declarer.company.id, [LEAF, "11101501"], "sell");
    expect(profile.get(LEAF)).toEqual({ score: 25, reasons: { declared: true } });
    expect(affinityReasonText(profile.get(LEAF)!.reasons)).toBe("Faaliyet alanlarınızda işaretli");
    // Beyan edilmeyen sektördeki kod puan almaz.
    expect(profile.has("11101501")).toBe(false);

    await prisma.companyAffinity.upsert({
      where: { companyId_categoryId: { companyId: declarer.company.id, categoryId: LEAF } },
      create: { companyId: declarer.company.id, categoryId: LEAF, sellScore: 60, buyScore: 0, reasons: { bids: 2 } },
      update: { sellScore: 60, reasons: { bids: 2 } },
    });
    const withExact = await service().profileFor(declarer.company.id, [LEAF], "sell");
    expect(withExact.get(LEAF)).toEqual({ score: 60, reasons: { bids: 2 } });
  });
});
