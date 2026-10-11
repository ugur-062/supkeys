/**
 * Y2 — self-servis premium yükseltme feature flag (para kaçağı kapatma).
 * PREMIUM_SELF_UPGRADE_ENABLED kapalıyken (default) upgradeToPremium 403 döner;
 * açıkken önkoşullar (VERIFIED + 2FA + website + sahiplik) sağlanırsa PAKET olur.
 * Admin grant yolu ETKİLENMEZ (bu spec yalnız self-servis yolunu test eder).
 */
import { makeAuthService } from "./make-auth-service";
import { FREE_PERIOD } from "../../src/common/company/effective-tier";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

/**
 * TEK ÖNKOŞUL: DOĞRULAMA (2026-09-15, kullanıcı kararı). 2FA ve web sitesi
 * şartları kaldırıldı — yardımcı bilerek yalnız doğrulama kuruyor, böylece
 * kapıya sessizce ikinci bir şart eklenirse bu dosya kırmızıya döner.
 */
async function eligibleCompany() {
  const co = await makeCompanyWithUser(prisma, { tier: "STANDART" });
  await prisma.company.update({
    where: { id: co.company.id },
    data: { companyVerificationStatus: "VERIFIED" },
  });
  return co;
}

describe("ücretsiz dönem (anahtar AÇIK) — paket yükseltme ucu 410, hiçbir şey yazmaz", () => {
  it.each(["VERIFIED", "UNVERIFIED"] as const)(
    "%s firma: PREMIUM_SELF_UPGRADE_ENABLED açık olsa da 410 FREE_PERIOD; kademe/olay/denetim yazılmaz, metin paket anmaz",
    async (status) => {
      const { service, audit } = makeAuthService({ PREMIUM_SELF_UPGRADE_ENABLED: "true" });
      const co = await makeCompanyWithUser(prisma, {
        tier: "STANDART",
        companyVerificationStatus: status,
      });
      const err = await service
        .upgradeToPremium(co.user.id, co.company.id)
        .then(() => null, (e: unknown) => e as { getStatus(): number; getResponse(): Record<string, unknown>; message: string });
      expect(err).not.toBeNull();
      expect(err!.getStatus()).toBe(410);
      expect(err!.getResponse()).toMatchObject({ code: "FREE_PERIOD", statusCode: 410 });
      expect(err!.message).toMatch(/doğrulama/i);
      expect(err!.message).not.toMatch(/silver|gold|paket|premium/i);
      const after = await prisma.company.findUniqueOrThrow({ where: { id: co.company.id } });
      expect(after.tier).toBe("STANDART");
      expect(await prisma.companyMembershipEvent.count()).toBe(0);
      expect(audit.log).not.toHaveBeenCalled();
    },
  );

  it("sahip olmayan kullanıcı da 410 alır (sahiplik denetimi koşmaz, bilgi sızmaz)", async () => {
    const { service } = makeAuthService({ PREMIUM_SELF_UPGRADE_ENABLED: "true" });
    const co = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    await expect(
      service.upgradeToPremium("baska-kullanici", co.company.id),
    ).rejects.toMatchObject({ status: 410 });
  });
});

// Uyuyan ücretli-paket makinesi: aşağıdaki iki blok anahtar KAPALIYKEN self-servis yükseltme akışını sınar.
const paidPlansOn = () => {
  beforeEach(() => {
    jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
};

describe("Y2 — upgradeToPremium feature flag (ücretsiz dönem anahtarı KAPALI)", () => {
  paidPlansOn();

  it("flag KAPALI (default) → 403, tier STANDARD kalır (önkoşullar tam olsa bile)", async () => {
    const { service } = makeAuthService(); // PREMIUM_SELF_UPGRADE_ENABLED unset
    const co = await eligibleCompany();
    await expect(
      service.upgradeToPremium(co.user.id, co.company.id),
    ).rejects.toMatchObject({ status: 403, response: { code: "FREE_PERIOD" } });
    const after = await prisma.company.findUniqueOrThrow({
      where: { id: co.company.id },
    });
    expect(after.tier).toBe("STANDART");
  });

  it("flag AÇIK + önkoşullar tam → PAKET olur", async () => {
    const { service } = makeAuthService({ PREMIUM_SELF_UPGRADE_ENABLED: "true" });
    const co = await eligibleCompany();
    const res = await service.upgradeToPremium(co.user.id, co.company.id);
    expect(res).toMatchObject({ ok: true, tier: "GOLD" });
    const after = await prisma.company.findUniqueOrThrow({
      where: { id: co.company.id },
    });
    expect(after.tier).toBe("GOLD");
  });

  it("flag AÇIK ama DOĞRULAMA yoksa reddedilir (tek önkoşul korunur)", async () => {
    const { service } = makeAuthService({ PREMIUM_SELF_UPGRADE_ENABLED: "true" });
    // ⚠️ factory VERIFIED doğuruyor → sınanan koşul AÇIKÇA kurulmalı.
    const co = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      companyVerificationStatus: "UNVERIFIED",
    });
    await expect(
      service.upgradeToPremium(co.user.id, co.company.id),
    ).rejects.toThrow(/belgeler/i);
  });

  it("2FA ve web sitesi ARTIK ŞART DEĞİL — ikisi de yokken yükseltir", async () => {
    const { service } = makeAuthService({ PREMIUM_SELF_UPGRADE_ENABLED: "true" });
    const co = await eligibleCompany();
    await prisma.company.update({
      where: { id: co.company.id },
      data: { website: null },
    });
    // twoFactorEnabled default false.
    const res = await service.upgradeToPremium(co.user.id, co.company.id);
    expect(res).toMatchObject({ ok: true, tier: "GOLD" });
  });
});

describe("self-servis yükseltme iz bırakır (arayüz testi D-170; ücretsiz dönem anahtarı KAPALI)", () => {
  paidPlansOn();

  it("GRANT üyelik olayı + denetim kaydı yazılır", async () => {
    const { service, audit } = makeAuthService({ PREMIUM_SELF_UPGRADE_ENABLED: "true" });
    const co = await eligibleCompany();
    await service.upgradeToPremium(co.user.id, co.company.id);
    const ev = await prisma.companyMembershipEvent.findFirstOrThrow({
      where: { companyId: co.company.id },
    });
    expect(ev).toMatchObject({
      action: "GRANT",
      endAfter: null,
      adminId: null,
      reason: "self_service_upgrade",
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "company.membership.self_upgraded",
        actorId: co.user.id,
        entityId: co.company.id,
        metadata: { tier: "GOLD", from: "STANDART" },
      }),
    );
  });
});
