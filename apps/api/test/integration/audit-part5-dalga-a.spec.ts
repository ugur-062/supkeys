/**
 * Denetim 2026-08-24 Parça 5 (Dosya & depolama) — Dalga A regresyonları.
 * Rapor: docs/audit-2026-08-24-part5-storage.md
 */
import { BadRequestException } from "@nestjs/common";
import { assertUploadedObjectValid } from "../../src/common/helpers/upload-validation";
import { makeDocsService } from "./make-docs-service";
import { makeCompanyWithUser, makeListing } from "./factories";
import { prisma, truncateAll } from "./test-db";

const FUTURE = new Date(Date.now() + 7 * 86_400_000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("#1 — yüklenen nesnenin GERÇEK içerik tipi doğrulanır", () => {
  function fakeStorage(contentType?: string) {
    return {
      checkExists: jest
        .fn()
        .mockResolvedValue({ exists: true, size: 100, contentType }),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
  }

  it("izinli tip → geçer", async () => {
    const storage = fakeStorage("application/pdf");
    await expect(
      assertUploadedObjectValid(
        storage as never,
        "private",
        "listing-docs/x/a.pdf",
        50 * 1024 * 1024,
        ["application/pdf"],
      ),
    ).resolves.toBeUndefined();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it("beyan PDF ama GERÇEK tip text/html → reddedilir ve nesne SİLİNİR", async () => {
    // Presigned PUT content-type'ı imzalamaz (AWS SDK unsignableHeaders) —
    // istemci beyanına güvenilemez; tek otorite HEAD'den okunan tiptir.
    const storage = fakeStorage("text/html");
    await expect(
      assertUploadedObjectValid(
        storage as never,
        "private",
        "listing-docs/x/a.pdf",
        50 * 1024 * 1024,
        ["application/pdf"],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.deleteObject).toHaveBeenCalledWith(
      "private",
      "listing-docs/x/a.pdf",
    );
  });

  it("image/svg+xml public görsel olarak kabul edilmez (depolanmış XSS kapısı)", async () => {
    const storage = fakeStorage("image/svg+xml");
    await expect(
      assertUploadedObjectValid(
        storage as never,
        "public",
        "dev/tenant-profile/c1/logo.png",
        10 * 1024 * 1024,
        ["image/jpeg", "image/png", "image/webp"],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.deleteObject).toHaveBeenCalled();
  });

  it("allowlist verilmezse tip kontrolü yapılmaz (geriye uyum)", async () => {
    const storage = fakeStorage("application/octet-stream");
    await expect(
      assertUploadedObjectValid(storage as never, "private", "k", 1000),
    ).resolves.toBeUndefined();
  });
});

describe("#2 — belge kaydı GERÇEK tipi kabul edilmeyen nesneyi reddeder (uçtan uca)", () => {
  it("ilan belgesi: HEAD text/html dönerse register 400 verir ve kayıt oluşmaz", async () => {
    const { service, storage } = makeDocsService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "DRAFT",
      format: "RFQ",
      visibility: "PUBLIC",
      closesAt: FUTURE,
    });
    storage.checkExists.mockResolvedValueOnce({
      exists: true,
      size: 1024,
      contentType: "text/html",
    });
    await expect(
      service.register(owner.auth, listing.id, {
        key: `listing-docs/${listing.id}/sartname.pdf`,
        fileName: "sartname.pdf",
        mimeType: "application/pdf",
      } as never),
    ).rejects.toThrow(/kabul edilmiyor/i);
    expect(
      await prisma.listingDocument.count({ where: { listingId: listing.id } }),
    ).toBe(0);
    expect(storage.deleteObject).toHaveBeenCalled();
  });
});

describe("#3 — KVKK: anonimleştirme kimlik/KYC alanlarını temizler", () => {
  it("belge anahtarları, yetkili TCKN ve profil görselleri null'lanır; KYC revizyonları silinir", async () => {
    const { AdminCompaniesService } = await import(
      "../../src/modules/admin-companies/admin-companies.service"
    );
    const { AuditService } = await import(
      "../../src/modules/audit/audit.service"
    );
    const company = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.company.update({
      where: { id: company.company.id },
      data: {
        docIdFrontUrl: "company-docs/c/id-front.pdf",
        docTaxPlateUrl: "company-docs/c/tax.pdf",
        authorizedTckn: "12345678901",
        billingPhone: "05001112233",
        logoUrl: "https://cdn.rothern.com/dev/tenant-profile/c/logo.png",
        publicEnabled: true,
      },
    });
    await prisma.companyKycRevision.create({
      data: {
        companyId: company.company.id,
        kind: "taxPlate",
        key: "company-docs/c/rev.pdf",
        status: "PENDING",
      } as never,
    });
    // Sipariş yok → hard-delete kolu; anonimleştirmeyi zorlamak için sipariş ekle.
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.companyOrder.create({
      data: {
        sellerCompanyId: other.company.id,
        buyerCompanyId: company.company.id,
        amount: 100,
        status: "ACCEPTED",
        paymentTiming: "AFTER_DELIVERY",
      } as never,
    });

    const deleted: { bucket: string; key: string }[] = [];
    const storage = {
      deleteObject: jest.fn(async (bucket: string, key: string) => {
        deleted.push({ bucket, key });
      }),
      publicUrlToKey: (v: string) =>
        v.startsWith("https://cdn.rothern.com/")
          ? v.replace("https://cdn.rothern.com/", "")
          : null,
    };
    const svc = new AdminCompaniesService(
      prisma as never,
      storage as never,
      { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) } as never,
      { pushToCompany: jest.fn().mockResolvedValue(1) } as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      new AuditService(prisma as never),
      {} as never,
    );
    const res = await svc.deleteOrAnonymize(
      company.company.id,
      "admin-1",
      async () => undefined,
    );
    expect(res.mode).toBe("anonymized");

    const after = await prisma.company.findUniqueOrThrow({
      where: { id: company.company.id },
    });
    expect(after.docIdFrontUrl).toBeNull();
    expect(after.docTaxPlateUrl).toBeNull();
    expect(after.authorizedTckn).toBeNull();
    expect(after.billingPhone).toBeNull();
    expect(after.logoUrl).toBeNull();
    expect(after.publicEnabled).toBe(false);
    expect(
      await prisma.companyKycRevision.count({
        where: { companyId: company.company.id },
      }),
    ).toBe(0);
    // R2 nesneleri de silinir (private belgeler + public görsel).
    expect(deleted.map((d) => d.key)).toEqual(
      expect.arrayContaining([
        "company-docs/c/id-front.pdf",
        "company-docs/c/tax.pdf",
        "company-docs/c/rev.pdf",
        "dev/tenant-profile/c/logo.png",
      ]),
    );
  });
});
