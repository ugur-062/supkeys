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
import { FREE_PERIOD } from "../../src/common/company/effective-tier";

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

  it("F1 (INV-TIER-1): saklı paketinin süresi DOLMUŞ, doğrulanmamış satıcı duyuruyu KİLİTLİ varyantla alır (efektif STANDART); çağrı doğrulamadır, paket anılmaz", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    // Doğrulanmamış firma saklı kademesiyle kalır → süre kuralı (lazy) ona işler.
    const seller = await makeCompanyWithUser(prisma, { country: "TR", companyVerificationStatus: "UNVERIFIED" });
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
    // talep ona görünmez, e-posta ücretsiz doğrulamaya çağırır
    // (talep bağlantısı VERİLMEZ — 403 alırdı).
    expect(matched.map((c: { id: string }) => c.id)).toEqual([seller.company.id]);
    expect(email.send).toHaveBeenCalledTimes(1);
    const sent = (email.send as jest.Mock).mock.calls[0][0] as { subject: string; templateData: unknown };
    expect(sent.subject).toMatch(/teklif vermek için doğrulanın/);
    const payload = JSON.stringify(sent.templateData);
    expect(payload).toContain("/company/ayarlar/dogrulama");
    expect(payload).toContain("Ücretsiz doğrulan");
    expect(payload).not.toContain("/company/ilan/");
    // Ücretsiz dönem: hiçbir metin paket adı / paket sayfası taşımaz.
    expect(payload).not.toContain("/company/premium");
    expect(`${sent.subject} ${payload}`).not.toMatch(/silver|gold/i);
  });

  it("ücretsiz dönem: saklı paketinin süresi dolmuş DOĞRULANMIŞ satıcı tam erişimlidir → AÇIK metin, talep bağlantısı", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.company.update({
      where: { id: seller.company.id },
      data: {
        sellerCategoryIds: [SEG],
        billingEmail: "dogrulanmis@firma.com",
        tier: "SILVER",
        membershipEndAt: new Date(Date.now() - 86_400_000),
      },
    });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      categoryIds: [CLASS],
    });
    await service.notifyCategoryMatchedCompanies(listing.id);
    expect(email.send).toHaveBeenCalledTimes(1);
    const sent = (email.send as jest.Mock).mock.calls[0][0] as { subject: string; templateData: unknown };
    expect(sent.subject).not.toMatch(/doğrulanın/);
    expect(JSON.stringify(sent.templateData)).toContain(`/company/ilan/${listing.id}`);
  });

  it("incelemedeki (PENDING) kilitli satıcıya 'doğrulanın' denmez: onay bekleniyor metni + durum bağlantısı", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR", tier: "STANDART", companyVerificationStatus: "PENDING" });
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { sellerCategoryIds: [SEG], billingEmail: "incelemede@firma.com" },
    });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      categoryIds: [CLASS],
    });
    await service.notifyCategoryMatchedCompanies(listing.id);
    expect(email.send).toHaveBeenCalledTimes(1);
    const payload = JSON.stringify((email.send as jest.Mock).mock.calls[0][0].templateData);
    expect(payload).toContain("inceleniyor");
    expect(payload).toContain("Doğrulama durumunu gör");
    expect(payload).toContain("/company/ayarlar/dogrulama");
    expect(payload).not.toContain("/company/ilan/");
  });

  describe("saklı paket süresi (ücretsiz dönem anahtarı KAPALI)", () => {
    // Süre kuralı doğrulanmış firmaya yalnız anahtar kapalıyken işler; paket metinleri kaldırıldığı için o firmaya çağrı gitmez.
    beforeEach(() => {
      jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("F1: süresi DOLMUŞ paketli doğrulanmış satıcı efektif STANDART'tır → talep bağlantılı duyuru ALMAZ; süresi dolmamış paketli alır", async () => {
      const { service, email } = makeService();
      const owner = await makeCompanyWithUser(prisma, { country: "TR" });
      const expired = await makeCompanyWithUser(prisma, { country: "TR" });
      const live = await makeCompanyWithUser(prisma, { country: "TR" });
      await prisma.company.update({
        where: { id: expired.company.id },
        data: {
          sellerCategoryIds: [SEG],
          billingEmail: "expired@firma.com",
          tier: "GOLD",
          membershipEndAt: new Date(Date.now() - 86_400_000), // dün doldu (lazy)
        },
      });
      await prisma.company.update({
        where: { id: live.company.id },
        data: {
          sellerCategoryIds: [SEG],
          billingEmail: "aktif@firma.com",
          tier: "SILVER",
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
      expect(matched.map((c: { id: string }) => c.id).sort()).toEqual(
        [expired.company.id, live.company.id].sort(),
      );
      // Ham tier PAKET görünse de efektif STANDART → talebi açan e-posta ona GİTMEZ.
      expect(sentEmails(email)).toEqual(["aktif@firma.com"]);
      const payload = JSON.stringify((email.send as jest.Mock).mock.calls[0][0].templateData);
      expect(payload).toContain(`/company/ilan/${listing.id}`);
    });
  });

  it("DOĞRULANMAMIŞ (sınırlı) satıcıya ücretsiz doğrulama çağrısı; talep bağlantısı yok", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR", tier: "STANDART", companyVerificationStatus: "UNVERIFIED" });
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { sellerCategoryIds: [SEG], billingEmail: "belgesiz@firma.com" },
    });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      categoryIds: [CLASS],
    });
    await service.notifyCategoryMatchedCompanies(listing.id);
    expect(email.send).toHaveBeenCalledTimes(1);
    const payload = JSON.stringify((email.send as jest.Mock).mock.calls[0][0].templateData);
    expect(payload).toContain("/company/ayarlar/dogrulama");
    expect(payload).toContain("Ücretsiz doğrulan");
    expect(payload).not.toContain("/company/ilan/");
  });

  it("doğrulanmamış ama alıcıyla GEÇERLİ bağlantılı satıcı AÇIK metni alır (talebi görebilir) — denetim #5", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR", tier: "STANDART", companyVerificationStatus: "UNVERIFIED" });
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { sellerCategoryIds: [SEG], billingEmail: "bagli@firma.com" },
    });
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: owner.company.id,
        inviteeCompanyId: seller.company.id,
        invitedById: owner.user.id,
        status: "ACTIVE",
        origin: "PREMIUM",
        decidedAt: new Date(),
      },
    });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      categoryIds: [CLASS],
    });
    await service.notifyCategoryMatchedCompanies(listing.id);
    expect(email.send).toHaveBeenCalledTimes(1);
    const sent = (email.send as jest.Mock).mock.calls[0][0] as { subject: string; templateData: unknown };
    expect(sent.subject).not.toMatch(/Silver|doğrulanın/);
    // Açık metin doğrudan talebe götürür (eskiden Açık Talepler listesine).
    expect(JSON.stringify(sent.templateData)).toContain(`/company/ilan/${listing.id}`);
  });

  it("F1 kontrol: GELECEK bitişli saklı PAKETi olan doğrulanmamış satıcı duyuru ALIR (efektif PAKET — kimse erişim yitirmez)", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR", companyVerificationStatus: "UNVERIFIED" });
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

  it("GÜNDE 3 ANINDA (Faz 2): bugün 3 kategori e-postası almış adrese 4.'sü AKŞAM ÖZETİNE düşer; 'hepsi anında' sınırı kaldırır", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { sellerCategoryIds: [SEG], billingEmail: "satici@firma.com" },
    });
    for (let i = 0; i < 3; i++) {
      await prisma.emailLog.create({
        data: {
          template: "notification",
          toEmail: "satici@firma.com",
          subject: "s",
          provider: "test",
          status: "SENT",
          contextType: "listing_category_match",
          contextId: `onceki-${i}`,
        },
      });
    }
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      categoryIds: [CLASS],
    });
    await service.notifyCategoryMatchedCompanies(listing.id);
    expect(sentEmails(email)).toEqual([]);
    const item = await prisma.emailDigestItem.findFirstOrThrow({ where: { email: "satici@firma.com" } });
    expect(item).toMatchObject({ listingId: listing.id, kind: "CATEGORY_MATCH", sentAt: null });

    // Kullanıcı alıcı + "hepsi anında" → sınır yok.
    const { service: s2, email: e2 } = makeService();
    const seller2 = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.company.update({ where: { id: seller2.company.id }, data: { sellerCategoryIds: [SEG] } });
    await prisma.companyUser.update({
      where: { id: seller2.user.id },
      data: { notificationPrefs: { categoryMatchInstant: true } },
    });
    for (let i = 0; i < 3; i++) {
      await prisma.emailLog.create({
        data: {
          template: "notification",
          toEmail: seller2.user.email,
          subject: "s",
          provider: "test",
          status: "SENT",
          contextType: "listing_category_match",
          contextId: `x-${i}`,
        },
      });
    }
    const l2 = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      visibility: "PUBLIC",
      categoryIds: [CLASS],
    });
    await s2.notifyCategoryMatchedCompanies(l2.id);
    expect(sentEmails(e2)).toContain(seller2.user.email);
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
