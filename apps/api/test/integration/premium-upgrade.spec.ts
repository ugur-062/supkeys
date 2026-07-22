/**
 * Y2 — self-servis premium yükseltme feature flag (para kaçağı kapatma).
 * PREMIUM_SELF_UPGRADE_ENABLED kapalıyken (default) upgradeToPremium 403 döner;
 * açıkken önkoşullar (VERIFIED + 2FA + website + sahiplik) sağlanırsa PAKET olur.
 * Admin grant yolu ETKİLENMEZ (bu spec yalnız self-servis yolunu test eder).
 */
import { makeAuthService } from "./make-auth-service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function eligibleCompany() {
  const co = await makeCompanyWithUser(prisma, { tier: "STANDART" });
  await prisma.company.update({
    where: { id: co.company.id },
    data: {
      companyVerificationStatus: "VERIFIED",
      website: "https://firma.test",
    },
  });
  await prisma.companyUser.update({
    where: { id: co.user.id },
    data: { twoFactorEnabled: true },
  });
  return co;
}

describe("Y2 — upgradeToPremium feature flag", () => {
  it("flag KAPALI (default) → 403, tier STANDARD kalır (önkoşullar tam olsa bile)", async () => {
    const { service } = makeAuthService(); // PREMIUM_SELF_UPGRADE_ENABLED unset
    const co = await eligibleCompany();
    await expect(
      service.upgradeToPremium(co.user.id, co.company.id),
    ).rejects.toThrow(/manuel onayla|kapalı/i);
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

  it("flag AÇIK ama 2FA yoksa reddedilir (önkoşul zinciri korunur)", async () => {
    const { service } = makeAuthService({ PREMIUM_SELF_UPGRADE_ENABLED: "true" });
    const co = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    await prisma.company.update({
      where: { id: co.company.id },
      data: {
        companyVerificationStatus: "VERIFIED",
        website: "https://firma.test",
      },
    });
    // twoFactorEnabled default false → 2FA önkoşulu düşer.
    await expect(
      service.upgradeToPremium(co.user.id, co.company.id),
    ).rejects.toThrow(/2FA|iki adımlı/i);
  });
});
