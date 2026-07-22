/**
 * INV-TIER-1 — süre-dolmuş PAKET firma HER yüzeyde STANDARD görünür (efektif
 * tier tek kaynak). Bu spec /me (serializeCompany) + profil get yüzeylerini
 * kapsar; bağlantı-geçerlilik yüzeyleri connections/supplier-templates
 * spec'lerinde.
 */
import { CompanyProfileService } from "../../src/modules/company-profile/company-profile.service";
import { CompanySupplierTemplatesService } from "../../src/modules/company-supplier-templates/company-supplier-templates.service";
import { makeAuthService } from "./make-auth-service";
import { makeService } from "./make-service";
import { prisma, truncateAll } from "./test-db";
import { connect, makeCompanyWithUser } from "./factories";

const past = new Date(Date.now() - 86_400_000);
const future = new Date(Date.now() + 86_400_000);

function profileService() {
  return new CompanyProfileService(
    prisma as never,
    {} as never,
    {} as never,
    { log: async () => undefined } as never, // audit assert edilmez → noop stub
  );
}

async function paketWithEnd(endAt: Date | null) {
  const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
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
    expect(me.company.tier).toBe("STANDART");
    const prof = (await profileService().get(co.company.id)) as {
      tier: string;
    };
    expect(prof.tier).toBe("STANDART");
    // membershipEndAt yanıttan çıkarıldı (yalnız hesap içindi).
    expect("membershipEndAt" in prof).toBe(false);
  });

  it("süresi DOLMAMIŞ PAKET → her iki yüzey PAKET", async () => {
    const co = await paketWithEnd(future);
    const { service: auth } = makeAuthService();
    expect((await auth.getMe(co.user.id)).company.tier).toBe("GOLD");
    expect(
      ((await profileService().get(co.company.id)) as { tier: string }).tier,
    ).toBe("GOLD");
  });

  it("membershipEndAt null (süresiz) PAKET → PAKET kalır", async () => {
    const co = await paketWithEnd(null);
    const { service: auth } = makeAuthService();
    expect((await auth.getMe(co.user.id)).company.tier).toBe("GOLD");
  });
});

describe("INV-TIER-1 — bağlantı-geçerlilik yüzeyleri (listings + supplier-templates)", () => {
  it("süresi dolmuş PAKET davetçinin bağlantısı HER İKİ connectedCompanyIds'te elenir; canlı PAKET kalır", async () => {
    const viewer = await makeCompanyWithUser(prisma, { country: "TR" });
    const expiredInviter = await paketWithEnd(past);
    const liveInviter = await paketWithEnd(future);
    // Davetçi = inviter, viewer = invitee (origin INVITE → tier kontrolüne tabi).
    await connect(
      prisma,
      expiredInviter.company.id,
      viewer.company.id,
      expiredInviter.user.id,
    );
    await connect(
      prisma,
      liveInviter.company.id,
      viewer.company.id,
      liveInviter.user.id,
    );

    const { service: listings } = makeService();
    const listingIds = (await (
      listings as unknown as {
        connectedCompanyIds(id: string): Promise<string[]>;
      }
    ).connectedCompanyIds(viewer.company.id)) as string[];
    expect(listingIds).toContain(liveInviter.company.id);
    expect(listingIds).not.toContain(expiredInviter.company.id);

    const templates = new CompanySupplierTemplatesService(prisma as never);
    const tplIds = (await (
      templates as unknown as {
        connectedCompanyIds(id: string): Promise<Set<string>>;
      }
    ).connectedCompanyIds(viewer.company.id)) as Set<string>;
    expect(tplIds.has(liveInviter.company.id)).toBe(true);
    expect(tplIds.has(expiredInviter.company.id)).toBe(false);
  });

  it("ADMIN origin bağlantı, davetçi süresi dolsa bile KALIR (platform kararı)", async () => {
    const viewer = await makeCompanyWithUser(prisma, { country: "TR" });
    const expiredInviter = await paketWithEnd(past);
    const conn = await connect(
      prisma,
      expiredInviter.company.id,
      viewer.company.id,
      expiredInviter.user.id,
    );
    await prisma.companyConnection.update({
      where: { id: conn.id },
      data: { origin: "ADMIN" },
    });
    const { service: listings } = makeService();
    const ids = (await (
      listings as unknown as {
        connectedCompanyIds(id: string): Promise<string[]>;
      }
    ).connectedCompanyIds(viewer.company.id)) as string[];
    expect(ids).toContain(expiredInviter.company.id);
  });
});
