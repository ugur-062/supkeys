/**
 * "AI ile daha fazla tedarikçiye eriş" — Faz A dizin keşfi sözleşmesi:
 * kategori eşleşmesi (segment + alt), SILVER+ görünürlük, bağlantılı/bloklu/
 * kendisi hariç, PENDING etiketi, güçlü-eşleşme sıralaması.
 */
import {
  PRODUCT_HIT_COMPANIES,
  SupplierDiscoveryService,
} from "../../src/modules/ai/supplier-discovery/supplier-discovery.service";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { PrismaClient } from "@rothern/db";
import { TEST_DB_URL } from "./env";
import { prisma, truncateAll } from "./test-db";
import { invite, makeCompany, makeCompanyWithUser, makeListing } from "./factories";
import { foldSearchText } from "@rothern/shared";
import { FREE_PERIOD } from "../../src/common/company/effective-tier";

/**
 * ÜCRETSİZ DÖNEM (2026-10-07): SINIRLI firma = DOĞRULANMAMIŞ firma (saklı
 * kademesi STANDART). Doğrulanmış firma saklı kademesinden bağımsız en üst
 * kademededir → AI önerisine girer.
 */
const LIMITED = { tier: "STANDART", companyVerificationStatus: "UNVERIFIED" } as const;

