/**
 * Belge bazlı KYC inceleme — admin tek bir belgeyi reddeder, firma yalnız onu
 * yeniden yükler; onaylanan belgeler kilitli kalır. Durum makinesi + kilit.
 */
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";
import { CompanyDocsService } from "../../src/modules/company-docs/company-docs.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompany } from "./factories";

function storageMock() {
  return {
    generatePresignedPut: jest.fn(),
    generatePresignedGet: jest.fn().mockResolvedValue("https://r2/get"),
    getPublicUrl: jest.fn((k: string) => `https://r2/${k}`),
    deleteObject: jest.fn(),
    presignStoredObject: jest.fn(async (v: string | null) =>
      v ? `https://r2/presigned/${v}` : null,
    ),
    checkExists: jest.fn(async () => ({ exists: true, size: 1024 })),
  };
}

function docsService() {
  return new CompanyDocsService(prisma as never, storageMock() as never);
}

function adminService() {
  const noop = jest.fn().mockResolvedValue(undefined);
  const email = { send: noop };
  const notifications = { pushToCompany: noop };
  const config = { get: jest.fn(() => "http://localhost:3000") };
  const audit = { log: noop };
  return new AdminCompaniesService(
    prisma as never,
    storageMock() as never,
    email as never,
    notifications as never,
    config as never,
    audit as never,
  );
}

/** 6 belgesi yüklü, PENDING (gönderilmiş) TR firma. */
async function pendingCompany() {
  return makeCompany(prisma, {
    country: "TR",
    companyVerificationStatus: "PENDING",
    docTaxPlateUrl: "company-docs/x/tax.pdf",
    docTradeRegistryUrl: "company-docs/x/trade.pdf",
    docSignatureCircularUrl: "company-docs/x/sig.pdf",
    docActivityCertUrl: "company-docs/x/act.pdf",
    docIdFrontUrl: "company-docs/x/idf.pdf",
    docIdBackUrl: "company-docs/x/idb.pdf",
  });
}

