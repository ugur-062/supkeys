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

    // browse() PRIVATE'ı hiç göstermez (mevcut davranış).
    const browse = await service.browse(seller.auth);
    expect(browse.find((r) => r.id === l.id)).toBeUndefined();

    // sellerTenders davetli PRIVATE'ı gösterir.
    const rows = await service.sellerTenders(seller.auth);
    const row = rows.find((r) => r.id === l.id);
    expect(row).toBeDefined();
    expect(row!.invited).toBe(true);
    expect(row!.canBid).toBe(true);
    expect(row!.masked).toBe(false);
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

  it("STANDARD firma PUBLIC ilanı davetsizce göremez; PAKET görür (mevcut kural)", async () => {
    const { service } = makeService();
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const standard = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDARD",
    });
    const premium = await makeCompanyWithUser(prisma, { country: "TR" });
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
    });

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
      tier: "STANDARD",
    });
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
    });
    await invite(prisma, l.id, standard.company.id, buyer.user.id);

    const detail = (await service.getOne(standard.auth, l.id)) as {
      masked: boolean;
      canBid: boolean;
      invited: boolean;
    };
    expect(detail.invited).toBe(true);
    expect(detail.masked).toBe(false); // davet maskeyi kaldırır
    expect(detail.canBid).toBe(true); // davetli her görünürlükte teklif verir
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

  it("kendi ilanı ve SATIS ilanları listede yer almaz", async () => {
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
    const satis = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "SATIS",
      visibility: "CONNECTIONS",
    });

    const rows = await service.sellerTenders(seller.auth);
    expect(rows.find((r) => r.id === own.id)).toBeUndefined();
    expect(rows.find((r) => r.id === satis.id)).toBeUndefined();
  });
});
