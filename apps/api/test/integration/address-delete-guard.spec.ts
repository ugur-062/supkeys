/**
 * B2 (CL kör-nokta denetimi): adres silme guard'ı yalnız İLANLARI sayıyordu,
 * gönderilmiş TEKLİFLERİ değil. İlana verilen SUBMITTED teklifin
 * deliveryAddressId'si silinen adrese (onDelete:SetNull) işaret ederse bid
 * adressiz kalır, award'da order teslim-adressiz doğardı. Guard artık aktif
 * (SUBMITTED) teklifleri de kilitler; WON/AWARDED_PARTIAL zaten order'a
 * snapshot'landığından kilitlemez.
 */
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing, makeItem, makeBid } from "./factories";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyAddressesService } from "../../src/modules/company-addresses/company-addresses.service";
import { resolveCityId } from "../../src/common/geo/geo-index";

const svc = new CompanyAddressesService(
  prisma as never,
  new AuditService(prisma as never),
);
const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

// İlana teklif veren firma + kendi teslimat adresine bağlı bir teklif.
// (Satış ilanı tipi kaldırıldı; ListingBid.deliveryAddressId kolonu ve guard
// sözleşmesi duruyor — ALIM ilanıyla sınanır.)
async function setup(bidStatus: string) {
  const seller = await makeCompanyWithUser(prisma, { country: "TR" });
  const buyer = await makeCompanyWithUser(prisma, { country: "TR" }); // teklif veren
  const addr = await prisma.companyAddress.create({
    data: {
      companyId: buyer.company.id,
      type: "TESLIMAT",
      title: "Depo",
      addressLine: "Örnek mah. No:1",
      city: "İstanbul",
      country: "TR",
    },
  });
  const listing = await makeListing(prisma, {
    companyId: seller.company.id,
    createdById: seller.user.id,
    type: "ALIM",
    status: "OPEN",
    closesAt: FUTURE,
  });
  const item = await makeItem(prisma, listing.id);
  const bid = await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: buyer.company.id,
    createdById: buyer.user.id,
    amount: 100,
    status: bidStatus,
    items: [{ itemId: item.id, unitPrice: 100 }],
  });
  await prisma.listingBid.update({
    where: { id: bid.id },
    data: { deliveryAddressId: addr.id },
  });
  return { buyer, addr };
}

// Alıcının kendi talebinde teslimat adresi olarak kullanılan adres (cityId eşlenmemiş eski kayıt).
async function listingAddress(status: string) {
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const addr = await prisma.companyAddress.create({
    data: {
      companyId: owner.company.id,
      type: "TESLIMAT",
      title: "Depo",
      addressLine: "Örnek mah. No:1",
      city: "İstanbul",
      country: "TR",
    },
  });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: status as never,
    closesAt: FUTURE,
  });
  await prisma.listing.update({ where: { id: listing.id }, data: { deliveryAddressId: addr.id } });
  return { owner, addr };
}

describe("B2 — adres silme guard'ı gönderilmiş teklifleri de sayar", () => {
  it("SUBMITTED teklif adresi kullanıyorsa silme REDDEDİLİR (400) → adres kalır", async () => {
    const { buyer, addr } = await setup("SUBMITTED");
    await expect(svc.remove(buyer.auth, addr.id)).rejects.toThrow(
      /gönderilmiş teklifte/i,
    );
    expect(await prisma.companyAddress.count({ where: { id: addr.id } })).toBe(1);
  });

  it("teklif LOST ise adres silinebilir (kilit yalnız SUBMITTED)", async () => {
    const { buyer, addr } = await setup("LOST");
    await expect(svc.remove(buyer.auth, addr.id)).resolves.toEqual({ ok: true });
    expect(await prisma.companyAddress.count({ where: { id: addr.id } })).toBe(0);
  });
});

