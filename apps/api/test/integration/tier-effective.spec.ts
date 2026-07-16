/**
 * INV-TIER-1 — süre-dolmuş PAKET firma HER yüzeyde STANDARD görünür (efektif
 * tier tek kaynak). Bu spec /me (serializeCompany) + profil get yüzeylerini
 * kapsar; bağlantı-geçerlilik yüzeyleri connections/supplier-templates
 * spec'lerinde.
 */
import { CompanyProfileService } from "../../src/modules/company-profile/company-profile.service";
import { makeAuthService } from "./make-auth-service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

const past = new Date(Date.now() - 86_400_000);
const future = new Date(Date.now() + 86_400_000);

function profileService() {
  return new CompanyProfileService(prisma as never, {} as never, {} as never);
}

async function paketWithEnd(endAt: Date | null) {
  const co = await makeCompanyWithUser(prisma, { tier: "PAKET" });
  await prisma.company.update({
    where: { id: co.company.id },
    data: { membershipEndAt: endAt },
  });
  return co;
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("INV-TIER-1 — efektif tier /me + profil yüzeyleri", () => {
  it("süresi DOLMUŞ PAKET → getMe.company.tier ve profil.get.tier STANDARD", async () => {
    const co = await paketWithEnd(past);
    const { service: auth } = makeAuthService();
    const me = await auth.getMe(co.user.id);
    expect(me.company.tier).toBe("STANDARD");
    const prof = (await profileService().get(co.company.id)) as {
      tier: string;
    };
    expect(prof.tier).toBe("STANDARD");
    // membershipEndAt yanıttan çıkarıldı (yalnız hesap içindi).
    expect("membershipEndAt" in prof).toBe(false);
  });

  it("süresi DOLMAMIŞ PAKET → her iki yüzey PAKET", async () => {
    const co = await paketWithEnd(future);
    const { service: auth } = makeAuthService();
    expect((await auth.getMe(co.user.id)).company.tier).toBe("PAKET");
    expect(
      ((await profileService().get(co.company.id)) as { tier: string }).tier,
    ).toBe("PAKET");
  });

  it("membershipEndAt null (süresiz) PAKET → PAKET kalır", async () => {
    const co = await paketWithEnd(null);
    const { service: auth } = makeAuthService();
    expect((await auth.getMe(co.user.id)).company.tier).toBe("PAKET");
  });
});
