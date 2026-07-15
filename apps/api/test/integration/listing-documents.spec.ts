/**
 * company-listing-documents — belge yükleme/kayıt/listeleme/silme.
 * Kapsam: F4 (anahtar öneki + mime guard'ı), sahip/düzenlenebilirlik kilidi,
 * görünürlük-bazlı indirme yetkisi (getOne ile aynı), R2 mock.
 */
import { Prisma } from "@rothern/db";
import { prisma, truncateAll } from "./test-db";
import {
  connect,
  invite,
  makeCompanyWithUser,
  makeListing,
} from "./factories";
import { makeDocsService } from "./make-docs-service";

const PDF = "application/pdf";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function ownerListing(over: Record<string, unknown> = {}) {
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "DRAFT",
    visibility: "PUBLIC",
    ...over,
  });
  return { owner, listing };
}

async function seedDoc(
  listingId: string,
  uploadedByCompanyId: string,
  key = `listing-docs/${listingId}/seed.pdf`,
) {
  return prisma.listingDocument.create({
    data: {
      listingId,
      key,
      fileName: "seed.pdf",
      mimeType: PDF,
      uploadedByCompanyId,
    } as Prisma.ListingDocumentUncheckedCreateInput,
  });
}

describe("requestUploadUrl", () => {
  it("sahip + düzenlenebilir → presigned PUT + ilan önekli key", async () => {
    const { service } = makeDocsService();
    const { owner, listing } = await ownerListing();
    const res = await service.requestUploadUrl(owner.auth, listing.id, {
      fileName: "şartname son.pdf",
      mimeType: PDF,
    });
    expect(res.key.startsWith(`listing-docs/${listing.id}/`)).toBe(true);
    expect(res.url).toContain("r2.test");
  });

  it("izin verilmeyen mime reddedilir", async () => {
    const { service } = makeDocsService();
    const { owner, listing } = await ownerListing();
    await expect(
      service.requestUploadUrl(owner.auth, listing.id, {
        fileName: "x.exe",
        mimeType: "application/x-msdownload",
      }),
    ).rejects.toThrow(/PDF/i);
  });

  it("sahip olmayan reddedilir (Forbidden)", async () => {
    const { service } = makeDocsService();
    const { listing } = await ownerListing();
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      service.requestUploadUrl(other.auth, listing.id, {
        fileName: "x.pdf",
        mimeType: PDF,
      }),
    ).rejects.toThrow();
  });

  it("ilan teklife kapalıysa belge değiştirilemez", async () => {
    const { service } = makeDocsService();
    const { owner, listing } = await ownerListing({ status: "CLOSED" });
    await expect(
      service.requestUploadUrl(owner.auth, listing.id, {
        fileName: "x.pdf",
        mimeType: PDF,
      }),
    ).rejects.toThrow(/kapal/i);
  });

  it("AÇIK ilana teklif verilmişse belge değiştirilemez", async () => {
    const { service } = makeDocsService();
    const { owner, listing } = await ownerListing({ status: "OPEN" });
    const bidder = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.listingBid.create({
      data: {
        listingId: listing.id,
        bidderCompanyId: bidder.company.id,
        createdById: bidder.user.id,
        amount: new Prisma.Decimal(100),
        status: "SUBMITTED",
        submittedAt: new Date(),
      } as Prisma.ListingBidUncheckedCreateInput,
    });
    await expect(
      service.requestUploadUrl(owner.auth, listing.id, {
        fileName: "x.pdf",
        mimeType: PDF,
      }),
    ).rejects.toThrow(/teklif/i);
  });
});