const ALL_APPROVED = {
  taxPlate: { status: "APPROVED" as const },
  tradeRegistry: { status: "APPROVED" as const },
  signatureCircular: { status: "APPROVED" as const },
  activityCert: { status: "APPROVED" as const },
  idFront: { status: "APPROVED" as const },
  idBack: { status: "APPROVED" as const },
};

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("belge bazlı KYC inceleme", () => {
  it("hepsi onaylanınca firma VERIFIED + tüm belgeler APPROVED", async () => {
    const admin = adminService();
    const co = await pendingCompany();
    const res = await admin.reviewDocuments(co.id, ALL_APPROVED, "adm1");
    expect(res.status).toBe("VERIFIED");
    const c = await prisma.company.findUniqueOrThrow({ where: { id: co.id } });
    expect(c.companyVerificationStatus).toBe("VERIFIED");
    expect(c.docTaxPlateStatus).toBe("APPROVED");
    expect(c.docIdBackStatus).toBe("APPROVED");
    expect(c.companyVerifiedAt).not.toBeNull();
  });

  it("bir belge reddedilince firma REJECTED; o belge REJECTED, kalan APPROVED", async () => {
    const admin = adminService();
    const co = await pendingCompany();
    const res = await admin.reviewDocuments(
      co.id,
      { ...ALL_APPROVED, taxPlate: { status: "REJECTED", reason: "okunmuyor" } },
      "adm1",
    );
    expect(res.status).toBe("REJECTED");
    const c = await prisma.company.findUniqueOrThrow({ where: { id: co.id } });
    expect(c.companyVerificationStatus).toBe("REJECTED");
    expect(c.docTaxPlateStatus).toBe("REJECTED");
    expect(c.docTaxPlateReason).toBe("okunmuyor");
    expect(c.docTradeRegistryStatus).toBe("APPROVED");
    expect(c.companyVerifiedAt).toBeNull();
  });

  it("reddedilen belgeye gerekçe zorunlu", async () => {
    const admin = adminService();
    const co = await pendingCompany();
    await expect(
      admin.reviewDocuments(
        co.id,
        { ...ALL_APPROVED, taxPlate: { status: "REJECTED", reason: "" } },
        "adm1",
      ),
    ).rejects.toThrow(/gerekçe/i);
  });

  it("KİLİT: REJECTED durumda reddedilen belge yeniden yüklenebilir → PENDING", async () => {
    const admin = adminService();
    const docs = docsService();
    const co = await pendingCompany();
    await admin.reviewDocuments(
      co.id,
      { ...ALL_APPROVED, taxPlate: { status: "REJECTED", reason: "okunmuyor" } },
      "adm1",
    );
    const ok = await docs.commit(co.id, "taxPlate", `company-docs/${co.id}/yeni.pdf`);
    expect(ok.ok).toBe(true);
    const c = await prisma.company.findUniqueOrThrow({ where: { id: co.id } });
    expect(c.docTaxPlateUrl).toBe(`company-docs/${co.id}/yeni.pdf`);
    expect(c.docTaxPlateStatus).toBe("PENDING"); // yeniden yükleme → PENDING
    expect(c.docTaxPlateReason).toBeNull(); // gerekçe temizlenir
  });

  it("KİLİT: onaylanan belge REJECTED durumda bile değiştirilemez", async () => {
    const admin = adminService();
    const docs = docsService();
    const co = await pendingCompany();
    await admin.reviewDocuments(
      co.id,
      { ...ALL_APPROVED, taxPlate: { status: "REJECTED", reason: "okunmuyor" } },
      "adm1",
    );
    // tradeRegistry APPROVED → kilitli
    await expect(
      docs.commit(co.id, "tradeRegistry", `company-docs/${co.id}/yeni.pdf`),
    ).rejects.toThrow(/onaylandı|değiştirilemez/i);
  });

  it("KİLİT: PENDING (inceleme sürerken) belge değiştirilemez", async () => {
    const docs = docsService();
    const co = await pendingCompany();
    await expect(
      docs.commit(co.id, "taxPlate", `company-docs/${co.id}/yeni.pdf`),
    ).rejects.toThrow(/inceleniyor|değiştirilemez/i);
  });

  it("yeniden gönderim: onaylı belge APPROVED kalır, düzeltilen PENDING olur; firma PENDING", async () => {
    const admin = adminService();
    const docs = docsService();
    const co = await pendingCompany();
    // taxPlate reddedildi, kalan onaylı.
    await admin.reviewDocuments(
      co.id,
      { ...ALL_APPROVED, taxPlate: { status: "REJECTED", reason: "okunmuyor" } },
      "adm1",
    );
    // Firma reddedilen belgeyi yeniden yükler.
    await docs.commit(co.id, "taxPlate", `company-docs/${co.id}/yeni.pdf`);
    // Yeniden doğrulamaya gönderir (TR kimlik bilgileri form'dan tekrar gelir).
    await docs.submit(co.id, {
      mersisNo: "0000000000000000",
      tradeRegistryNo: "123456",
      iban: "TR000000000000000000000000",
      ibanHolder: "Firma A.Ş.",
    });
    const c = await prisma.company.findUniqueOrThrow({ where: { id: co.id } });
    expect(c.companyVerificationStatus).toBe("PENDING");
    expect(c.docTaxPlateStatus).toBe("PENDING"); // düzeltilen yeniden incelenir
    expect(c.docTradeRegistryStatus).toBe("APPROVED"); // onaylı kalır
  });

  it("VERIFIED firma yeniden submit edemez", async () => {
    const admin = adminService();
    const docs = docsService();
    const co = await pendingCompany();
    await admin.reviewDocuments(co.id, ALL_APPROVED, "adm1");
    await expect(docs.submit(co.id)).rejects.toThrow(/doğrulanmış|inceleniyor/i);
  });
});
