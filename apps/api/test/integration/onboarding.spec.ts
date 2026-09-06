/**
 * Faz 2 — Firma Doğrulama sihirbazı (completeOnboarding). Kurumsal kimlik +
 * TR vergi/TCKN doğrulama + kategori + adres + rol + onboardingCompletedAt.
 */
import { CompanyRole, Prisma } from "@rothern/db";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeUser } from "./factories";
import { makeAuthService } from "./make-auth-service";

// Geçerli TCKN (test): 10000000146. Şahıs firmasında vergi no = TCKN.
const TCKN = "10000000146";

async function makeCategory() {
  return prisma.category.create({
    data: {
      code: `1000${Math.floor(Math.random() * 9000 + 1000)}`.slice(0, 8),
      nameTr: "Yazılım & IT",
      level: 1,
      isActive: true,
    } as Prisma.CategoryUncheckedCreateInput,
  });
}

const dto = (categoryId: string, over: Record<string, unknown> = {}) => ({
  legalName: "Örnek Yazılım Ltd. Şti.",
  companyType: "SOLE_PROPRIETOR",
  country: "TR",
  taxNumber: TCKN,
  taxOffice: "Kadıköy",
  city: "İstanbul",
  district: "Kadıköy",
  neighborhood: "Caferağa",
  postalCode: "34710",
  addressLine: "Moda Cad. No:1",
  deliverySameAsBilling: true,
  authorizedTckn: TCKN,
  mainCategoryIds: [categoryId],
  declarationAccepted: true,
  ...over,
});

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("completeOnboarding", () => {
  it("geçerli veri → firma güncellenir + onboardingCompletedAt + adresler + rol", async () => {
    const { service } = makeAuthService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const cat = await makeCategory();

    await service.completeOnboarding(
      owner.user.id,
      owner.company.id,
      dto(cat.id) as never,
    );

    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.onboardingCompletedAt).not.toBeNull();
    expect(c.legalName).toBe("Örnek Yazılım Ltd. Şti.");
    expect(c.name).toBe("Örnek Yazılım Ltd. Şti.");
    expect(c.companyType).toBe("SOLE_PROPRIETOR");
    expect(c.taxNumber).toBe(TCKN);
    expect(c.buyerCategoryIds).toEqual([cat.id]);
    expect(c.sellerCategoryIds).toEqual([cat.id]);

    const u = await prisma.companyUser.findUniqueOrThrow({
      where: { id: owner.user.id },
    });
    // Faz R: SAHIP etikettir (op-izin vermez) — onboarding Kurucu'ya default
    // op-rolleri de yazar (salt-okunur başlamasın; istemezse Ayarlar'dan bırakır).
    expect(u.roles).toEqual([
      CompanyRole.SAHIP,
      CompanyRole.SATIN_ALMACI,
      CompanyRole.SATISCI,
    ]);

    const addrs = await prisma.companyAddress.findMany({
      where: { companyId: owner.company.id },
    });
    expect(addrs.map((a) => a.type).sort()).toEqual(["FATURA", "TESLIMAT"]);
  });

  it("Faz 5: kurucu kayıtta koltuk seçer — sellerSeat=false → yalnız SAHIP+SATIN_ALMACI, izin listesi ona göre", async () => {
    const { service } = makeAuthService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const cat = await makeCategory();
    await service.completeOnboarding(
      owner.user.id,
      owner.company.id,
      { ...dto(cat.id), sellerSeat: false } as never,
    );
    const u = await prisma.companyUser.findUniqueOrThrow({
      where: { id: owner.user.id },
    });
    expect(u.roles).toEqual([CompanyRole.SAHIP, CompanyRole.SATIN_ALMACI]);
    expect(u.permissions).toContain("buy:listing:manage");
    expect(u.permissions).not.toContain("sell:bid:submit");
  });

  it("geçersiz TCKN → reddedilir", async () => {
    const { service } = makeAuthService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const cat = await makeCategory();
    await expect(
      service.completeOnboarding(
        owner.user.id,
        owner.company.id,
        dto(cat.id, { taxNumber: "12345678901", authorizedTckn: "12345678901" }) as never,
      ),
    ).rejects.toThrow();
  });

  it("TR'de yetkili TCKN yoksa reddedilir", async () => {
    const { service } = makeAuthService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const cat = await makeCategory();
    await expect(
      service.completeOnboarding(
        owner.user.id,
        owner.company.id,
        dto(cat.id, { authorizedTckn: undefined }) as never,
      ),
    ).rejects.toThrow(/T\.C\.|TCKN|Kimlik/i);
  });

  // NOT: bu test eskiden DE (Almanya) kullanıyordu. 2026-09-01 kayıt kapısıyla
  // AB kapatıldı (bkz. docs/plan-country-registration.md) → AÇIK bir yabancı
  // ülkeye taşındı. Testin konusu ülke değil, "TR'ye özel alanlar yabancıda
  // zorunlu değil" kuralı.
  it("yabancı firma (KZ): TCKN/vergi dairesi/ilçe zorunlu değil, stateRegion kaydedilir", async () => {
    const { service } = makeAuthService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const cat = await makeCategory();
    await service.completeOnboarding(owner.user.id, owner.company.id, {
      ...dto(cat.id),
      country: "KZ",
      companyType: "LIMITED",
      taxNumber: "123456789012",
      taxOffice: undefined,
      district: undefined,
      stateRegion: "Almatı",
      city: "Almaty",
      authorizedTckn: undefined,
    } as never);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.country).toBe("KZ");
    expect(c.stateRegion).toBe("Almatı");
    expect(c.onboardingCompletedAt).not.toBeNull();
    expect(c.authorizedTckn).toBeNull();
  });

  it("KAPALI ülkeden yeni kayıt REDDEDİLİR (kayıt kapısı)", async () => {
    const { service } = makeAuthService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const cat = await makeCategory();
    await expect(
      service.completeOnboarding(owner.user.id, owner.company.id, {
        ...dto(cat.id),
        country: "DE", // AB kapalı
        companyType: "LIMITED",
        taxNumber: "DE811234567",
        taxOffice: undefined,
        district: undefined,
        city: "Munich",
        authorizedTckn: undefined,
      } as never),
    ).rejects.toThrow(/yeni kayıt alınmıyor/i);
  });

  it("KKTC (XN) kabul edilir — ISO listesinde olmamasına rağmen", async () => {
    // ISO 3166-1'de KKTC kodu yok; profil kapısı onu tanıyor. Bu test o
    // özel durumun uçtan uca çalıştığını sabitler.
    const { service } = makeAuthService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const cat = await makeCategory();
    await service.completeOnboarding(owner.user.id, owner.company.id, {
      ...dto(cat.id),
      country: "XN",
      companyType: "LIMITED",
      taxNumber: "KKTC-123456",
      taxOffice: undefined,
      district: undefined,
      city: "Lefkoşa",
      authorizedTckn: undefined,
    } as never);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.country).toBe("XN");
  });

  it("kategori seçilmezse reddedilir", async () => {
    const { service } = makeAuthService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      service.completeOnboarding(
        owner.user.id,
        owner.company.id,
        dto("x", { mainCategoryIds: [] }) as never,
      ),
    ).rejects.toThrow();
  });

  it("GÜVENLİK: sahip olmayan kullanıcı onboarding yapamaz (rol yükseltme engeli)", async () => {
    const { service } = makeAuthService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const cat = await makeCategory();
    // Aynı firmada ikinci (sahip olmayan) kullanıcı.
    const other = await makeUser(prisma, owner.company.id, [
      CompanyRole.SATISCI,
    ]);
    await expect(
      service.completeOnboarding(
        other.id,
        owner.company.id,
        dto(cat.id) as never,
      ),
    ).rejects.toThrow(/sahibi/i);
    // Firma dokunulmamış olmalı.
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.onboardingCompletedAt).toBeNull();
  });

  it("GÜVENLİK: onboarding tekrar çağrılamaz (idempotent — adres ezme engeli)", async () => {
    const { service } = makeAuthService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const cat = await makeCategory();
    await service.completeOnboarding(
      owner.user.id,
      owner.company.id,
      dto(cat.id) as never,
    );
    await expect(
      service.completeOnboarding(
        owner.user.id,
        owner.company.id,
        dto(cat.id) as never,
      ),
    ).rejects.toThrow(/zaten tamamlan/i);
  });
});

