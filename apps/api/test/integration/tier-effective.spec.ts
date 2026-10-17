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
import { FREE_PERIOD } from "../../src/common/company/effective-tier";

/**
 * Saklı paket süresi makinesi (üyelik bitişi → efektif STANDART) yalnız ücretsiz
 * dönem anahtarı KAPALIYKEN işler; anahtar açıkken doğrulanmış firma hep tam erişimli.
 * Anahtarın kapatılacağı gün için bu mantık çalışır kalmalı → blok anahtarı kapatır.
 */
function withPaidPlansOn() {
  beforeEach(() => {
    jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
}

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
  withPaidPlansOn();
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

/** Arayüz testi D-029: panel üyelik bitişini ve süre dolumunu gösterebilsin. */
describe("profil.get.membership — bitiş / süre doldu bilgisi", () => {
  type M = { membership: { endsAt: Date | null; expiredAt: Date | null } };
  const get = async (id: string) => ((await profileService().get(id)) as M).membership;
  withPaidPlansOn();

  it("canlı paket: endsAt bitiş tarihi, expiredAt null; süresiz pakette ikisi de null", async () => {
    const co = await paketWithEnd(future);
    expect(await get(co.company.id)).toEqual({ endsAt: future, expiredAt: null });
    const co2 = await paketWithEnd(null);
    expect(await get(co2.company.id)).toEqual({ endsAt: null, expiredAt: null });
  });

  it("cron öncesi tembel pencere: ham tarih geçmişte → expiredAt", async () => {
    const co = await paketWithEnd(past);
    expect(await get(co.company.id)).toEqual({ endsAt: null, expiredAt: past });
  });

  it("cron sonrası: son olay EXPIRE (30 gün içinde) → expiredAt = endBefore; sonra GRANT/REVOKE gelirse yok", async () => {
    const co = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    await prisma.companyMembershipEvent.create({
      data: { companyId: co.company.id, action: "EXPIRE", endBefore: past, createdAt: new Date(Date.now() - 1000) },
    });
    expect(await get(co.company.id)).toEqual({ endsAt: null, expiredAt: past });

    await prisma.companyMembershipEvent.create({
      data: { companyId: co.company.id, action: "REVOKE", endBefore: null },
    });
    expect((await get(co.company.id)).expiredAt).toBeNull();
  });

  it("30 günden eski süre dolumu bant göstermez", async () => {
    const co = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    await prisma.companyMembershipEvent.create({
      data: { companyId: co.company.id, action: "EXPIRE", endBefore: new Date(Date.now() - 31 * 86_400_000) },
    });
    expect((await get(co.company.id)).expiredAt).toBeNull();
  });
});

describe("INV-TIER-1 — bağlantı-geçerlilik yüzeyleri (listings + supplier-templates)", () => {
  withPaidPlansOn();
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

/** ÜCRETSİZ DÖNEM (2026-10-07, anahtar AÇIK = canlı davranış): efektif kademeyi doğrulama belirler. */
describe("ücretsiz dönem — efektif tier doğrulama durumuna bağlı (aynı yüzeyler)", () => {
  const tierOn = async (co: { user: { id: string }; company: { id: string } }) => {
    const { service: auth } = makeAuthService();
    return {
      me: (await auth.getMe(co.user.id)).company.tier,
      profile: ((await profileService().get(co.company.id)) as { tier: string }).tier,
    };
  };

  it("DOĞRULANMIŞ firma: saklı paketin süresi dolmuş ya da saklı kademe STANDART olsa da /me + profil GOLD", async () => {
    const expired = await paketWithEnd(past);
    expect(await tierOn(expired)).toEqual({ me: "GOLD", profile: "GOLD" });
    const std = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    expect(await tierOn(std)).toEqual({ me: "GOLD", profile: "GOLD" });
  });

  it.each(["UNVERIFIED", "PENDING", "REJECTED"] as const)(
    "%s firma saklı kademesiyle kalır: STANDART → STANDART; süresi dolmuş saklı paket → STANDART; canlı saklı paket korunur",
    async (status) => {
      const std = await makeCompanyWithUser(prisma, { tier: "STANDART", companyVerificationStatus: status });
      expect(await tierOn(std)).toEqual({ me: "STANDART", profile: "STANDART" });
      const mk = async (endAt: Date) => {
        const co = await makeCompanyWithUser(prisma, { tier: "GOLD", companyVerificationStatus: status });
        await prisma.company.update({ where: { id: co.company.id }, data: { membershipEndAt: endAt } });
        return co;
      };
      expect(await tierOn(await mk(past))).toEqual({ me: "STANDART", profile: "STANDART" });
      // Kimse erişim yitirmez: süresi dolmamış saklı paket doğrulanmamış firmada da geçerli.
      expect(await tierOn(await mk(future))).toEqual({ me: "GOLD", profile: "GOLD" });
    },
  );

  it("üyelik bitiş / süre doldu bandı gösterilmez (alanlar durur, değerler boş)", async () => {
    type M = { membership: { endsAt: Date | null; expiredAt: Date | null } };
    const get = async (id: string) => ((await profileService().get(id)) as M).membership;
    expect(await get((await paketWithEnd(future)).company.id)).toEqual({ endsAt: null, expiredAt: null });
    expect(await get((await paketWithEnd(past)).company.id)).toEqual({ endsAt: null, expiredAt: null });
    const std = await makeCompanyWithUser(prisma, { tier: "STANDART", companyVerificationStatus: "UNVERIFIED" });
    await prisma.companyMembershipEvent.create({
      data: { companyId: std.company.id, action: "EXPIRE", endBefore: past },
    });
    expect(await get(std.company.id)).toEqual({ endsAt: null, expiredAt: null });
  });

  it("bağlantı geçerliliği: DOĞRULANMIŞ davetçinin bağlantısı saklı paketi dolsa da kalır; doğrulanmamış davetçininki HER İKİ connectedCompanyIds'te elenir", async () => {
    const viewer = await makeCompanyWithUser(prisma, { country: "TR" });
    const verifiedExpired = await paketWithEnd(past);
    const unverified = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      companyVerificationStatus: "UNVERIFIED",
    });
    await connect(prisma, verifiedExpired.company.id, viewer.company.id, verifiedExpired.user.id);
    await connect(prisma, unverified.company.id, viewer.company.id, unverified.user.id);

    const { service: listings } = makeService();
    const listingIds = await (
      listings as unknown as { connectedCompanyIds(id: string): Promise<string[]> }
    ).connectedCompanyIds(viewer.company.id);
    expect(listingIds).toContain(verifiedExpired.company.id);
    expect(listingIds).not.toContain(unverified.company.id);

    const templates = new CompanySupplierTemplatesService(prisma as never);
    const tplIds = await (
      templates as unknown as { connectedCompanyIds(id: string): Promise<Set<string>> }
    ).connectedCompanyIds(viewer.company.id);
    expect(tplIds.has(verifiedExpired.company.id)).toBe(true);
    expect(tplIds.has(unverified.company.id)).toBe(false);
  });
});
