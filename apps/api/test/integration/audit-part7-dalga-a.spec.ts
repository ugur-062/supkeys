/**
 * Denetim 2026-08-24 Parça 7 (Bağlantı/mesaj/bildirim/WS) — Dalga A regresyonları.
 * Rapor: docs/audit-2026-08-24-part7-comms.md
 */
import { CompanyReviewsService } from "../../src/modules/company-reviews/company-reviews.service";
import { isConnectionValid } from "../../src/common/company/valid-connection";
import { makeDocsService } from "./make-docs-service";
import { connect, makeCompanyWithUser, makeListing } from "./factories";
import { prisma, truncateAll } from "./test-db";

const FUTURE = new Date(Date.now() + 7 * 86_400_000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("#1 — 'geçerli bağlantı' TEK KAYNAK (belge ucu ilan detayıyla aynı kuralı uygular)", () => {
  it("davet eden taraf paketten düşünce CONNECTIONS ilanın belgeleri de kapanır", async () => {
    const { service } = makeDocsService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const viewer = await makeCompanyWithUser(prisma, { country: "TR" });
    // Bağlantıyı VIEWER kurdu (inviter = viewer) → geçerlilik viewer'ın paketine bağlı.
    await connect(prisma, viewer.company.id, owner.company.id, viewer.user.id);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "CONNECTIONS",
      closesAt: FUTURE,
    });
    // Paketliyken görebilir.
    await expect(service.list(viewer.auth, listing.id)).resolves.toBeDefined();

    // Davet eden taraf STANDART'a düşer → bağlantı artık GEÇERSİZ.
    await prisma.company.update({
      where: { id: viewer.company.id },
      data: { tier: "STANDART", membershipEndAt: null },
    });
    await expect(service.list(viewer.auth, listing.id)).rejects.toThrow();
  });

  it("kural yardımcısı: ADMIN kaynaklı bağlantı her zaman geçerli, süresi dolmuş paket geçersiz", () => {
    const past = new Date(Date.now() - 86_400_000);
    expect(
      isConnectionValid({ origin: "ADMIN", inviter: null }),
    ).toBe(true);
    expect(
      isConnectionValid({
        origin: "INVITE",
        inviter: { tier: "BRONZ", membershipEndAt: past },
      }),
    ).toBe(false);
    expect(
      isConnectionValid({
        origin: "INVITE",
        inviter: { tier: "GOLD", membershipEndAt: null },
      }),
    ).toBe(true);
  });
});

describe("#2 — değerlendirme özeti: askı ve blok kapısı", () => {
  async function rig() {
    const viewer = await makeCompanyWithUser(prisma, { country: "TR" });
    const target = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.company.update({
      where: { id: target.company.id },
      data: { publicEnabled: true },
    });
    return { viewer, target, svc: new CompanyReviewsService(prisma as never) };
  }

  it("admin tarafından askıya alınmış (isBlocked) firma → 404", async () => {
    const { viewer, target, svc } = await rig();
    await prisma.company.update({
      where: { id: target.company.id },
      data: { isBlocked: true },
    });
    await expect(
      svc.listForCompany(viewer.auth, target.company.id),
    ).rejects.toThrow(/bulunamadı/i);
  });

  it("pasif firma → 404", async () => {
    const { viewer, target, svc } = await rig();
    await prisma.company.update({
      where: { id: target.company.id },
      data: { isActive: false },
    });
    await expect(
      svc.listForCompany(viewer.auth, target.company.id),
    ).rejects.toThrow(/bulunamadı/i);
  });

  it("karşılıklı blok varsa → 404 (blok bağlantıyı sildiği için eski kapı elemiyordu)", async () => {
    const { viewer, target, svc } = await rig();
    await prisma.companyBlock.create({
      data: {
        blockerCompanyId: target.company.id,
        blockedCompanyId: viewer.company.id,
      } as never,
    });
    await expect(
      svc.listForCompany(viewer.auth, target.company.id),
    ).rejects.toThrow(/bulunamadı/i);
  });

  it("engel yoksa özet döner", async () => {
    const { viewer, target, svc } = await rig();
    await expect(
      svc.listForCompany(viewer.auth, target.company.id),
    ).resolves.toBeDefined();
  });
});