describe("upgradeToPremium (Faz 3 kapısı)", () => {
  it("doğrulanmamış firma reddedilir", async () => {
    const { service } = makeAuthService({ PREMIUM_SELF_UPGRADE_ENABLED: "true" });
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    await expect(
      service.upgradeToPremium(owner.user.id, owner.company.id),
    ).rejects.toThrow(/belge|doğrula/i);
  });

  it("VERIFIED ama 2FA yoksa reddedilir", async () => {
    const { service } = makeAuthService({ PREMIUM_SELF_UPGRADE_ENABLED: "true" });
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    await prisma.company.update({
      where: { id: owner.company.id },
      data: { companyVerificationStatus: "VERIFIED" },
    });
    await expect(
      service.upgradeToPremium(owner.user.id, owner.company.id),
    ).rejects.toThrow(/2FA|iki adım/i);
  });

  it("GÜVENLİK: sahip olmayan kullanıcı paket yükseltemez", async () => {
    const { service } = makeAuthService({ PREMIUM_SELF_UPGRADE_ENABLED: "true" });
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    await prisma.company.update({
      where: { id: owner.company.id },
      data: { companyVerificationStatus: "VERIFIED" },
    });
    // Sahip olmayan, hatta 2FA'lı kullanıcı bile yükseltemez.
    const other = await makeUser(prisma, owner.company.id, [
      CompanyRole.YONETICI,
    ]);
    await prisma.companyUser.update({
      where: { id: other.id },
      data: { twoFactorEnabled: true },
    });
    await expect(
      service.upgradeToPremium(other.id, owner.company.id),
    ).rejects.toThrow(/sahibi/i);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.tier).toBe("STANDART");
  });

  it("VERIFIED + 2FA → tier PAKET", async () => {
    const { service } = makeAuthService({ PREMIUM_SELF_UPGRADE_ENABLED: "true" });
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    await prisma.company.update({
      where: { id: owner.company.id },
      data: {
        companyVerificationStatus: "VERIFIED",
        website: "https://firma.test",
      },
    });
    await prisma.companyUser.update({
      where: { id: owner.user.id },
      data: { twoFactorEnabled: true },
    });
    const res = await service.upgradeToPremium(owner.user.id, owner.company.id);
    expect(res.tier).toBe("GOLD");
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.tier).toBe("GOLD");
  });

  it("VERIFIED + 2FA ama web sitesi yoksa reddedilir", async () => {
    const { service } = makeAuthService({ PREMIUM_SELF_UPGRADE_ENABLED: "true" });
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    await prisma.company.update({
      where: { id: owner.company.id },
      data: { companyVerificationStatus: "VERIFIED", website: null },
    });
    await prisma.companyUser.update({
      where: { id: owner.user.id },
      data: { twoFactorEnabled: true },
    });
    await expect(
      service.upgradeToPremium(owner.user.id, owner.company.id),
    ).rejects.toThrow(/web sitesi/i);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.tier).toBe("STANDART");
  });
});
