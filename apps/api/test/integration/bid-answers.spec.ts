/**
 * Faz D — teklif formu genişletmeleri: kalem sorusu cevapları + kalem-özel
 * teslim tarihi + davetli teklif kuralı hizalaması.
 */
import { prisma, truncateAll } from "./test-db";
import {
  connect,
  invite,
  makeCompanyWithUser,
  makeItem,
  makeListing,
} from "./factories";
import { makeService } from "./make-service";

async function setup(over: { requireAllItems?: boolean } = {}) {
  const { service } = makeService();
  const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
  const seller = await makeCompanyWithUser(prisma, { country: "TR" });
  await connect(prisma, buyer.company.id, seller.company.id, buyer.user.id);
  const listing = await makeListing(prisma, {
    companyId: buyer.company.id,
    createdById: buyer.user.id,
    type: "ALIM",
    visibility: "CONNECTIONS",
    closesAt: new Date(Date.now() + 86_400_000),
    requireAllItems: over.requireAllItems ?? false,
  });
  const item = await makeItem(prisma, listing.id, { name: "Çelik Boru" });
  const question = await prisma.listingItemQuestion.create({
    data: {
      itemId: item.id,
      text: "Menşei ülke?",
      answerType: "TEXT",
      required: true,
    },
  });
  return { service, buyer, seller, listing, item, question };
}

const bidBase = {
  deliveryDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  validityDays: 30,
};

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("placeBid — kalem cevapları + kalem teslim tarihi", () => {
  it("cevap + kalem teslim tarihi kaydedilir; getOne myBid + sahip bids döner", async () => {
    const { service, buyer, seller, listing, item, question } = await setup();
    const itemDelivery = new Date(Date.now() + 3 * 86_400_000).toISOString();

    await service.placeBid(seller.auth, listing.id, {
      ...bidBase,
      items: [
        {
          itemId: item.id,
          unitPrice: 100,
          deliveryDate: itemDelivery,
          answers: [{ questionId: question.id, value: "Türkiye" }],
        },
      ],
    } as never);

    // Satıcı tarafı (getOne myBid).
    const sellerView = (await service.getOne(seller.auth, listing.id)) as {
      myBid: {
        answers: { questionId: string; value: string }[];
        items: { itemId: string; deliveryDate: string | null }[];
      };
    };
    expect(sellerView.myBid.answers).toEqual([
      { questionId: question.id, value: "Türkiye" },
    ]);
    expect(sellerView.myBid.items[0].deliveryDate).toBe(itemDelivery);

    // Alıcı tarafı (owner bids).
    const ownerView = (await service.getOne(buyer.auth, listing.id)) as {
      bids: {
        answers: { questionId: string; value: string }[];
        items: { deliveryDate: string | null }[];
      }[];
    };
    expect(ownerView.bids[0].answers[0].value).toBe("Türkiye");
    expect(ownerView.bids[0].items[0].deliveryDate).toBe(itemDelivery);
  });

  it("her kaleme teslim tarihi girildiyse GENEL teslim tarihi zorunlu değil", async () => {
    const { service, seller, listing, item, question } = await setup();
    const itemDelivery = new Date(Date.now() + 3 * 86_400_000).toISOString();
    // deliveryDate (genel) YOK — tüm kalemlerin kendi tarihi var.
    await service.placeBid(seller.auth, listing.id, {
      validityDays: 30,
      items: [
        {
          itemId: item.id,
          unitPrice: 100,
          deliveryDate: itemDelivery,
          answers: [{ questionId: question.id, value: "TR" }],
        },
      ],
    } as never);
    const bid = await prisma.listingBid.findFirstOrThrow({
      where: { listingId: listing.id, bidderCompanyId: seller.company.id },
    });
    expect(bid.status).toBe("SUBMITTED");
    expect(bid.deliveryDate).toBeNull(); // genel tarih girilmedi ama sorun değil
  });

  it("kalem teslim tarihi YOKSA ve genel de yoksa gönderim reddedilir", async () => {
    const { service, seller, listing, item, question } = await setup();
    await expect(
      service.placeBid(seller.auth, listing.id, {
        validityDays: 30, // deliveryDate YOK, kalem tarihi de YOK
        items: [
          {
            itemId: item.id,
            unitPrice: 100,
            answers: [{ questionId: question.id, value: "TR" }],
          },
        ],
      } as never),
    ).rejects.toThrow(/teslim tarihi/i);
  });

  it("GÖNDERİMDE zorunlu soru cevapsız → reddedilir; taslakta serbest", async () => {
    const { service, seller, listing, item } = await setup();

    await expect(
      service.placeBid(seller.auth, listing.id, {
        ...bidBase,
        items: [{ itemId: item.id, unitPrice: 100 }],
      } as never),
    ).rejects.toThrow(/Zorunlu kalem sorusu/);

    // Taslak aynı payload'la kabul edilir.
    const draft = await service.placeBid(seller.auth, listing.id, {
      ...bidBase,
      asDraft: true,
      items: [{ itemId: item.id, unitPrice: 100 }],
    } as never);
    expect(draft.status).toBe("DRAFT");
  });

  it("başka kalemin/uydurma sorunun cevabı reddedilir", async () => {
    const { service, seller, listing, item } = await setup();
    await expect(
      service.placeBid(seller.auth, listing.id, {
        ...bidBase,
        items: [
          {
            itemId: item.id,
            unitPrice: 100,
            answers: [{ questionId: "uydurma-id", value: "x" }],
          },
        ],
      } as never),
    ).rejects.toThrow(/Geçersiz soru cevabı/);
  });

  it("teklif güncellenince cevaplar yenilenir (eski cevap kalmaz)", async () => {
    const { service, seller, listing, item, question } = await setup();
    const payload = (value: string, asDraft: boolean) => ({
      ...bidBase,
      asDraft,
      items: [
        {
          itemId: item.id,
          unitPrice: 100,
          answers: [{ questionId: question.id, value }],
        },
      ],
    });
    await service.placeBid(seller.auth, listing.id, payload("İlk", true) as never);
    await service.placeBid(
      seller.auth,
      listing.id,
      payload("Güncel", false) as never,
    );
    const answers = await prisma.listingBidAnswer.findMany({
      where: { question: { itemId: item.id } },
    });
    expect(answers).toHaveLength(1);
    expect(answers[0].value).toBe("Güncel");
  });
});

describe("placeBid — davetli kuralı hizalaması", () => {
  it("bağlantısız ama DAVETLİ firma CONNECTIONS ilana teklif verebilir", async () => {
    const { service } = makeService();
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const outsider = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      type: "ALIM",
      visibility: "CONNECTIONS",
      closesAt: new Date(Date.now() + 86_400_000),
    });
    await invite(prisma, listing.id, outsider.company.id, buyer.user.id);

    const bid = await service.placeBid(outsider.auth, listing.id, {
      amount: 500,
      ...bidBase,
    } as never);
    expect(bid.status).toBe("SUBMITTED");
  });
});