const svc = () => new SupplierDiscoveryService(prisma as unknown as PrismaService);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("SupplierDiscoveryService.discoverRegistered", () => {
  it("segment/alt eşleşen doğrulanmış firmalar döner; doğrulanmamış (sınırlı), bağlantılı, bloklu ve kendisi dönmez", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    // Alt-kategori (class) eşleşmesi → güçlü. Depolama kuralı: L2-L4 seçimi
    // `sellerSubCategoryIds`e, segmenti `sellerCategoryIds`e (yayın bildirimi
    // eşleştiricisiyle aynı — eskiden keşif alt kodu ana alanda arıyordu).
    const strong = await makeCompanyWithUser(prisma, { name: "Güçlü AŞ", tier: "SILVER" });
    await prisma.company.update({
      where: { id: strong.company.id },
      data: { sellerCategoryIds: ["30000000"], sellerSubCategoryIds: ["30991500"], city: "İstanbul" },
    });
    // Segment eşleşmesi → normal
    const seg = await makeCompanyWithUser(prisma, { name: "Segment AŞ", tier: "SILVER" });
    await prisma.company.update({
      where: { id: seg.company.id },
      data: { sellerCategoryIds: ["30000000"] },
    });
    // Doğrulanmamış (sınırlı) firma — dönmemeli (AI önerisine yalnız doğrulanmış
    // üye girer; profilini yayınlamış doğrulanmamış firma da aday değil).
    const std = await makeCompanyWithUser(prisma, { name: "Paketsiz", ...LIMITED });
    await prisma.company.update({
      where: { id: std.company.id },
      data: { sellerCategoryIds: ["30000000"] },
    });
    // Zaten ACTIVE bağlantılı — dönmemeli
    const conn = await makeCompanyWithUser(prisma, { name: "Bağlı AŞ", tier: "GOLD" });
    await prisma.company.update({
      where: { id: conn.company.id },
      data: { sellerCategoryIds: ["30000000"] },
    });
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: buyer.company.id,
        inviteeCompanyId: conn.company.id,
        invitedById: buyer.user.id,
        status: "ACTIVE",
        origin: "PREMIUM",
      },
    });
    // Bloklu — dönmemeli
    const blocked = await makeCompanyWithUser(prisma, { name: "Bloklu", tier: "GOLD" });
    await prisma.company.update({
      where: { id: blocked.company.id },
      data: { sellerCategoryIds: ["30000000"] },
    });
    await prisma.companyBlock.create({
      data: { blockerCompanyId: buyer.company.id, blockedCompanyId: blocked.company.id },
    });

    await prisma.category.create({
      data: { id: "30991500", code: "30991500", nameTr: "İskele sistemleri", level: 3, isActive: true, sortOrder: 0 },
    });

    const res = await svc().discoverRegistered(buyer.auth, {
      type: "ALIM",
      categoryIds: ["30991500"],
    });
    const names = res.candidates.map((c) => c.name);
    expect(names).toEqual(["Güçlü AŞ", "Segment AŞ"]); // güçlü önce
    expect(res.candidates[0]!.strongMatch).toBe(true);
    expect(res.candidates[0]!.matchedCategories).toContain("İskele sistemleri");
    expect(res.candidates[0]!.city).toBe("İstanbul");
  });

  it("bizim gönderdiğimiz PENDING istek listede kalır ve etiketlenir", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    const pending = await makeCompanyWithUser(prisma, { name: "Beklemede AŞ", tier: "SILVER" });
    await prisma.company.update({
      where: { id: pending.company.id },
      data: { sellerCategoryIds: ["30000000"] },
    });
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: buyer.company.id,
        inviteeCompanyId: pending.company.id,
        invitedById: buyer.user.id,
        status: "PENDING",
        origin: "PREMIUM",
      },
    });
    const res = await svc().discoverRegistered(buyer.auth, {
      type: "ALIM",
      categoryIds: ["30991500"],
    });
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0]!.connectionStatus).toBe("PENDING");
  });

  it("GÜVENLİK: başka firmanın talep id'si verilirse davetli listesi sızmaz (alreadyInvited hep false)", async () => {
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const attacker = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const rival = await makeCompanyWithUser(prisma, { name: "Rakip AŞ", tier: "SILVER" });
    await prisma.company.update({
      where: { id: rival.company.id },
      data: { sellerCategoryIds: ["30000000"] },
    });
    const listing = await makeListing(prisma, { companyId: owner.company.id, createdById: owner.user.id });
    await invite(prisma, listing.id, rival.company.id, owner.user.id);

    // Sahip kendi talebinde davetliyi görür…
    const own = await svc().discoverRegistered(owner.auth, {
      type: "ALIM",
      categoryIds: ["30991500"],
      listingId: listing.id,
    });
    expect(own.candidates.find((c) => c.name === "Rakip AŞ")?.alreadyInvited).toBe(true);

    // …başka firma aynı id ile soramaz.
    const res = await svc().discoverRegistered(attacker.auth, {
      type: "ALIM",
      categoryIds: ["30991500"],
      listingId: listing.id,
    });
    const rivalRow = res.candidates.find((c) => c.name === "Rakip AŞ");
    expect(rivalRow).toBeDefined();
    expect(rivalRow!.alreadyInvited).toBe(false);
  });

  it("vitrinde kalemi SATAN firma kategori beyanı uymasa da önerilir; hangi kalem olduğu işaretlenir (2026-09-27)", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    const seller = await makeCompanyWithUser(prisma, { name: "Cıvata AŞ", tier: "SILVER" });
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { slug: "civata-as", publicEnabled: true, sellerCategoryIds: ["12000000"] },
    });
    await prisma.companyItem.create({
      data: {
        companyId: seller.company.id,
        createdById: seller.user.id,
        name: "M6 Cıvata DIN 933",
        unit: "adet",
        slug: "m6-civata",
        isPublic: true,
        publishedAt: new Date(),
        searchText: foldSearchText("M6 Cıvata DIN 933 bağlantı elemanı"),
      },
    });
    const res = await svc().discoverRegistered(buyer.auth, {
      type: "ALIM",
      itemNames: ["Rulman 6205", "M6 cıvata"],
    });
    expect(res.candidates.map((c) => c.name)).toEqual(["Cıvata AŞ"]);
    expect(res.candidates[0]!.matchedItems).toEqual([2]);
    expect(res.candidates[0]!.strongMatch).toBe(true);
  });

  /**
   * Round 5, D5 — canlıda ölçülen: "Hidrolik silindir" FIN PA1 Smoke Makina'yı
   * kalem eşleşmesiyle buluyor, "Hidrolik silindir 80 mm çift etkili" 0 dönüyordu
   * (ürün: "FIN PA1 Smoke Hidrolik Silindir 80 mm"); gerçek taleplerde platform
   * sekmesi hiç kalem eşleşmesine ulaşmıyordu. Tam ad önce denenir; hiçbir ürün
   * bulmayan kalem gevşek kuralla eşleşir.
   *
   * Round 5 gözden geçirme, R5-01 — gevşek kural "herhangi iki anlamlı sözcük"
   * idi: iki NİTELİK sözcüğü ("çift etkili", "paslanmaz çelik") alakasız
   * ürünle eşleşiyor, o satıcı güçlü kalem eşleşmesi sayılıp talebin kendi
   * sınıfını beyan eden firmanın önüne geçiyor, otomatik tur onu davet ediyor,
   * gösterilmeyen havuzda "sattığınız ürünü arıyorlar" e-postası alıyordu.
   * Artık iki düzey: zayıf eşleşme (iki sözcük) YALNIZ talebin kategorisini
   * beyan eden firmada sayılır; kesin eşleşme (sözcüklerin tamamı / yarıdan
   * fazlası) her firmada; gevşek eşleşme tek başına "güçlü" değildir.
   */
  describe("kalem ↔ vitrin ürünü: gevşek eşleşme (round 5, D5 + R5-01)", () => {
    let seq = 0;
    /** Talebin kategorisi (hidrolik) ve o segmenti / sınıfı beyan eden satıcı. */
    const CATEGORY = "40141700";
    const IN_SEGMENT = { sellerCategoryIds: ["40000000"] };
    const IN_CLASS = { sellerCategoryIds: ["40000000"], sellerSubCategoryIds: ["40140000", "40141700"] };
    /** Vitrini açık satıcı + yayında ürünleri. */
    async function seller(
      name: string,
      products: string[],
      extra: Parameters<typeof makeCompanyWithUser>[1] = {},
      declares: { sellerCategoryIds?: string[]; sellerSubCategoryIds?: string[] } = {},
    ) {
      const s = await makeCompanyWithUser(prisma, { name, tier: "SILVER", ...extra });
      await prisma.company.update({
        where: { id: s.company.id },
        data: { slug: `satici-${++seq}`, publicEnabled: true, ...declares },
      });
      for (const product of products) {
        await prisma.companyItem.create({
          data: {
            companyId: s.company.id,
            createdById: s.user.id,
            name: product,
            unit: "adet",
            slug: `urun-${++seq}`,
            isPublic: true,
            publishedAt: new Date(),
            searchText: foldSearchText(product),
          },
        });
      }
      return s;
    }

    it("kalemdeki ölçü / nitelik üründe geçmese de talebin kategorisindeki satıcı kalem eşleşmesiyle bulunur (canlıdaki iki örnek)", async () => {
      const buyer = await makeCompanyWithUser(prisma);
      await seller(
        "FIN PA1 Smoke Makina",
        ["FIN PA1 Smoke Hidrolik Silindir 80 mm", "FIN PA1 Smoke Hidrolik Pres"],
        {},
        IN_SEGMENT,
      );
      // Eski kural (her sözcük AND) ikisinde de 0 dönüyordu.
      const res = await svc().discoverRegistered(buyer.auth, {
        type: "ALIM",
        categoryIds: [CATEGORY],
        itemNames: ["Hidrolik silindir 80 mm çift etkili", "Rulman 6205", "Hidrolik pres 40 ton C tipi"],
      });
      expect(res.candidates.map((c) => [c.name, c.strongMatch, c.matchedItems])).toEqual([
        ["FIN PA1 Smoke Makina", true, [1, 3]],
      ]);
    });

    it("R5-01 (canlıda yeniden üretilen): iki nitelik sözcüğüyle eşleşen alakasız satıcılar aday DEĞİL; talebin sınıfını beyan eden firma en üstte; gösterilmeyen havuzda da güçlü eşleşme sayılmaz", async () => {
      const buyer = await makeCompanyWithUser(prisma);
      const itemNames = [
        "Hidrolik silindir 80 mm çift etkili",
        "Paslanmaz çelik boru 2 inç dikişsiz",
        "Yüksek basınç hortumu 1/2 2 tel",
      ];
      // Kalemlerin yalnız iki NİTELİK / MALZEME sözcüğünü taşıyan ürünler — başka segmentte.
      const elsewhere = { sellerCategoryIds: ["52000000"] };
      await seller("Valf AŞ", ["Çift etkili pnömatik valf"], {}, elsewhere);
      await seller("Tencere AŞ", ["Paslanmaz çelik tencere seti"], {}, elsewhere);
      await seller("Yıkama AŞ", ["Yüksek basınç yıkama makinesi"], {}, elsewhere);
      // Kategori beyanı hiç olmayan satıcı da aynı.
      await seller("Beyansız Valf AŞ", ["Çift etkili pnömatik valf"]);
      // Talebin kendi sınıfını beyan eden firma (ürünü yok).
      await seller("Sınıf AŞ", [], {}, IN_CLASS);
      // Talebin segmentinde, kalemin iki sözcüğünü taşıyan ürün: kategori eşleşmesi zayıf eşleşmeyi doğrular.
      await seller("Segment Silindir AŞ", ["Hidrolik Silindir 80 mm"], {}, IN_SEGMENT);
      // Yalnız segment.
      await seller("Yalnız Segment AŞ", [], {}, IN_SEGMENT);
      // Gösterilmeyen havuz: doğrulanmamış "tava" satıcısı (başka segment) ve talebin sınıfındaki doğrulanmamış firma.
      await seller("Tava Ltd", ["Paslanmaz çelik tava"], LIMITED, elsewhere);
      await seller("Doğrulanmamış Sınıf Ltd", [], LIMITED, IN_CLASS);

      const res = await svc().discoverRegistered(buyer.auth, { type: "ALIM", categoryIds: [CATEGORY], itemNames });
      expect(res.candidates.map((c) => [c.name, c.strongMatch, c.matchedItems])).toEqual([
        // Eskiden üç alakasız satıcı strongMatch + [1] / [2] / [3] ile bu firmanın ÜSTÜNDEYDİ.
        ["Sınıf AŞ", true, []],
        ["Segment Silindir AŞ", true, [1]],
        ["Yalnız Segment AŞ", false, []],
      ]);

      // Otomatik turun gösterilmeyen havuzu: "sattığınız ürünü arıyorlar" e-postası yalnız güçlü eşleşmeye gider.
      const hidden = await svc().discoverRegisteredFor(buyer.company.id, { categoryIds: [CATEGORY], itemNames, pool: "hidden" });
      expect(hidden.candidates.map((c) => [c.name, c.strongMatch, c.matchedItems])).toEqual([
        ["Doğrulanmamış Sınıf Ltd", true, []],
      ]);

      // Kategorisiz aramada doğrulayacak kategori yok: zayıf eşleşme hiç sayılmaz.
      const noCategory = await svc().discoverRegistered(buyer.auth, { type: "ALIM", itemNames });
      expect(noCategory.candidates).toEqual([]);
    });

    it("kesin eşleşme (anlamlı sözcüklerin tamamı / yarıdan fazlası) kategori beyanı olmadan da kalem eşleşmesidir — ama tek başına 'güçlü' değildir", async () => {
      const buyer = await makeCompanyWithUser(prisma);
      // Dört sözcüğün üçü (paslanmaz, çelik, boru): kategori beyanı başka segmentte.
      await seller("Boru AŞ", ["Paslanmaz çelik boru DN50"], {}, { sellerCategoryIds: ["31000000"] });
      // İki sözcüğün ikisi (hidrolik, pres): kategori beyanı yok.
      await seller("Pres AŞ", ["Hidrolik Pres"]);
      const itemNames = ["Paslanmaz çelik boru 2 inç dikişsiz", "Hidrolik pres 40 ton C tipi"];
      const res = await svc().discoverRegistered(buyer.auth, { type: "ALIM", categoryIds: [CATEGORY], itemNames });
      expect(res.candidates.map((c) => [c.name, c.strongMatch, c.matchedItems]).sort()).toEqual([
        ["Boru AŞ", false, [1]],
        ["Pres AŞ", false, [2]],
      ]);
      // Kategorisiz aramada da (formdan, kategori seçilmeden) aynı.
      const noCategory = await svc().discoverRegistered(buyer.auth, { type: "ALIM", itemNames });
      expect(noCategory.candidates.map((c) => [c.name, c.strongMatch, c.matchedItems]).sort()).toEqual([
        ["Boru AŞ", false, [1]],
        ["Pres AŞ", false, [2]],
      ]);
    });

    it("sıra: kalemin tam adı > talebin alt kategorisi > gevşek kalem eşleşmesi > yalnız segment (gevşek eşleşen kalem sayısı fazla olsa da)", async () => {
      const buyer = await makeCompanyWithUser(prisma);
      await seller("Tam Ad AŞ", ["M6 Cıvata DIN 933"]);
      await seller("Sınıf AŞ", [], {}, IN_CLASS);
      // Daha yeni firma + iki kalemle gevşek eşleşme: sıra yine tam adın ve sınıf beyanının arkasında.
      await seller("Gevşek AŞ", ["Hidrolik Silindir 80 mm", "Hidrolik Pres"], {}, IN_SEGMENT);
      await seller("Segment AŞ", [], {}, IN_SEGMENT);
      const res = await svc().discoverRegistered(buyer.auth, {
        type: "ALIM",
        categoryIds: [CATEGORY],
        itemNames: ["M6 cıvata", "Hidrolik silindir 80 mm çift etkili", "Hidrolik pres 40 ton C tipi"],
      });
      expect(res.candidates.map((c) => [c.name, c.strongMatch, c.matchedItems])).toEqual([
        ["Tam Ad AŞ", true, [1]],
        ["Sınıf AŞ", true, []],
        ["Gevşek AŞ", true, [2, 3]],
        ["Segment AŞ", false, []],
      ]);
    });

    it("anlamlı sözcüklerden yalnız BİRİNİ taşıyan ürün eşleşmez; kalemin tek anlamlı sözcüğü varsa o sözcük talebin kategorisindeki satıcıda yeter", async () => {
      const buyer = await makeCompanyWithUser(prisma);
      await seller("Hortum AŞ", ["Hidrolik hortum R2 1/2 inç"], {}, IN_SEGMENT);
      await seller("Rulman AŞ", ["Sabit bilyalı rulman"], {}, IN_SEGMENT);
      // Başka segmentte, aynı tek sözcük: malzeme / nitelik de olabilirdi — kategori olmadan sayılmaz.
      await seller("Öteki Rulman AŞ", ["Rulman yağı"], {}, { sellerCategoryIds: ["15000000"] });
      const two = await svc().discoverRegistered(buyer.auth, {
        type: "ALIM",
        itemNames: ["Hidrolik silindir 80 mm çift etkili"],
      });
      expect(two.candidates).toEqual([]);
      const one = await svc().discoverRegistered(buyer.auth, {
        type: "ALIM",
        categoryIds: [CATEGORY],
        itemNames: ["Rulman 6205 2RS"],
      });
      expect(one.candidates.map((c) => [c.name, c.strongMatch, c.matchedItems])).toEqual([
        ["Rulman AŞ", true, [1]],
        ["Hortum AŞ", false, []],
      ]);
    });

    it("tam adı bir ürün bulan kalemde gevşek arama KOŞMAZ (tam ad önce)", async () => {
      const buyer = await makeCompanyWithUser(prisma);
      await seller("Çift Etkili AŞ", ["Çift etkili hidrolik silindir 100 mm"]);
      // Kalemin üç anlamlı sözcüğünü taşıyor ama "çift" yok: yalnız gevşek aramada çıkardı.
      await seller("Tek Etkili AŞ", ["Tek etkili hidrolik silindir"]);
      const res = await svc().discoverRegistered(buyer.auth, {
        type: "ALIM",
        itemNames: ["Hidrolik silindir çift etkili"],
      });
      expect(res.candidates.map((c) => c.name)).toEqual(["Çift Etkili AŞ"]);
    });

    it("uygunluk kuralları gevşek eşleşmede de aynı: doğrulanmamış, engelli ve talebin ülkesi dışındaki satıcı önerilmez", async () => {
      const buyer = await makeCompanyWithUser(prisma);
      const product = ["Hidrolik Silindir 80 mm"];
      await seller("Uygun AŞ", product, {}, IN_SEGMENT);
      await seller("Doğrulanmamış AŞ", product, LIMITED, IN_SEGMENT);
      const blocked = await seller("Engelli AŞ", product, {}, IN_SEGMENT);
      await prisma.companyBlock.create({
        data: { blockerCompanyId: buyer.company.id, blockedCompanyId: blocked.company.id },
      });
      await seller("Alman GmbH", product, { country: "DE" }, IN_SEGMENT);
      const input = { type: "ALIM" as const, categoryIds: [CATEGORY], itemNames: ["Hidrolik silindir 80 mm çift etkili"] };
      const all = await svc().discoverRegistered(buyer.auth, input);
      expect(all.candidates.map((c) => c.name).sort()).toEqual(["Alman GmbH", "Uygun AŞ"]);
      expect(all.candidates.every((c) => c.strongMatch && c.matchedItems.length === 1)).toBe(true);
      const onlyTr = await svc().discoverRegistered(buyer.auth, { ...input, targetCountries: ["TR"] });
      expect(onlyTr.candidates.map((c) => c.name)).toEqual(["Uygun AŞ"]);
      // Alıcıya gösterilmeyen havuz aynı eşleştiriciyi kullanır (doğrulama çağrısı).
      const hidden = await svc().discoverRegisteredFor(buyer.company.id, {
        categoryIds: input.categoryIds,
        itemNames: input.itemNames,
        pool: "hidden",
      });
      expect(hidden.candidates.map((c) => [c.name, c.strongMatch])).toEqual([["Doğrulanmamış AŞ", true]]);
    });

    it("sorgu sayısı sınırlı: 15 kalemde en fazla kalem başına bir tam ad sorgusu + aynı sözcüklere inen kalemler için TEK gevşek sorgu çifti (kesin + zayıf)", async () => {
      const buyer = await makeCompanyWithUser(prisma);
      await seller("FIN PA1 Smoke Makina", ["FIN PA1 Smoke Hidrolik Silindir 80 mm"], {}, IN_SEGMENT);
      // 20 satır gelir, ilk 15'i okunur; hepsi yalnız ölçüsü farklı aynı kalem.
      const itemNames = Array.from({ length: 20 }, (_, i) => `Hidrolik silindir ${40 + i * 10} mm çift etkili`);
      const grouped = jest.spyOn(prisma.companyItem, "groupBy");
      const listed = jest.spyOn(prisma.companyItem, "findMany");
      try {
        const res = await svc().discoverRegistered(buyer.auth, { type: "ALIM", categoryIds: [CATEGORY], itemNames });
        expect(grouped).toHaveBeenCalledTimes(17);
        // Ürün SATIRLARI hiç yüklenmez (R5-07).
        expect(listed).not.toHaveBeenCalled();
        expect(res.candidates.map((c) => c.name)).toEqual(["FIN PA1 Smoke Makina"]);
        expect(res.candidates[0]!.matchedItems).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
        // Kategorisiz aramada zayıf sorgu hiç koşmaz: 15 tam ad + 1 kesin.
        grouped.mockClear();
        await svc().discoverRegistered(buyer.auth, { type: "ALIM", itemNames });
        expect(grouped).toHaveBeenCalledTimes(16);
      } finally {
        grouped.mockRestore();
        listed.mockRestore();
      }
    });

    /**
     * Round 5 gözden geçirme, R5-07 — `findMany` + `distinct` + `take: 30`:
     * Prisma ikisini de BELLEKTE uyguluyordu (SQL'de DISTINCT / LIMIT yok).
     * Gevşek sorgu iki yaygın sözcüğü taşıyan bütün ürün satırlarını yüklüyor,
     * tutulan 30 firma rastgele bir alt küme oluyor ve yuvalar sonradan düşecek
     * (uygun olmayan) firmalara gidiyordu.
     */
    it("R5-07: ürün sorgusu SQL'de GROUP BY + LIMIT ile koşar, firma başına tek satır döner ve uygunluk süzgecini aynı sorguda taşır", async () => {
      const buyer = await makeCompanyWithUser(prisma);
      // Tek satıcının 40 ürünü de iki sözcüğü taşıyor (eskiden 40 satır yükleniyordu).
      await seller(
        "Çok Ürünlü AŞ",
        Array.from({ length: 40 }, (_, i) => `Paslanmaz çelik boru tip ${i + 1}`),
        {},
        IN_SEGMENT,
      );
      const logging = new PrismaClient({
        datasources: { db: { url: `${TEST_DB_URL}${TEST_DB_URL.includes("?") ? "&" : "?"}connection_limit=1` } },
        log: [{ emit: "event", level: "query" }],
      });
      const queries: string[] = [];
      logging.$on("query", (e) => queries.push(e.query));
      try {
        const res = await new SupplierDiscoveryService(logging as unknown as PrismaService).discoverRegistered(buyer.auth, {
          type: "ALIM",
          categoryIds: [CATEGORY],
          itemNames: ["Paslanmaz çelik boru 2 inç dikişsiz"],
        });
        expect(res.candidates.map((c) => [c.name, c.matchedItems])).toEqual([["Çok Ürünlü AŞ", [1]]]);
        const productQueries = queries.filter((q) => /FROM "[^"]+"\."company_items"/.test(q));
        // Tam ad + kesin + zayıf.
        expect(productQueries).toHaveLength(3);
        for (const q of productQueries) {
          expect(q).toContain("GROUP BY");
          expect(q).toMatch(/ORDER BY .* LIMIT \$\d+/);
          // Uygunluk (doğrulanmış, engelsiz) aynı sorguda: firma tablosuna bağlanır.
          expect(q).toContain('"companyVerificationStatus"');
        }
      } finally {
        await logging.$disconnect();
      }
    });

    it("R5-07: 30 yuva uygun firmalara gider — uygun olmayan (doğrulanmamış) 31 satıcı uygun satıcının yerini almaz", async () => {
      const buyer = await makeCompanyWithUser(prisma);
      const product = ["Hidrolik Pres"];
      // Önce yaratılanlar önce sıralanır (kimlik zaman sıralı): eski kodda 30 yuvayı bunlar dolduruyordu.
      for (let i = 0; i < PRODUCT_HIT_COMPANIES + 1; i++) await seller(`Doğrulanmamış ${i}`, product, LIMITED);
      await seller("Uygun Pres AŞ", product);
      const res = await svc().discoverRegistered(buyer.auth, { type: "ALIM", itemNames: ["Hidrolik pres"] });
      expect(res.candidates.map((c) => [c.name, c.strongMatch, c.matchedItems])).toEqual([["Uygun Pres AŞ", true, [1]]]);
    });
  });

  it("segmentte 60+ daha yeni firma olsa da ESKİ güçlü eşleşme (alt kategori) puanlamaya girer ve başa gelir (derin denetim S015)", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    await makeCompany(prisma, {
      name: "Eski Güçlü AŞ",
      tier: "SILVER",
      sellerCategoryIds: ["30000000"],
      sellerSubCategoryIds: ["30991500"],
      createdAt: new Date(Date.now() - 365 * 24 * 3600 * 1000),
    });
    for (let i = 0; i < 61; i++) {
      await makeCompany(prisma, { name: `Segment ${i}`, tier: "SILVER", sellerCategoryIds: ["30000000"] });
    }
    const res = await svc().discoverRegistered(buyer.auth, { type: "ALIM", categoryIds: ["30991500"] });
    expect(res.candidates[0]!.name).toBe("Eski Güçlü AŞ");
    expect(res.candidates[0]!.strongMatch).toBe(true);
    expect(res.candidates).toHaveLength(12);
  });

  it("talep belirli ülkelere açıksa o ülkelerin dışındaki firma önerilmez", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    const tr = await makeCompanyWithUser(prisma, { name: "TR AŞ", tier: "SILVER" });
    const de = await makeCompanyWithUser(prisma, { name: "DE GmbH", tier: "SILVER", country: "DE" });
    for (const c of [tr, de]) {
      await prisma.company.update({ where: { id: c.company.id }, data: { sellerCategoryIds: ["30000000"] } });
    }
    const all = await svc().discoverRegistered(buyer.auth, { type: "ALIM", categoryIds: ["30991500"] });
    expect(all.candidates.map((c) => c.name).sort()).toEqual(["DE GmbH", "TR AŞ"]);
    const onlyDe = await svc().discoverRegistered(buyer.auth, {
      type: "ALIM",
      categoryIds: ["30991500"],
      targetCountries: ["DE"],
    });
    expect(onlyDe.candidates.map((c) => c.name)).toEqual(["DE GmbH"]);
  });

  /** Üç firmayı aynı kategoriye, vitrini açık kurar. */
  async function threeSellers() {
    const ok = await makeCompanyWithUser(prisma, { name: "Doğrulanmış Silver", tier: "SILVER" });
    const free = await makeCompanyWithUser(prisma, { name: "Ücretsiz Vitrin", tier: "STANDART" });
    const unverified = await makeCompanyWithUser(prisma, {
      name: "Doğrulanmamış Silver",
      tier: "SILVER",
      companyVerificationStatus: "UNVERIFIED",
    });
    const all = [ok, free, unverified];
    for (const status of ["PENDING", "REJECTED"] as const) {
      all.push(
        await makeCompanyWithUser(prisma, {
          name: `Sınırlı ${status}`,
          tier: "STANDART",
          companyVerificationStatus: status,
        }),
      );
    }
    for (const c of all) {
      await prisma.company.update({
        where: { id: c.company.id },
        data: { sellerCategoryIds: ["30000000"], publicEnabled: true, slug: `s-${c.company.id}` },
      });
    }
  }

  it("ücretsiz dönem: AI önerisine YALNIZ doğrulanmış üye girer — saklı kademesi STANDART olan doğrulanmış firma DAHİL; doğrulanmamış / incelemedeki / reddedilmiş firma saklı paketi olsa da önerilmez", async () => {
    const buyer = await makeCompanyWithUser(prisma);
    await threeSellers();
    const res = await svc().discoverRegistered(buyer.auth, { type: "ALIM", categoryIds: ["30991500"] });
    expect(res.candidates.map((c) => c.name).sort()).toEqual(["Doğrulanmış Silver", "Ücretsiz Vitrin"]);
  });

  describe("saklı paket kuralı (ücretsiz dönem anahtarı KAPALI)", () => {
    // Paket kademesi şartı anahtar kapalıyken geçerlidir; açıkken doğrulama tek başına yeter.
    beforeEach(() => {
      jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("AI önerisine YALNIZ SILVER+ ∧ doğrulanmış üye girer: vitrini açık ücretsiz firma ve doğrulanmamış Silver önerilmez (2026-09-28)", async () => {
      const buyer = await makeCompanyWithUser(prisma);
      await threeSellers();
      const res = await svc().discoverRegistered(buyer.auth, { type: "ALIM", categoryIds: ["30991500"] });
      expect(res.candidates.map((c) => c.name)).toEqual(["Doğrulanmış Silver"]);
    });
  });
});