describe("register — F4 anahtar/mime guard'ı", () => {
  it("ilan öneki dışındaki anahtar reddedilir (keyfi bucket nesnesi)", async () => {
    const { service } = makeDocsService();
    const { owner, listing } = await ownerListing();
    await expect(
      service.register(owner.auth, listing.id, {
        key: "listing-docs/BASKA_ILAN/gizli.pdf",
        fileName: "gizli.pdf",
        mimeType: PDF,
      }),
    ).rejects.toThrow(/anahtar/i);
    await expect(
      service.register(owner.auth, listing.id, {
        key: "../../etc/passwd",
        fileName: "x",
        mimeType: PDF,
      }),
    ).rejects.toThrow(/anahtar/i);
  });

  it("kayıt sırasında mime yeniden doğrulanır", async () => {
    const { service } = makeDocsService();
    const { owner, listing } = await ownerListing();
    await expect(
      service.register(owner.auth, listing.id, {
        key: `listing-docs/${listing.id}/x.exe`,
        fileName: "x.exe",
        mimeType: "application/x-msdownload",
      }),
    ).rejects.toThrow(/PDF/i);
  });

  it("geçerli anahtar + mime → belge kaydı oluşur", async () => {
    const { service } = makeDocsService();
    const { owner, listing } = await ownerListing();
    const res = await service.register(owner.auth, listing.id, {
      key: `listing-docs/${listing.id}/sartname.pdf`,
      fileName: "sartname.pdf",
      mimeType: PDF,
    });
    expect(res.id).toBeTruthy();
    const count = await prisma.listingDocument.count({
      where: { listingId: listing.id },
    });
    expect(count).toBe(1);
  });
});

describe("list — görünürlük bazlı indirme yetkisi", () => {
  it("sahip belgeleri presigned URL ile listeler", async () => {
    const { service, storage } = makeDocsService();
    const { owner, listing } = await ownerListing();
    await seedDoc(listing.id, owner.company.id);
    const docs = await service.list(owner.auth, listing.id);
    expect(docs).toHaveLength(1);
    expect(docs[0].url).toContain("r2.test");
    expect(docs[0].mine).toBe(true);
    expect(storage.generatePresignedGet).toHaveBeenCalled();
  });

  it("PUBLIC: premium yabancı-olmayan firma indirebilir", async () => {
    const { service } = makeDocsService();
    const { owner, listing } = await ownerListing({
      status: "OPEN",
      visibility: "PUBLIC",
    });
    await seedDoc(listing.id, owner.company.id);
    const viewer = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "PAKET",
    });
    await expect(service.list(viewer.auth, listing.id)).resolves.toHaveLength(
      1,
    );
  });

  it("engellenen firma PUBLIC premium olsa da belgeleri göremez (404)", async () => {
    const { service, blocks } = makeDocsService();
    const { owner, listing } = await ownerListing({
      status: "OPEN",
      visibility: "PUBLIC",
    });
    await seedDoc(listing.id, owner.company.id);
    const viewer = await makeCompanyWithUser(prisma, {
      country: "TR",
      tier: "PAKET",
    });
    // İlan sahibi bu firmayı engellemiş → blok listesinde görünür (M4 drift'i).
    blocks.blockedCompanyIds.mockResolvedValue([viewer.company.id]);
    await expect(service.list(viewer.auth, listing.id)).rejects.toThrow();
  });

  it("CONNECTIONS: bağsız firma göremez (404), bağlı görür", async () => {
    const { service } = makeDocsService();
    const { owner, listing } = await ownerListing({
      status: "OPEN",
      visibility: "CONNECTIONS",
    });
    await seedDoc(listing.id, owner.company.id);
    const stranger = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(service.list(stranger.auth, listing.id)).rejects.toThrow();

    const partner = await makeCompanyWithUser(prisma, { country: "TR" });
    await connect(prisma, owner.company.id, partner.company.id, owner.user.id);
    await expect(service.list(partner.auth, listing.id)).resolves.toHaveLength(
      1,
    );
  });

  it("PRIVATE: davetsiz göremez, davetli görür", async () => {
    const { service } = makeDocsService();
    const { owner, listing } = await ownerListing({
      status: "OPEN",
      visibility: "PRIVATE",
    });
    await seedDoc(listing.id, owner.company.id);
    const outsider = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(service.list(outsider.auth, listing.id)).rejects.toThrow();

    const guest = await makeCompanyWithUser(prisma, { country: "TR" });
    await invite(prisma, listing.id, guest.company.id, owner.user.id);
    await expect(service.list(guest.auth, listing.id)).resolves.toHaveLength(1);
  });

  it("yurtiçi ilan: yabancı firma belgeleri göremez (404)", async () => {
    const { service } = makeDocsService();
    const { owner, listing } = await ownerListing({
      status: "OPEN",
      visibility: "PUBLIC",
    });
    await seedDoc(listing.id, owner.company.id);
    const foreign = await makeCompanyWithUser(prisma, { country: "DE" });
    await expect(service.list(foreign.auth, listing.id)).rejects.toThrow();
  });
});

