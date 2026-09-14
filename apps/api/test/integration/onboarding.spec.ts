/**
 * Faz 2 — Firma Doğrulama sihirbazı (completeOnboarding). Kurumsal kimlik +
 * TR vergi/TCKN doğrulama + kategori + adres + rol + onboardingCompletedAt.
 */
import { ensureOwnerBuySeat } from "../../src/common/company/owner-buy-seat";
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
    // op-rol yazar (salt-okunur başlamasın). 2026-09-14'ten beri YALNIZ satış:
    // satınalma koltuğu ücretsiz pakette kullanılamıyor ve iki koltuktan birini
    // boşuna yakıyordu; GOLD'a geçişte açılıyor.
    expect(u.roles).toEqual([
      CompanyRole.SAHIP,
      CompanyRole.SATISCI,
    ]);

    const addrs = await prisma.companyAddress.findMany({
      where: { companyId: owner.company.id },
    });
    expect(addrs.map((a) => a.type).sort()).toEqual(["FATURA", "TESLIMAT"]);
  });

  /**
   * KOLTUK SORUSU KALDIRILDI (2026-09-14, kullanıcı kararı). Kurucu SATIŞ
   * koltuğuyla doğar; satınalma koltuğu ücretsiz pakette kullanılamadığı için
   * (talep açmak GOLD ister) verilmez — verilseydi kurucu tek başına
   * STANDART'ın 2 koltuğunun ikisini de doldurur ve firma ilk çalışanını
   * davet edemezdi. Satınalma koltuğu GOLD'a geçişte açılır.
   */
  /**
   * PROFİL OTOMATİK YAYINA ALINIR (2026-09-15, kullanıcı kararı). Öncesinde
   * `publicEnabled` varsayılanı false'tu ve firmaların çoğu hiç açmıyordu →
   * canlıda `companies.xml` 0 URL, yani SEO motoru kurulu ama yakıtsızdı.
   * Slug BURADA kuruluyor çünkü firma adı ancak burada gerçek oluyor (signup
   * geçici ad üretir).
   */
  it("kayıt tamamlanınca profil YAYINA alınır ve slug kurulur", async () => {
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
    expect(c.publicEnabled).toBe(true);
    expect(c.slug).toBeTruthy();
    // Slug firma ADINDAN türer — signup'ın geçici adından değil.
    expect(c.slug).toMatch(/ornek|test|firma/i);
  });

  it("aynı adla ikinci firma ÇAKIŞMAZ — slug tekilleştirilir", async () => {
    const { service } = makeAuthService();
    const cat = await makeCategory();
    const slugs: (string | null)[] = [];
    // AYNI unvan, FARKLI vergi kimliği — vergi no unique, slug çakışması
    // sınanacak tek şey olsun. İkincisi yabancı (KZ): TR VKN checksum'ı
    // gerektirmeden ikinci geçerli kimlik üretmenin en temiz yolu.
    const varyant = [
      { country: "TR", taxNumber: TCKN, authorizedTckn: TCKN },
      { country: "KZ", taxNumber: "123456789012", authorizedTckn: undefined, taxOffice: undefined, district: undefined },
    ];
    for (const v of varyant) {
      const o = await makeCompanyWithUser(prisma, { country: v.country });
      await service.completeOnboarding(
        o.user.id,
        o.company.id,
        dto(cat.id, v) as never,
      );
      const c = await prisma.company.findUniqueOrThrow({ where: { id: o.company.id } });
      slugs.push(c.slug);
    }
    expect(slugs[0]).toBeTruthy();
    expect(slugs[1]).toBeTruthy();
    expect(slugs[0]).not.toBe(slugs[1]);
  });

  it("kurucu kayıtta YALNIZ satış koltuğu alır — satınalma koltuğu ücretsiz pakette yakılmaz", async () => {
    const { service } = makeAuthService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const cat = await makeCategory();
    await service.completeOnboarding(
      owner.user.id,
      owner.company.id,
      dto(cat.id) as never,
    );
    const u = await prisma.companyUser.findUniqueOrThrow({
      where: { id: owner.user.id },
    });
    expect(u.roles).toEqual([CompanyRole.SAHIP, CompanyRole.SATISCI]);
    expect(u.permissions).toContain("sell:bid:submit");
    expect(u.permissions).not.toContain("buy:listing:manage");
  });

  it("GOLD'a geçişte kurucunun satınalma koltuğu AÇILIR", async () => {
    const { service } = makeAuthService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const cat = await makeCategory();
    await service.completeOnboarding(
      owner.user.id,
      owner.company.id,
      dto(cat.id) as never,
    );
    await prisma.company.update({
      where: { id: owner.company.id },
      data: { tier: "GOLD", membershipEndAt: null },
    });
    await ensureOwnerBuySeat(prisma, owner.company.id);

    const u = await prisma.companyUser.findUniqueOrThrow({
      where: { id: owner.user.id },
    });
    expect(u.roles).toContain(CompanyRole.SATIN_ALMACI);
    expect(u.permissions).toContain("buy:listing:manage");
    // Satış koltuğu KAYBOLMAZ — ekleme, değiştirme değil.
    expect(u.permissions).toContain("sell:bid:submit");
  });

  it("STANDART kalırsa satınalma koltuğu AÇILMAZ — fail-safe", async () => {
    const { service } = makeAuthService();
    // TUZAK: factory varsayılanı GOLD doğuruyor — sınanan koşul açıkça
    // kurulmazsa test sessizce yanlış şeyi doğrular (VERIFIED tuzağının kardeşi).
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
    });
    const cat = await makeCategory();
    await service.completeOnboarding(
      owner.user.id,
      owner.company.id,
      dto(cat.id) as never,
    );
    await ensureOwnerBuySeat(prisma, owner.company.id);

    const u = await prisma.companyUser.findUniqueOrThrow({
      where: { id: owner.user.id },
    });
    expect(u.roles).not.toContain(CompanyRole.SATIN_ALMACI);
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
  /**
   * TEK ŞART: DOĞRULAMA (2026-09-15, kullanıcı kararı). 2FA ve web sitesi
   * şartları kaldırıldı.
   *
   * ⚠️ BU TESTİN ESKİ HÂLİ YANLIŞ SEBEPLE YEŞİLDİ: factory firmayı VERIFIED
   * doğuruyor, dolayısıyla doğrulama kapısı hiç tetiklenmiyordu; yeşil kalan
   * şey 2FA hatasıydı ve mesajı ("iki adımlı doğrulamayı") `/doğrula/i`
   * desenine uyuyordu. 2FA kalkınca ortaya çıktı. Durum artık AÇIKÇA kuruluyor.
   */
  it("doğrulanmamış firma reddedilir", async () => {
    const { service } = makeAuthService({ PREMIUM_SELF_UPGRADE_ENABLED: "true" });
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
      companyVerificationStatus: "UNVERIFIED",
    });
    await expect(
      service.upgradeToPremium(owner.user.id, owner.company.id),
    ).rejects.toThrow(/belgeler/i);
  });

  it("VERIFIED yeterli — 2FA YOKKEN de yükseltir", async () => {
    const { service } = makeAuthService({ PREMIUM_SELF_UPGRADE_ENABLED: "true" });
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "STANDART",
      companyVerificationStatus: "VERIFIED",
    });
    // 2FA kapalı ve web sitesi YOK — ikisi de artık şart değil.
    await prisma.company.update({
      where: { id: owner.company.id },
      data: { website: null },
    });
    await expect(
      service.upgradeToPremium(owner.user.id, owner.company.id),
    ).resolves.toMatchObject({ ok: true, tier: "GOLD" });
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.tier).toBe("GOLD");
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

});
