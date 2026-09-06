/**
 * Satıcı İhaleler listesi (sellerTenders) — eski tedarikçi paneli paritesi.
 * Davetli PRIVATE görünürlüğü (bug fix), teklif durumu/versiyon zenginleştirme,
 * kategori eşleşmesi, maskeleme, geçmiş sekmesi verisi.
 */
import { prisma, truncateAll } from "./test-db";
import {
  connect,
  invite,
  makeBid,
  makeCompanyWithUser,
  makeItem,
  makeListing,
} from "./factories";
import { makeService } from "./make-service";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("sellerTenders", () => {
  it("BUG FIX: davet edilen PRIVATE ilan listede görünür (browse'da görünmüyordu)", async () => {
    const { service } = makeService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "PRIVATE",
    });
    await invite(prisma, l.id, seller.company.id, buyer.user.id);

    // sellerTenders davetli PRIVATE'ı gösterir.
    const rows = await service.sellerTenders(seller.auth);
    const row = rows.find((r) => r.id === l.id);
    expect(row).toBeDefined();
    expect(row!.invited).toBe(true);
    expect(row!.canBid).toBe(true);
  });

  it("limit SIRALAMADAN SONRA kırpar — 'en uygun N', 'rastgele N' değil", async () => {
    // Pano keşif şeridi 6 kart gösteriyor; sorguyu kırpsaydık davetli ilan
    // listenin dışında kalabilirdi.
    const { service } = makeService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const base = { companyId: buyer.company.id, createdById: buyer.user.id, type: "ALIM" as const };
    // Önce iki herkese açık ilan, SONRA davetli olan — davetli sıralamada üste
    // çıkmalı ve limit=1 ile TEK dönen o olmalı.
    await makeListing(prisma, { ...base, visibility: "PUBLIC" });
    await makeListing(prisma, { ...base, visibility: "PUBLIC" });
    const invited = await makeListing(prisma, { ...base, visibility: "PRIVATE" });
    await invite(prisma, invited.id, seller.company.id, buyer.user.id);

    const all = await service.sellerTenders(seller.auth);
    expect(all.length).toBe(3);
    const limited = await service.sellerTenders(seller.auth, "ALIM", { limit: 1 });
    expect(limited).toHaveLength(1);
    expect(limited[0].id).toBe(invited.id);
    expect(limited[0].id).toBe(all[0].id);
  });

  it("keşif sektör sayaçları LİSTEYLE aynı kuralı okur", async () => {
    // Sayaç başka, liste başka bir görünürlük kuralı okusaydı kullanıcı
    // "2 ilan" görüp tıklayınca 1 ilan bulurdu.
    const { service, blocks } = makeService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const blocked = await makeCompanyWithUser(prisma, { country: "TR" });
    blocks.blockedCompanyIds.mockResolvedValue([blocked.company.id]);
    await prisma.category.create({
      data: {
        id: "39000000", code: "39000000", nameTr: "Elektrik Sistemleri",
        keywords: "", searchText: "elektrik", level: 1, isActive: true, sortOrder: 0,
      },
    });
    await makeListing(prisma, {
      companyId: buyer.company.id, createdById: buyer.user.id,
      type: "ALIM", visibility: "PUBLIC", categoryIds: ["39121000"],
    });
    // Bloklu firmanın ilanı ne listede ne sayaçta olmalı.
    await makeListing(prisma, {
      companyId: blocked.company.id, createdById: blocked.user.id,
      type: "ALIM", visibility: "PUBLIC", categoryIds: ["39121000"],
    });

    const rows = await service.sellerTenders(seller.auth);
    const facets = await service.discoverFacets(seller.auth);
    expect(rows).toHaveLength(1);
    expect(facets.total).toBe(1);
    expect(facets.segments).toEqual([
      { id: "39000000", name: "Elektrik Sistemleri", count: 1 },
    ]);
  });

  it("teklif durumu + versiyon satıra işlenir; geçmiş (AWARDED) ilan listelenir", async () => {
    const { service } = makeService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, buyer.company.id, seller.company.id, buyer.user.id);

    const open = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "CONNECTIONS",
    });
    await makeBid(prisma, {
      listingId: open.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      amount: 1000,
    });
    await prisma.listingBid.updateMany({
      where: { listingId: open.id },
      data: { version: 2 },
    });

    const past = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "CONNECTIONS",
      status: "AWARDED",
    });
    await makeBid(prisma, {
      listingId: past.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      amount: 500,
      status: "WON",
    });

    const rows = await service.sellerTenders(seller.auth);
    const openRow = rows.find((r) => r.id === open.id);
    expect(openRow?.myBidStatus).toBe("SUBMITTED");
    expect(openRow?.myBidVersion).toBe(2);

    const pastRow = rows.find((r) => r.id === past.id);
    expect(pastRow).toBeDefined();
    expect(pastRow?.myBidStatus).toBe("WON");
    expect(pastRow?.status).toBe("AWARDED");
  });

  it("openOnly: geçmiş katılımlarım DIŞARIDA — pano şeridi 'teklif bekleyen' der", async () => {
    // Varsayılan yanıt açık ilanların yanında KATILDIĞIM kapanmışları da
    // taşır (liste sayfası Aktif/Geçmiş sekmesiyle ayırır). Pano keşif şeridi
    // "teklif bekleyen açık talepler" diye başlıklanıyor: süzgeç olmadan açık
    // ilan bitince şerit sessizce AWARDED/CLOSED kayıtlarla doluyor ve
    // "Tümünü gör" tıklandığında liste (varsayılan Aktif sekmesi) 0 gösteriyordu.
    const { service } = makeService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, buyer.company.id, seller.company.id, buyer.user.id);
    const base = {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM" as const,
      visibility: "CONNECTIONS" as const,
    };

    const open = await makeListing(prisma, base);
    const past = await makeListing(prisma, { ...base, status: "AWARDED" });
    await makeBid(prisma, {
      listingId: past.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      amount: 500,
      status: "WON",
    });

    const all = await service.sellerTenders(seller.auth);
    expect(all.map((r) => r.id).sort()).toEqual([open.id, past.id].sort());

    const openOnly = await service.sellerTenders(seller.auth, "ALIM", {
      openOnly: true,
    });
    expect(openOnly.map((r) => r.id)).toEqual([open.id]);
  });

  it("kategori eşleşmesi: ilan class kodu satıcının segmentine türer", async () => {
    const { service } = makeService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, buyer.company.id, seller.company.id, buyer.user.id);
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { sellerCategoryIds: ["10000000"] },
    });
    const match = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "CONNECTIONS",
      categoryIds: ["10101500"], // → segment 10000000
    });
    const noMatch = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "CONNECTIONS",
      categoryIds: ["20101500"],
    });

    const rows = await service.sellerTenders(seller.auth);
    expect(rows.find((r) => r.id === match.id)?.categoryMatch).toBe(true);
    expect(rows.find((r) => r.id === noMatch.id)?.categoryMatch).toBe(false);
  });

  it("ÜRÜN eşleşmesi: katalog ürünü kategoriyle (L3 ata) ve kalem adıyla eşler; itemNames döner; sırada kategori eşleşenin üstünde", async () => {
    const { service } = makeService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, buyer.company.id, seller.company.id, buyer.user.id);
    // Beyan: segment 20 (madencilik). Katalog: elektrik panosu (39121501).
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { sellerCategoryIds: ["20000000"] },
    });
    await prisma.companyItem.create({
      data: {
        companyId: seller.company.id,
        createdById: seller.user.id,
        name: "Kompanzasyon Panosu 400 kVAr",
        unit: "adet",
        categoryId: "39121501",
        keywords: ["kompanzasyon"],
      },
    });
    const mk = (over: Record<string, unknown>) =>
      makeListing(prisma, {
        companyId: buyer.company.id,
        createdById: buyer.user.id,
        type: "ALIM",
        visibility: "CONNECTIONS",
        ...over,
      });
    // Aynı L3 sınıfı (39121500) → kategori yoluyla ürün eşleşmesi.
    const byCategory = await mk({ title: "Elektrik malzemesi alımı", categoryIds: ["39121503"] });
    // Kategori uzak, kalem adı ürünle örtüşüyor → metin yoluyla.
    const byText = await mk({ title: "Trafo merkezi tedariki", categoryIds: ["26101500"] });
    await makeItem(prisma, byText.id, { name: "Kompanzasyon panosu 200 kVAr" });
    // Yalnız beyan edilen segment eşleşir (categoryMatch), ürün eşleşmez.
    const declaredOnly = await mk({ title: "Madencilik ekipmanı", categoryIds: ["20101500"] });
    const none = await mk({ title: "Kağıt alımı", categoryIds: ["14111500"] });

    const rows = await service.sellerTenders(seller.auth);
    const row = (id: string) => rows.find((r) => r.id === id)!;
    expect(row(byCategory.id).productMatch).toBe(true);
    expect(row(byCategory.id).matchedProduct).toBe("Kompanzasyon Panosu 400 kVAr");
    expect(row(byCategory.id).matchReason).toBe("Ürününüz bu kategoride: Kompanzasyon Panosu 400 kVAr");
    expect(row(byText.id).productMatch).toBe(true);
    expect(row(byText.id).matchReason).toBe("Ürününüzle eşleşiyor: Kompanzasyon Panosu 400 kVAr");
    expect(row(byText.id).itemNames).toEqual(["Kompanzasyon panosu 200 kVAr"]);
    expect(row(declaredOnly.id).productMatch).toBe(false);
    expect(row(declaredOnly.id).categoryMatch).toBe(true);
    expect(row(none.id).productMatch).toBe(false);
    expect(row(none.id).itemNames).toEqual([]);
    // Merdiven: ürün eşleşmesi › kategori eşleşmesi › gerisi.
    const idx = (id: string) => rows.findIndex((r) => r.id === id);
    expect(idx(byCategory.id)).toBeLessThan(idx(declaredOnly.id));
    expect(idx(byText.id)).toBeLessThan(idx(declaredOnly.id));
    expect(idx(declaredOnly.id)).toBeLessThan(idx(none.id));
  });

  it("öncelik sıralaması: davetli > bağlantılı > herkese açık (connected alanı döner)", async () => {
    const { service } = makeService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const invBuyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const connBuyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const pubBuyer = await makeCompanyWithUser(prisma, { country: "TR" });
    // Sadece connBuyer ile aktif bağlantı.
    await connect(prisma, connBuyer.company.id, seller.company.id, connBuyer.user.id);

    const invited = await makeListing(prisma, {
      companyId: invBuyer.company.id,
      createdById: invBuyer.user.id,
      type: "ALIM",
      visibility: "PRIVATE",
    });
    await invite(prisma, invited.id, seller.company.id, invBuyer.user.id);
    const connectedL = await makeListing(prisma, {
      companyId: connBuyer.company.id,
      createdById: connBuyer.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
    });
    const publicL = await makeListing(prisma, {
      companyId: pubBuyer.company.id,
      createdById: pubBuyer.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
    });

    const rows = await service.sellerTenders(seller.auth);
    // connected alanı doğru döner.
    expect(rows.find((r) => r.id === connectedL.id)?.connected).toBe(true);
    expect(rows.find((r) => r.id === publicL.id)?.connected).toBe(false);
    expect(rows.find((r) => r.id === invited.id)?.invited).toBe(true);
    // Sıra (küçük index = üstte): davetli < bağlantılı < herkese açık.
    const idx = (id: string) => rows.findIndex((r) => r.id === id);
    expect(idx(invited.id)).toBeLessThan(idx(connectedL.id));
    expect(idx(connectedL.id)).toBeLessThan(idx(publicL.id));
  });

  it("STANDARD firma PUBLIC ilanı MASKELİ görür (premium başvuru yönlendirmesi); PAKET tam görür", async () => {
    const { service } = makeService();
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const standard = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    const premium = await makeCompanyWithUser(prisma, { country: "TR" });
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
    });

    // Standart (ücretsiz): bağsız PUBLIC listede HİÇ YOK (2026-09-06 — eski
    // maskeli önizleme kalktı; kilit kartı sayıyı gösterir).
    const stdRows = await service.sellerTenders(standard.auth);
    expect(stdRows.find((r) => r.id === l.id)).toBeUndefined();

    const preRows = await service.sellerTenders(premium.auth);
    const row = preRows.find((r) => r.id === l.id);
    expect(row).toBeDefined();
    expect(row!.canBid).toBe(true);
    expect(row!.owner?.name).toBeTruthy();
  });

  it("getOne: davetli firma PUBLIC ilanı maskesiz görür + teklif verebilir + invited döner", async () => {
    const { service } = makeService();
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const standard = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
    });
    await invite(prisma, l.id, standard.company.id, buyer.user.id);

    const detail = (await service.getOne(standard.auth, l.id)) as {
      canBid: boolean;
      invited: boolean;
      owner: { name: string } | null;
    };
    expect(detail.invited).toBe(true);
    expect(detail.owner?.name).toBeTruthy(); // davet kapıyı açar
    expect(detail.canBid).toBe(true); // davetli her görünürlükte teklif verir
  });

  it("CC-1 getOne: hedef fiyat non-owner'a varsayılan GİZLİ, opt-in açıkken görünür", async () => {
    const { service } = makeService();
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, buyer.company.id, seller.company.id, buyer.user.id);

    // Varsayılan (showTargetToSuppliers=false) → non-owner targetPrice GÖRMEZ.
    const hidden = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "CONNECTIONS",
    });
    await makeItem(prisma, hidden.id, { targetPrice: 100 });
    const hiddenDetail = (await service.getOne(seller.auth, hidden.id)) as {
      items: { targetPrice: string | null }[];
    };
    expect(hiddenDetail.items[0]?.targetPrice).toBeNull();

    // Opt-in açık → aynı non-owner targetPrice'ı görür.
    const shown = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "CONNECTIONS",
      showTargetToSuppliers: true,
    });
    await makeItem(prisma, shown.id, { targetPrice: 100 });
    const shownDetail = (await service.getOne(seller.auth, shown.id)) as {
      items: { targetPrice: string | null }[];
    };
    expect(shownDetail.items[0]?.targetPrice).toBe("100");
  });

  it("getOne: myBid version/submittedAt/eliminationReason döner", async () => {
    const { service } = makeService();
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, buyer.company.id, seller.company.id, buyer.user.id);
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "CONNECTIONS",
    });
    const bid = await makeBid(prisma, {
      listingId: l.id,
      bidderCompanyId: seller.company.id,
      createdById: seller.user.id,
      amount: 750,
      status: "LOST",
    });
    await prisma.listingBid.update({
      where: { id: bid.id },
      data: { version: 3, eliminationReason: "Fiyat yüksek" },
    });

    const detail = (await service.getOne(seller.auth, l.id)) as {
      myBid: {
        version: number;
        submittedAt: string | null;
        eliminationReason: string | null;
      } | null;
    };
    expect(detail.myBid?.version).toBe(3);
    expect(detail.myBid?.eliminationReason).toBe("Fiyat yüksek");
    expect(detail.myBid?.submittedAt).toBeTruthy();
  });

  it("kendi ilanı listede yer almaz; bağlantılı firmanın ilanı yer alır", async () => {
    const { service } = makeService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, buyer.company.id, seller.company.id, buyer.user.id);

    const own = await makeListing(prisma, {
      companyId: seller.company.id,
      createdById: seller.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
    });
    const theirs = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "CONNECTIONS",
    });

    const rows = await service.sellerTenders(seller.auth);
    expect(rows.find((r) => r.id === own.id)).toBeUndefined();
    expect(rows.find((r) => r.id === theirs.id)).toBeDefined();
  });
});
