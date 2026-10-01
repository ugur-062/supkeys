/**
 * Arayüz testi api1-01 — talep sahibi API yanıtı ve paket düşüşü kuralları.
 *
 *  - Y-02: sahip GET'i maskesiz hedef fiyatı + aranan tedarikçi tipi + AI keşfi
 *    + davette firma adı ayarını döndürür; düzenle-kaydet döngüsü (formun
 *    GET'ten dolup TÜM alanları geri yazması) onları KORUR. Teklifçi dalı
 *    hedef fiyatı opt-in olmadan görmez, üç ayarı hiç almaz.
 *  - D-043: kazandırılmış talepte sahip yanıtı sipariş(ler)i taşır
 *    (`myOrder` + kalem bazlıda `orders`); sipariş doğunca ETag değişir.
 *  - O-010 (kullanıcı kararı T-06): paketi düşen (ya da süresi biten) firma
 *    talebi DÜZENLEYEMEZ, kapanışı UZATAMAZ; öne çekme ve iptal serbest.
 */
import { prisma, truncateAll } from "./test-db";
import { invite, makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { makeService } from "./make-service";

const DAY = 86_400_000;
const future = (days: number) => new Date(Date.now() + days * DAY);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

type OwnerDetail = {
  isOwner: true;
  etag: string;
  title: string;
  visibility: string;
  format: string;
  closesAt: Date | null;
  primaryCurrency: string;
  allowedCurrencies: string[];
  showTargetToSuppliers: boolean;
  preferredActivities: string[];
  aiDiscovery: boolean;
  inviteShowName: boolean;
  items: { name: string; quantity: string; unit: string; targetPrice: string | null }[];
  myOrder: { id: string; number: string | null; status: string } | null;
  orders: { id: string; number: string | null; status: string }[];
};

async function draftWithSettings() {
  const { service } = makeService();
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    status: "DRAFT",
    visibility: "PUBLIC",
    format: "RFQ",
    closesAt: future(10),
    showTargetToSuppliers: false,
    preferredActivities: ["MANUFACTURER", "DISTRIBUTOR"],
    aiDiscovery: true,
    inviteShowName: false,
  });
  await makeItem(prisma, listing.id, {
    lineNo: 1,
    name: "M6 cıvata",
    targetPrice: "45.50",
  });
  await makeItem(prisma, listing.id, {
    lineNo: 2,
    name: "Rulman",
    targetPrice: "120",
  });
  return { service, owner, listing };
}

describe("Y-02 — sahip yanıtı ve düzenle-kaydet döngüsü", () => {
  it("sahip GET'i maskesiz hedef fiyatı ve üç ayarı döndürür (hedef fiyat tedarikçiye kapalıyken de)", async () => {
    const { service, owner, listing } = await draftWithSettings();
    const d = (await service.getOne(owner.auth, listing.id)) as unknown as OwnerDetail;
    expect(d.isOwner).toBe(true);
    expect(d.items.map((i) => i.targetPrice)).toEqual(["45.5", "120"]);
    expect(d.preferredActivities).toEqual(["MANUFACTURER", "DISTRIBUTOR"]);
    expect(d.aiDiscovery).toBe(true);
    expect(d.inviteShowName).toBe(false);
  });

  it("formun GET'ten dolup yalnız başlığı değiştirerek kaydetmesi hedef fiyatı, tedarikçi tipini ve AI keşfini SİLMEZ", async () => {
    const { service, owner, listing } = await draftWithSettings();
    const d = (await service.getOne(owner.auth, listing.id)) as unknown as OwnerDetail;
    // Web düzenleme formunun gönderdiği gövdenin özü (map-detail-to-form →
    // map-to-input): her alan GET'ten, yalnız başlık değişti.
    await service.updateListing(owner.auth, listing.id, {
      type: "ALIM",
      asDraft: true,
      format: d.format,
      visibility: d.visibility,
      title: "Yeni başlık",
      closesAt: new Date(d.closesAt!).toISOString(),
      primaryCurrency: d.primaryCurrency,
      allowedCurrencies: d.allowedCurrencies,
      showTargetToSuppliers: d.showTargetToSuppliers,
      preferredActivities: d.preferredActivities,
      aiDiscovery: d.aiDiscovery,
      inviteShowName: d.inviteShowName,
      items: d.items.map((i) => ({
        name: i.name,
        quantity: Number(i.quantity),
        unit: i.unit,
        ...(i.targetPrice != null ? { targetPrice: Number(i.targetPrice) } : {}),
      })),
    } as never);

    const row = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      include: { items: { orderBy: { lineNo: "asc" } } },
    });
    expect(row.title).toBe("Yeni başlık");
    expect(row.items.map((i) => i.targetPrice?.toString())).toEqual(["45.5", "120"]);
    expect(row.preferredActivities).toEqual(["MANUFACTURER", "DISTRIBUTOR"]);
    expect(row.aiDiscovery).toBe(true);
    expect(row.inviteShowName).toBe(false);
  });

  it("teklifçi dalı: opt-in yoksa hedef fiyat null; sahibin üç ayarı yanıtta yok", async () => {
    const { service, owner, listing } = await draftWithSettings();
    await prisma.listing.update({
      where: { id: listing.id },
      data: { status: "OPEN", publishedAt: new Date(), visibility: "PRIVATE" },
    });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR", tier: "SILVER" });
    await invite(prisma, listing.id, bidder.company.id, owner.user.id);
    const v = (await service.getOne(bidder.auth, listing.id)) as unknown as Record<string, unknown> & {
      items: { targetPrice: string | null }[];
    };
    expect(v.isOwner).toBe(false);
    expect(v.items.every((i) => i.targetPrice === null)).toBe(true);
    expect(v).not.toHaveProperty("aiDiscovery");
    expect(v).not.toHaveProperty("inviteShowName");
    expect(v).not.toHaveProperty("preferredActivities");
    expect(v).not.toHaveProperty("orders");
  });
});