describe("adres CRUD — audit izi (INV-AUDIT-1)", () => {
  it("create/update/delete audit satırı bırakır; update changedFields taşır", async () => {
    const co = await makeCompanyWithUser(prisma, { country: "TR" });
    const addr = await svc.create(co.auth, {
      type: "TESLIMAT",
      title: "Depo",
      addressLine: "Örnek mah. No:1",
      city: "İstanbul",
    } as never);
    const created = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.address.created", entityId: addr.id },
    });
    expect(created.actorId).toBe(co.auth.userId);
    expect(created.tenantId).toBe(co.company.id);
    expect(created.metadata).toMatchObject({ type: "TESLIMAT", title: "Depo" });

    await svc.update(co.auth, addr.id, {
      type: "TESLIMAT",
      title: "Depo 2",
      addressLine: "Örnek mah. No:1",
      city: "Ankara",
    } as never);
    const updated = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.address.updated", entityId: addr.id },
    });
    expect(
      (updated.metadata as Record<string, unknown>).changedFields,
    ).toEqual(expect.arrayContaining(["title", "city"]));

    await svc.remove(co.auth, addr.id);
    await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.address.deleted", entityId: addr.id },
    });
  });

  it("moderasyonla kapatılmış (CLOSED) ilanın adresi SİLİNEMEZ — admin yeniden açınca ilan adressiz kalmasın (derin denetim S021)", async () => {
    const { owner, addr } = await listingAddress("CLOSED");
    // Sahip CLOSED ilanda adresi değiştiremez → "önce ilandaki adresi
    // değiştirin" değil, desteğe yönlendiren ayrı metin (LU-05 gözden geçirme).
    await expect(svc.remove(owner.auth, addr.id)).rejects.toThrow(/yönetici tarafından kapatılmış 1 ilanda.*destek/i);
    expect(await prisma.companyAddress.count({ where: { id: addr.id } })).toBe(1);
  });

  it("CLOSED ilandaki adresin YERİ de değiştirilemez; aktif ilan metni değil destek metni döner", async () => {
    const { owner, addr } = await listingAddress("CLOSED");
    await expect(
      svc.update(owner.auth, addr.id, {
        type: "TESLIMAT",
        title: "Depo",
        addressLine: "Örnek mah. No:1",
        city: "Ankara",
      } as never),
    ).rejects.toThrow(/yönetici tarafından kapatılmış.*adres bilgileri değiştirilemez.*destek/i);
    const row = await prisma.companyAddress.findUniqueOrThrow({ where: { id: addr.id } });
    expect(row.city).toBe("İstanbul");
  });

  it("şehir kilidi cityId ile ATLATILAMAZ: eski şehir metni + başka şehrin id'si REDDEDİLİR (derin denetim S021)", async () => {
    const { owner, addr } = await listingAddress("OPEN");
    const ankara = resolveCityId("TR", "Ankara");
    expect(ankara).not.toBeNull();
    await expect(
      svc.update(owner.auth, addr.id, {
        type: "TESLIMAT",
        title: "Depo",
        addressLine: "Örnek mah. No:1",
        city: "İstanbul",
        cityId: ankara,
      } as never),
    ).rejects.toThrow(/aktif ilanda/i);
    const row = await prisma.companyAddress.findUniqueOrThrow({ where: { id: addr.id } });
    expect(row.city).toBe("İstanbul");
  });

  it("kullanımdaki adreste yalnız iletişim alanı değişince (şehir aynı, id sonradan eşlense de) güncelleme SERBEST", async () => {
    const { owner, addr } = await listingAddress("OPEN");
    const u = await svc.update(owner.auth, addr.id, {
      type: "TESLIMAT",
      title: "Ana depo",
      addressLine: "Örnek mah. No:1",
      city: "istanbul",
    } as never);
    expect(u.title).toBe("Ana depo");
  });

  it("silme-kilidi reddi audit BIRAKMAZ (yalnız başarılı mutasyon loglanır)", async () => {
    const { buyer, addr } = await setup("SUBMITTED");
    await expect(svc.remove(buyer.auth, addr.id)).rejects.toThrow();
    expect(
      await prisma.auditLog.count({
        where: { action: "company.address.deleted", entityId: addr.id },
      }),
    ).toBe(0);
  });
});
