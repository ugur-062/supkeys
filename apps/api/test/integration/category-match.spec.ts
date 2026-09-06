/**
 * PUBLIC ilan → kategori eşleşmeli bildirim (notifyCategoryMatchedCompanies).
 * Yön: ALIM→satıcılar (sellerCategoryIds). (Satış ilanı tipi kaldırıldı.)
 * billingEmail yoksa ilk aktif kullanıcıya düşer (kapsama boşluğu fix'i).
 *
 * NOT: Gerçek DB'de Category.id = 8-haneli kod (seed-categories id:c.code). Firma
 * ve ilan kategori dizileri bu kodları tutar; matcher kod türetir. Bu yüzden test
 * dizileri de 8-haneli kod kullanır (Category satırı gerekmez — matcher join'lemez).
 */
import { CompanyRole } from "@rothern/db";
import { prisma, truncateAll } from "./test-db";
import { makeCompany, makeCompanyWithUser, makeListing, makeUser } from "./factories";
import { makeService } from "./make-service";

const SEG = "10000000"; // segment (level 1) — onboarding'in kaydettiği biçim
const CLASS = "10101500"; // ilan kategorisi (class) → segment SEG'e türer

/** email.send çağrılarından alıcı e-postalarını çıkarır. */
function sentEmails(email: { send: jest.Mock }): string[] {
  return email.send.mock.calls.map((c) => c[0].to.email);
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("notifyCategoryMatchedCompanies — ALIM → satıcılar", () => {
  it("PUBLIC ALIM ilanı → segment eşleşen PAKET+SATISCI satıcıya bildirim", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { sellerCategoryIds: [SEG], billingEmail: "satici@firma.com" },
    });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      categoryIds: [CLASS],
    });

    const matched = await service.notifyCategoryMatchedCompanies(listing.id);
    expect(matched).toHaveLength(1);
    expect(sentEmails(email)).toEqual(["satici@firma.com"]);
  });

  it("KAPSAMA FIX: billingEmail yoksa firmanın ilk aktif kullanıcısına düşer", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    // billingEmail YOK — eskiden bu firma sessizce atlanıyordu.
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { sellerCategoryIds: [SEG] },
    });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      categoryIds: [CLASS],
    });

    await service.notifyCategoryMatchedCompanies(listing.id);
    // seller.user.email'e düşmeli (atlanmamalı).
    expect(sentEmails(email)).toEqual([seller.user.email]);
  });

  it("kategori eşleşmeyen satıcı bildirilmez", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { sellerCategoryIds: ["20000000"], billingEmail: "x@firma.com" },
    });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      categoryIds: [CLASS],
    });
    const matched = await service.notifyCategoryMatchedCompanies(listing.id);
    expect(matched).toEqual([]);
    expect(email.send).not.toHaveBeenCalled();
  });

  it("ALIM ilanında yalnız-ALICI firma (SATISCI yok) bildirilmez", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    // buyerCategoryIds eşleşiyor ama SATISCI kullanıcı yok → ALIM için aday değil.
    const buyerOnly = await makeCompany(prisma, { country: "TR", tier: "GOLD" });
    await makeUser(prisma, buyerOnly.id, [CompanyRole.SATIN_ALMACI]);
    await prisma.company.update({
      where: { id: buyerOnly.id },
      data: { buyerCategoryIds: [SEG], billingEmail: "b@firma.com" },
    });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      categoryIds: [CLASS],
    });
    const matched = await service.notifyCategoryMatchedCompanies(listing.id);
    expect(matched).toEqual([]);
    expect(email.send).not.toHaveBeenCalled();
  });

  it("F1 (INV-TIER-1): süresi DOLMUŞ PAKET satıcı duyuruyu KİLİTLİ varyantla alır (efektif STANDART, 2026-09-06)", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.company.update({
      where: { id: seller.company.id },
      data: {
        sellerCategoryIds: [SEG],
        billingEmail: "expired@firma.com",
        tier: "GOLD",
        membershipEndAt: new Date(Date.now() - 86_400_000), // dün doldu (lazy)
      },
    });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      categoryIds: [CLASS],
    });
    const matched = await service.notifyCategoryMatchedCompanies(listing.id);
    // Ham tier PAKET görünse de efektif STANDART → aday AMA metin kilitli:
    // talep ona görünmez, e-posta "Silver ile açılır" der, CTA paket sayfası
    // (talep bağlantısı VERİLMEZ — 403 alırdı).
    expect(matched.map((c: { id: string }) => c.id)).toEqual([seller.company.id]);
    expect(email.send).toHaveBeenCalledTimes(1);
    const sent = (email.send as jest.Mock).mock.calls[0][0] as { subject: string; templateData: unknown };
    expect(sent.subject).toMatch(/Silver ile açılır/);
    const payload = JSON.stringify(sent.templateData);
    expect(payload).toContain("/nasil-calisir#fiyatlar");
    expect(payload).not.toContain("/company/ilan/");
  });

  it("F1 kontrol: GELECEK bitişli PAKET satıcı duyuru ALIR (efektif PAKET)", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.company.update({
      where: { id: seller.company.id },
      data: {
        sellerCategoryIds: [SEG],
        billingEmail: "aktif@firma.com",
        tier: "GOLD",
        membershipEndAt: new Date(Date.now() + 86_400_000),
      },
    });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      categoryIds: [CLASS],
    });
    const matched = await service.notifyCategoryMatchedCompanies(listing.id);
    expect(matched).toHaveLength(1);
    expect(sentEmails(email)).toEqual(["aktif@firma.com"]);
  });

  it("PUBLIC olmayan (CONNECTIONS) ilan hiç kimseye yayınlanmaz", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { sellerCategoryIds: [SEG], billingEmail: "s@firma.com" },
    });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      visibility: "CONNECTIONS",
      categoryIds: [CLASS],
    });
    const matched = await service.notifyCategoryMatchedCompanies(listing.id);
    expect(matched).toEqual([]);
    expect(email.send).not.toHaveBeenCalled();
  });
});
