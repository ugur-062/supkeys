import { Prisma } from "@prisma/client";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing, makeItem, makeBid } from "./factories";
import { makeService } from "./make-service";

/**
 * Perf turu (denetim P10) — ilan detayı ETag/304 sözleşmesi.
 *
 * İki ayrı garanti test edilir:
 *  (A) GÜVENLİK — 304 asla yetki kapısını atlamaz.
 *  (B) TAMLIK — payload'ı etkileyen HER kaynak parmak izini değiştirir.
 *      Bu ikincisi kritik: bir kaynak unutulursa 304 dönülür ve kullanıcının
 *      ekranı SESSİZCE bayat kalır (yeni ve daha sinsi bir hata sınıfı).
 */
describe("İlan detayı ETag/304", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function setup() {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const bidder = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
    });
    const item = await makeItem(prisma, listing.id, {
      quantity: new Prisma.Decimal(5),
    });
    return { service, owner, bidder, listing, item };
  }

  /** Sahip detayını çekip etag'i döndürür. */
  async function fetchEtag(
    service: ReturnType<typeof makeService>["service"],
    owner: Awaited<ReturnType<typeof setup>>["owner"],
    listingId: string,
  ): Promise<string> {
    const res = (await service.getOne(owner.auth, listingId)) as {
      etag?: string;
    };
    expect(typeof res.etag).toBe("string");
    return res.etag!;
  }

  describe("A — güvenlik", () => {
    it("sahip DOĞRU etag ile 304 alır", async () => {
      const { service, owner, listing } = await setup();
      const etag = await fetchEtag(service, owner, listing.id);
      const again = (await service.getOne(owner.auth, listing.id, etag)) as {
        notModified?: boolean;
      };
      expect(again.notModified).toBe(true);
    });

    it("YABANCI firma, sahibin etag'ini bilse bile 304 ALMAZ", async () => {
      const { service, owner, bidder, listing } = await setup();
      const etag = await fetchEtag(service, owner, listing.id);
      // Kapıdan geçemeyen istek 304 değil, normal (non-owner) yanıt almalı —
      // 304 kısayolu sahiplik kapısının ARDINDA.
      const res = (await service.getOne(bidder.auth, listing.id, etag)) as {
        notModified?: boolean;
        isOwner?: boolean;
      };
      expect(res.notModified).toBeUndefined();
      expect(res.isOwner).not.toBe(true);
    });

    it("GÖRÜNMEYEN ilanda etag'li istek yine 404 (304'e düşmez)", async () => {
      const { service, owner, bidder, listing } = await setup();
      const etag = await fetchEtag(service, owner, listing.id);
      await prisma.listing.update({
        where: { id: listing.id },
        data: { visibility: "PRIVATE" },
      });
      await expect(
        service.getOne(bidder.auth, listing.id, etag),
      ).rejects.toThrow(/bulunamadı/i);
    });

    it("uydurma etag 304 üretmez", async () => {
      const { service, owner, listing } = await setup();
      await fetchEtag(service, owner, listing.id);
      const res = (await service.getOne(
        owner.auth,
        listing.id,
        'W/"uydurma"',
      )) as { notModified?: boolean };
      expect(res.notModified).toBeUndefined();
    });
  });

  describe("B — tamlık: her kaynak parmak izini DEĞİŞTİRMELİ", () => {
    it("ilanın kendisi değişince", async () => {
      const { service, owner, listing } = await setup();
      const before = await fetchEtag(service, owner, listing.id);
      await prisma.listing.update({
        where: { id: listing.id },
        data: { title: "Yeni başlık" },
      });
      expect(await fetchEtag(service, owner, listing.id)).not.toBe(before);
    });

    it("YENİ TEKLİF gelince", async () => {
      const { service, owner, bidder, listing, item } = await setup();
      const before = await fetchEtag(service, owner, listing.id);
      await makeBid(prisma, {
        listingId: listing.id,
        bidderCompanyId: bidder.company.id,
        createdById: bidder.user.id,
        amount: 100,
        items: [{ itemId: item.id, unitPrice: 20 }],
      });
      expect(await fetchEtag(service, owner, listing.id)).not.toBe(before);
    });

    it("MEVCUT teklif güncellenince (sayı değişmese de)", async () => {
      const { service, owner, bidder, listing, item } = await setup();
      const bid = await makeBid(prisma, {
        listingId: listing.id,
        bidderCompanyId: bidder.company.id,
        createdById: bidder.user.id,
        amount: 100,
        items: [{ itemId: item.id, unitPrice: 20 }],
      });
      const before = await fetchEtag(service, owner, listing.id);
      await prisma.listingBid.update({
        where: { id: bid.id },
        data: { status: "LOST" },
      });
      expect(await fetchEtag(service, owner, listing.id)).not.toBe(before);
    });

    it("KALEM düzenlenince (bu yüzden listing_items.updatedAt eklendi)", async () => {
      const { service, owner, listing, item } = await setup();
      const before = await fetchEtag(service, owner, listing.id);
      await prisma.listingItem.update({
        where: { id: item.id },
        data: { name: "Değişti" },
      });
      expect(await fetchEtag(service, owner, listing.id)).not.toBe(before);
    });

    it("DAVET eklenip kaldırılınca (davet DEĞİŞMEZ → sayı-bazlı parmak izi)", async () => {
      const { service, owner, bidder, listing } = await setup();
      const before = await fetchEtag(service, owner, listing.id);
      const inv = await prisma.listingInvitation.create({
        data: {
          listingId: listing.id,
          invitedCompanyId: bidder.company.id,
          invitedById: owner.user.id,
        },
      });
      const afterAdd = await fetchEtag(service, owner, listing.id);
      expect(afterAdd).not.toBe(before);
      await prisma.listingInvitation.delete({ where: { id: inv.id } });
      expect(await fetchEtag(service, owner, listing.id)).not.toBe(afterAdd);
    });

    it("ONAY isteği doğunca (kazandırma onayı ekranı değişir)", async () => {
      const { service, owner, listing } = await setup();
      const before = await fetchEtag(service, owner, listing.id);
      await prisma.approvalRequest.create({
        data: {
          companyId: owner.company.id,
          listingId: listing.id,
          type: "LISTING_AWARD",
          status: "PENDING",
          createdById: owner.user.id,
          amount: new Prisma.Decimal(100),
          currency: "TRY",
        },
      });
      expect(await fetchEtag(service, owner, listing.id)).not.toBe(before);
    });
  });
});
