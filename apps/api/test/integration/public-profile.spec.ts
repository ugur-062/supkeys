/**
 * Public (auth'suz) SEO profili — INV-TIER-1 (T7): görünürlük efektif tier'a bağlı.
 * Süresi-dolmuş (lazy) PAKET firmanın public profili görünmemeli (efektif STANDARD).
 * membershipEndAt iç hesap alanı yanıtta sızmamalı.
 */
import { prisma, truncateAll } from "./test-db";
import { makeCompany } from "./factories";
import { PublicProfileService } from "../../src/modules/public-profile/public-profile.service";

const svc = new PublicProfileService(prisma as never);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function publicCompany(over: Record<string, unknown>) {
  const slug = `firma-${Math.floor(Math.random() * 1e9)}`;
  await makeCompany(prisma, {
    country: "TR",
    tier: "PAKET",
    slug,
    publicEnabled: true,
    ...over,
  } as never);
  return slug;
}

describe("PublicProfile getBySlug — INV-TIER-1 (T7)", () => {
  it("efektif PAKET (süresiz) profil görünür", async () => {
    const slug = await publicCompany({ membershipEndAt: null });
    await expect(svc.getBySlug(slug)).resolves.toBeTruthy();
  });

  it("süresi DOLMUŞ PAKET profil 404 (efektif STANDARD)", async () => {
    const slug = await publicCompany({
      tier: "PAKET",
      membershipEndAt: new Date(Date.now() - 86_400_000),
    });
    await expect(svc.getBySlug(slug)).rejects.toThrow(/bulunamadı/i);
  });

  it("yanıtta membershipEndAt / tier iç alanları sızmaz", async () => {
    const slug = await publicCompany({
      membershipEndAt: new Date(Date.now() + 86_400_000),
    });
    const res = (await svc.getBySlug(slug)) as Record<string, unknown>;
    expect(res).not.toHaveProperty("membershipEndAt");
    expect(res).not.toHaveProperty("tier");
  });
});