describe("remove", () => {
  it("sahip + düzenlenebilir → belge silinir (R2 + DB)", async () => {
    const { service, storage } = makeDocsService();
    const { owner, listing } = await ownerListing();
    const doc = await seedDoc(listing.id, owner.company.id);
    await service.remove(owner.auth, listing.id, doc.id);
    expect(storage.deleteObject).toHaveBeenCalledWith("private", doc.key);
    expect(
      await prisma.listingDocument.count({ where: { id: doc.id } }),
    ).toBe(0);
  });

  it("sahip olmayan silemez (Forbidden)", async () => {
    const { service } = makeDocsService();
    const { owner, listing } = await ownerListing();
    const doc = await seedDoc(listing.id, owner.company.id);
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      service.remove(other.auth, listing.id, doc.id),
    ).rejects.toThrow();
  });

  it("R2 silme hatası yutulmaz ama DB satırı yine silinir", async () => {
    const { service, storage } = makeDocsService();
    storage.deleteObject.mockRejectedValueOnce(new Error("R2 down"));
    const { owner, listing } = await ownerListing();
    const doc = await seedDoc(listing.id, owner.company.id);
    await service.remove(owner.auth, listing.id, doc.id);
    expect(
      await prisma.listingDocument.count({ where: { id: doc.id } }),
    ).toBe(0);
  });
});

describe("yükleme doğrulaması (boyut/uzantı/hayalet)", () => {
  it("çalıştırılabilir uzantı upload-url'de reddedilir", async () => {
    const { service } = makeDocsService();
    const { owner, listing } = await ownerListing();
    await expect(
      service.requestUploadUrl(owner.auth, listing.id, {
        fileName: "virus.exe",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(/yüklenemez/);
  });

  it("50MB üstü bildirilen boyut reddedilir", async () => {
    const { service } = makeDocsService();
    const { owner, listing } = await ownerListing();
    await expect(
      service.requestUploadUrl(owner.auth, listing.id, {
        fileName: "buyuk.pdf",
        mimeType: "application/pdf",
        fileSize: 60 * 1024 * 1024,
      }),
    ).rejects.toThrow(/boyut/i);
  });

  it("R2'da olmayan nesne register'da reddedilir (hayalet kayıt)", async () => {
    const { service, storage } = makeDocsService();
    storage.checkExists.mockResolvedValueOnce({ exists: false });
    const { owner, listing } = await ownerListing();
    await expect(
      service.register(owner.auth, listing.id, {
        key: `listing-docs/${listing.id}/x-dosya.pdf`,
        fileName: "dosya.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(/yüklenmemiş/);
  });

  it("boyutu limiti aşan yüklenmiş nesne register'da reddedilir + temizlenir", async () => {
    const { service, storage } = makeDocsService();
    storage.checkExists.mockResolvedValueOnce({
      exists: true,
      size: 60 * 1024 * 1024,
    });
    const { owner, listing } = await ownerListing();
    const key = `listing-docs/${listing.id}/x-dosya.pdf`;
    await expect(
      service.register(owner.auth, listing.id, {
        key,
        fileName: "dosya.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(/boyut/i);
    expect(storage.deleteObject).toHaveBeenCalledWith("private", key);
  });
});
