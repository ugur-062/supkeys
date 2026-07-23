/**
 * Teklif belgeleri — op-rol kapısı (salt-okunur garanti denetimi fix #1).
 * Kural: placeBid ile AYNI (bidderOpRole tek kaynak) — ALIM ilanında teklif
 * belgesi ekleme/silme Satışçı rolü ister; etiket-only (SAHIP/YONETICI),
 * ONAYLAYICI ve rolsüz üye 403 alır.
 */
import { CompanyRole } from "@rothern/db";
import { CompanyBidDocumentsService } from "../../src/modules/company-bid-documents/company-bid-documents.service";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/strategies/company-jwt.strategy";
import { makeBid, makeCompanyWithUser, makeListing } from "./factories";
import { prisma, truncateAll } from "./test-db";

const FUTURE = new Date(Date.now() + 7 * 86_400_000);

function makeDocsRig() {
  const storage = {
    generatePresignedPut: jest.fn().mockResolvedValue("https://r2.test/put"),
    generatePresignedGet: jest.fn().mockResolvedValue("https://r2.test/get"),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    checkExists: jest.fn().mockResolvedValue({ exists: true, size: 1024 }),
  };
  return {
    service: new CompanyBidDocumentsService(prisma as never, storage as never),
    storage,
  };
}

/** Aynı firma üyesi, farklı rol kümesiyle auth. */
function withRoles(
  auth: AuthenticatedCompanyUser,
  roles: CompanyRole[],
  isOwner = false,
): AuthenticatedCompanyUser {
  return { ...auth, roles, isOwner } as AuthenticatedCompanyUser;
}

beforeAll(async () => {
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function setup() {
  const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
  const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: buyer.company.id,
    createdById: buyer.user.id,
    type: "ALIM",
    status: "OPEN",
    visibility: "PUBLIC",
    format: "RFQ",
    closesAt: FUTURE,
  });
  await makeBid(prisma, {
    listingId: listing.id,
    bidderCompanyId: bidder.company.id,
    createdById: bidder.user.id,
    amount: 1000,
  });
  return { buyer, bidder, listing };
}

describe("teklif belgeleri op-rol kapısı (ALIM → Satışçı)", () => {
  it("etiket-only/rolsüz personalar upload-url + register + remove'da 403; Satışçı geçer", async () => {
    const { service } = makeDocsRig();
    const { bidder, listing } = await setup();
    const DENY = /Satışçı rolü gerekir/;
    const upload = { fileName: "sartname.pdf", mimeType: "application/pdf" };

    const personas: [string, AuthenticatedCompanyUser][] = [
      ["salt-SAHIP", withRoles(bidder.auth, [CompanyRole.SAHIP], true)],
      ["salt-YONETICI", withRoles(bidder.auth, [CompanyRole.YONETICI])],
      ["salt-ONAYLAYICI", withRoles(bidder.auth, [CompanyRole.ONAYLAYICI])],
      ["rolsüz", withRoles(bidder.auth, [])],
    ];
    for (const [, auth] of personas) {
      await expect(
        service.requestUploadUrl(auth, listing.id, upload),
      ).rejects.toThrow(DENY);
      await expect(
        service.register(auth, listing.id, {
          key: `listing-bids/${listing.id}/${auth.companyId}/x.pdf`,
          ...upload,
        }),
      ).rejects.toThrow(DENY);
    }

    // Satışçı rolü taşıyan üye (factory default kurucu SA+ST içerir) geçer.
    const { url, key } = await service.requestUploadUrl(
      bidder.auth,
      listing.id,
      upload,
    );
    expect(url).toContain("https://");
    const { id: docId } = await service.register(bidder.auth, listing.id, {
      key,
      ...upload,
    });

    // Silme de aynı kapıda: etiket-only 403, Satışçı siler.
    for (const [, auth] of personas) {
      await expect(service.remove(auth, listing.id, docId)).rejects.toThrow(
        DENY,
      );
    }
    await expect(
      service.remove(bidder.auth, listing.id, docId),
    ).resolves.toMatchObject({ ok: true });
  });

  it("kardeş simetrisi: SATIS ilanında kapı Satın Almacı'ya döner (placeBid kuralıyla aynı)", async () => {
    const { service } = makeDocsRig();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: seller.company.id,
      createdById: seller.user.id,
      type: "SATIS",
      status: "OPEN",
      visibility: "PUBLIC",
      format: "RFQ",
      closesAt: FUTURE,
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 500,
    });
    // Yalnız Satışçı rolü taşıyan üye SATIS ilanının teklif belgesine dokunamaz.
    await expect(
      service.requestUploadUrl(
        withRoles(bidder.auth, [CompanyRole.SATISCI]),
        listing.id,
        { fileName: "a.pdf", mimeType: "application/pdf" },
      ),
    ).rejects.toThrow(/Satın Almacı rolü gerekir/);
    // Satın Almacı geçer.
    await expect(
      service.requestUploadUrl(
        withRoles(bidder.auth, [CompanyRole.SATIN_ALMACI]),
        listing.id,
        { fileName: "a.pdf", mimeType: "application/pdf" },
      ),
    ).resolves.toHaveProperty("key");
  });
});