describe("D-043 — sahip yanıtında sipariş şeridi", () => {
  it("kazandırılmış talep: myOrder en yeni sipariş, orders hepsi (kalem bazlı); ETag sipariş doğunca değişir", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const s1 = await makeCompanyWithUser(prisma, { country: "TR" });
    const s2 = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      status: "AWARDED",
      format: "RFQ",
      closesAt: future(-1),
    });
    const before = (await service.getOne(owner.auth, listing.id)) as unknown as OwnerDetail;
    expect(before.myOrder).toBeNull();
    expect(before.orders).toEqual([]);

    const mk = (seller: string, number: string, createdAt: Date) =>
      prisma.companyOrder.create({
        data: {
          number,
          listingId: listing.id,
          sellerCompanyId: seller,
          buyerCompanyId: owner.company.id,
          amount: "100",
          createdAt,
        },
      });
    await mk(s1.company.id, "ORD-2026-9001", new Date(Date.now() - 60_000));
    const newest = await mk(s2.company.id, "ORD-2026-9002", new Date());

    const after = (await service.getOne(owner.auth, listing.id, before.etag)) as unknown as OwnerDetail;
    expect((after as unknown as { notModified?: boolean }).notModified).toBeUndefined();
    expect(after.myOrder).toMatchObject({ id: newest.id, number: "ORD-2026-9002" });
    expect(after.orders.map((o) => o.number)).toEqual(["ORD-2026-9002", "ORD-2026-9001"]);
  });
});

describe("O-010 — paketi düşen firma talebi düzenleyemez / kapanışı uzatamaz", () => {
  async function openListing(tier: "SILVER" | "STANDART" | "GOLD", membershipEndAt?: Date) {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR", tier });
    const closesAt = future(5);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      status: "OPEN",
      visibility: "CONNECTIONS",
      format: "RFQ",
      closesAt,
      publishedAt: new Date(),
    });
    await makeItem(prisma, listing.id);
    const auth = membershipEndAt ? { ...owner.auth, tier: "STANDART" } : owner.auth;
    return { service, owner, listing, closesAt, auth: auth as typeof owner.auth };
  }

  const editDto = (closesAt: Date) =>
    ({
      type: "ALIM",
      format: "RFQ",
      visibility: "CONNECTIONS",
      title: "Düzenlenmiş talep",
      closesAt: closesAt.toISOString(),
      primaryCurrency: "TRY",
      allowedCurrencies: ["TRY"],
      items: [{ name: "Yeni kalem", quantity: 1, unit: "adet" }],
    }) as never;

  it.each(["SILVER", "STANDART"] as const)("%s: PATCH talep 403 (Gold gerekir), talep değişmez", async (tier) => {
    const { service, auth, listing, closesAt } = await openListing(tier);
    await expect(service.updateListing(auth, listing.id, editDto(closesAt))).rejects.toThrow(
      /Gold paket/,
    );
    const row = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      include: { items: true },
    });
    expect(row.title).not.toBe("Düzenlenmiş talep");
    expect(row.items[0]!.name).not.toBe("Yeni kalem");
  });

  it("süresi biten Gold da düzenleyemez (JWT stratejisi efektif kademeyi STANDART verir)", async () => {
    const { service, auth, listing, closesAt } = await openListing("GOLD", future(-1));
    await expect(service.updateListing(auth, listing.id, editDto(closesAt))).rejects.toThrow(
      /Gold paket/,
    );
  });

  it("SILVER: kapanışı uzatma 403; öne çekme ve iptal serbest", async () => {
    const { service, auth, listing, closesAt } = await openListing("SILVER");
    await expect(
      service.changeClosingTime(auth, listing.id, new Date(closesAt.getTime() + 3 * DAY).toISOString()),
    ).rejects.toThrow(/Gold paket/);
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).closesAt?.getTime(),
    ).toBe(closesAt.getTime());

    const earlier = new Date(closesAt.getTime() - 2 * DAY);
    await expect(
      service.changeClosingTime(auth, listing.id, earlier.toISOString()),
    ).resolves.toMatchObject({ ok: true });
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).closesAt?.getTime(),
    ).toBe(earlier.getTime());

    await expect(service.cancel(auth, listing.id, "vazgeçtik")).resolves.toBeDefined();
  });

  it("GOLD: düzenleme ve uzatma serbest", async () => {
    const { service, auth, listing, closesAt } = await openListing("GOLD");
    await expect(
      service.changeClosingTime(auth, listing.id, new Date(closesAt.getTime() + 3 * DAY).toISOString()),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      service.updateListing(auth, listing.id, editDto(future(9))),
    ).resolves.toBeDefined();
  });
});
