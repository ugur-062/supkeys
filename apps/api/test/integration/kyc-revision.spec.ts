/**
 * Faz Y — KYC A-modeli + ONAYLI-BELGE-KALICI kuralı (2026-07-28):
 * APPROVED belge firma durumu ne olursa olsun DEĞİŞTİRİLEMEZ; yeniden yükleme
 * yalnız o belge reddedildiyse (veya hiç yüklenmediyse) mümkündür. Revizyon
 * akışı (CompanyKycRevision) yalnız VERIFIED firmanın henüz onaylanmamış
 * alanları için kalır (ör. yabancı firmada opsiyonel boş belge): yükleme
 * Company kolonlarına DOKUNMADAN PENDING revizyona düşer; admin onaylarsa
 * geçerli olur, reddederse kolon değişmez; firma hep VERIFIED.
 */
import { CompanyDocsService } from "../../src/modules/company-docs/company-docs.service";
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { EmailSuppressionService } from "../../src/modules/email/email-suppression.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompany } from "./factories";

function storageMock() {
  return {
    generatePresignedPut: jest.fn(),
    getPublicUrl: jest.fn((k: string) => `https://r2/${k}`),
    deleteObject: jest.fn(),
    presignStoredObject: jest.fn(async (_bucket: string, v: string | null) =>
      v ? `https://r2/presigned/${v}` : null,
    ),
    // Parça 9 #7: KYC önizlemesi satır-içi presign kullanıyor (aynı davranış).
    presignInlinePreview: jest.fn(async (_bucket: string, v: string | null) =>
      v ? `https://r2/presigned/${v}` : null,
    ),
    checkExists: jest.fn(async () => ({
      exists: true,
      size: 1024,
      contentType: "application/pdf",
    })),
  };
}

function docsService() {
  return new CompanyDocsService(
    prisma as never,
    storageMock() as never,
    new AuditService(prisma as never),
  );
}

function adminService() {
  const noop = jest.fn().mockResolvedValue(undefined);
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
  const notifications = { pushToCompany: noop };
  const config = { get: jest.fn(() => "http://localhost:3000") };
  return {
    svc: new AdminCompaniesService(
      prisma as never,
      storageMock() as never,
      email as never,
      notifications as never,
      config as never,
      new AuditService(prisma as never),
      new EmailSuppressionService(prisma as never),
    ),
    email,
    notifications,
  };
}

/** TR: tüm belgeler APPROVED + firma VERIFIED — hiçbir belge değiştirilemez. */
async function verifiedTrCompany() {
  return makeCompany(prisma, {
    country: "TR",
    companyVerificationStatus: "VERIFIED",
    companyVerifiedAt: new Date(),
    docTaxPlateUrl: "company-docs/x/tax.pdf",
    docTaxPlateStatus: "APPROVED",
    docTradeRegistryUrl: "company-docs/x/trade.pdf",
    docTradeRegistryStatus: "APPROVED",
    docSignatureCircularUrl: "company-docs/x/sig.pdf",
    docSignatureCircularStatus: "APPROVED",
    docActivityCertUrl: "company-docs/x/act.pdf",
    docActivityCertStatus: "APPROVED",
    docIdFrontUrl: "company-docs/x/idf.pdf",
    docIdFrontStatus: "APPROVED",
    docIdBackUrl: "company-docs/x/idb.pdf",
    docIdBackStatus: "APPROVED",
  });
}

/**
 * Yabancı VERIFIED firma: 3 zorunlu belge APPROVED, opsiyoneller (ör.
 * signatureCircular/idBack) BOŞ — revizyon akışının kalan meşru yolu.
 */
async function verifiedForeignCompany() {
  return makeCompany(prisma, {
    country: "DE",
    companyVerificationStatus: "VERIFIED",
    companyVerifiedAt: new Date(),
    docTaxPlateUrl: "company-docs/x/tax.pdf",
    docTaxPlateStatus: "APPROVED",
    docTradeRegistryUrl: "company-docs/x/trade.pdf",
    docTradeRegistryStatus: "APPROVED",
    docIdFrontUrl: "company-docs/x/idf.pdf",
    docIdFrontStatus: "APPROVED",
  });
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("Onaylı belge kalıcı — VERIFIED'da bile değiştirilemez", () => {
  it("APPROVED belgeye commit 400 verir; revizyon OLUŞMAZ, kolonlar değişmez", async () => {
    const docs = docsService();
    const co = await verifiedTrCompany();

    await expect(
      docs.commit(co.id, "taxPlate", `company-docs/${co.id}/yeni-vergi.pdf`),
    ).rejects.toThrow(/onaylandı; değiştirilemez/);

    expect(
      await prisma.companyKycRevision.count({ where: { companyId: co.id } }),
    ).toBe(0);
    const c = await prisma.company.findUniqueOrThrow({ where: { id: co.id } });
    expect(c.docTaxPlateUrl).toBe("company-docs/x/tax.pdf");
    expect(c.docTaxPlateStatus).toBe("APPROVED");
    expect(c.companyVerificationStatus).toBe("VERIFIED");
  });

  it("genel REJECTED'da da APPROVED belge kilitli; reddedilen yeniden yüklenebilir", async () => {
    const docs = docsService();
    const co = await makeCompany(prisma, {
      country: "TR",
      companyVerificationStatus: "REJECTED",
      docTaxPlateUrl: "company-docs/x/tax.pdf",
      docTaxPlateStatus: "APPROVED",
      docIdFrontUrl: "company-docs/x/idf.pdf",
      docIdFrontStatus: "REJECTED",
    });

    await expect(
      docs.commit(co.id, "taxPlate", `company-docs/${co.id}/yeni.pdf`),
    ).rejects.toThrow(/onaylandı; değiştirilemez/);

    await docs.commit(co.id, "idFront", `company-docs/${co.id}/kimlik2.pdf`);
    const c = await prisma.company.findUniqueOrThrow({ where: { id: co.id } });
    expect(c.docIdFrontUrl).toBe(`company-docs/${co.id}/kimlik2.pdf`);
    expect(c.docIdFrontStatus).toBe("PENDING");
  });
});

describe("A-modeli — firma tarafı (VERIFIED'da onaysız alan → revizyon)", () => {
  it("commit revizyon yazar; Company kolonları ve VERIFIED statüsü DEĞİŞMEZ; audit düşer", async () => {
    const docs = docsService();
    const co = await verifiedForeignCompany();
    const actor = { userId: "u-1", email: "k@f.com" } as never;

    const res = await docs.commit(
      co.id,
      "signatureCircular",
      `company-docs/${co.id}/sirkuler.pdf`,
      actor,
    );
    expect(res).toEqual({ ok: true, revision: true });

    const rev = await prisma.companyKycRevision.findFirstOrThrow({
      where: { companyId: co.id, kind: "signatureCircular" },
    });
    expect(rev.status).toBe("PENDING");
    expect(rev.key).toBe(`company-docs/${co.id}/sirkuler.pdf`);
    expect(rev.submittedById).toBe("u-1");

    const c = await prisma.company.findUniqueOrThrow({ where: { id: co.id } });
    expect(c.companyVerificationStatus).toBe("VERIFIED"); // firma VERIFIED kaldı
    expect(c.docSignatureCircularUrl).toBeNull(); // kolon dokunulmadı

    await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.docs.revision_submitted", entityId: co.id },
    });
  });

  it("bekleyeni tekrar yükleme AYNI satırı günceller (kind başına tek PENDING)", async () => {
    const docs = docsService();
    const co = await verifiedForeignCompany();

    await docs.commit(co.id, "signatureCircular", `company-docs/${co.id}/v1.pdf`);
    const first = await prisma.companyKycRevision.findFirstOrThrow({
      where: { companyId: co.id, kind: "signatureCircular", status: "PENDING" },
    });
    await docs.commit(co.id, "signatureCircular", `company-docs/${co.id}/v2.pdf`);

    const rows = await prisma.companyKycRevision.findMany({
      where: { companyId: co.id, kind: "signatureCircular" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(first.id);
    expect(rows[0]!.key).toBe(`company-docs/${co.id}/v2.pdf`);
  });

  it("get(): kind başına SON revizyon döner (status + presigned url)", async () => {
    const docs = docsService();
    const co = await verifiedForeignCompany();
    await docs.commit(co.id, "idBack", `company-docs/${co.id}/kimlik2.pdf`);

    const out = (await docs.get(co.id)) as {
      revisions: Record<
        string,
        { status: string; url: string | null } | null
      >;
    };
    expect(out.revisions.idBack).toMatchObject({ status: "PENDING" });
    expect(out.revisions.idBack!.url).toContain("kimlik2.pdf");
    expect(out.revisions.taxPlate).toBeNull();
  });

  it("UNVERIFIED akış ESKİ yolda: commit Company kolonuna yazar, revizyon OLUŞMAZ", async () => {
    const docs = docsService();
    const co = await makeCompany(prisma, {
      country: "TR",
      companyVerificationStatus: "UNVERIFIED",
    });
    await docs.commit(co.id, "taxPlate", `company-docs/${co.id}/tax.pdf`);
    const c = await prisma.company.findUniqueOrThrow({ where: { id: co.id } });
    expect(c.docTaxPlateUrl).toBe(`company-docs/${co.id}/tax.pdf`);
    expect(
      await prisma.companyKycRevision.count({ where: { companyId: co.id } }),
    ).toBe(0);
  });
});

describe("A-modeli — admin tarafı (revizyon incele)", () => {
  it("APPROVE: yeni key Company'ye kopyalanır, firma VERIFIED kalır, bildirim + audit", async () => {
    const docs = docsService();
    const { svc, email, notifications } = adminService();
    const co = await verifiedForeignCompany();
    await docs.commit(co.id, "signatureCircular", `company-docs/${co.id}/yeni.pdf`);
    const rev = await prisma.companyKycRevision.findFirstOrThrow({
      where: { companyId: co.id, kind: "signatureCircular" },
    });

    const res = await svc.reviewDocRevision(
      co.id,
      rev.id,
      { status: "APPROVED" },
      "adm1",
    );
    expect(res).toEqual({ ok: true, status: "APPROVED" });

    const c = await prisma.company.findUniqueOrThrow({ where: { id: co.id } });
    expect(c.docSignatureCircularUrl).toBe(`company-docs/${co.id}/yeni.pdf`); // yeni geçerli
    expect(c.docSignatureCircularStatus).toBe("APPROVED");
    expect(c.companyVerificationStatus).toBe("VERIFIED"); // statü değişmedi

    const after = await prisma.companyKycRevision.findUniqueOrThrow({
      where: { id: rev.id },
    });
    expect(after.status).toBe("APPROVED");
    expect(after.reviewedByAdminId).toBe("adm1");

    // Bildirim tetiklendi (in-app push; e-posta fixture'da alıcı adres —
    // kullanıcı/billingEmail — olmadığından bilinçli atlanır).
    expect(notifications.pushToCompany).toHaveBeenCalled();
    void email;

    await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "admin.company.doc_revision_reviewed",
        entityId: co.id,
      },
    });
  });

  it("REJECT: kolon değişmez; gerekçesiz ret 400; PENDING-dışı tekrar karar 400", async () => {
    const docs = docsService();
    const { svc } = adminService();
    const co = await verifiedForeignCompany();
    await docs.commit(co.id, "idBack", `company-docs/${co.id}/yeni-kimlik.pdf`);
    const rev = await prisma.companyKycRevision.findFirstOrThrow({
      where: { companyId: co.id, kind: "idBack" },
    });

    await expect(
      svc.reviewDocRevision(co.id, rev.id, { status: "REJECTED" }, "adm1"),
    ).rejects.toThrow(/gerekçe/i);

    await svc.reviewDocRevision(
      co.id,
      rev.id,
      { status: "REJECTED", reason: "Belge okunmuyor" },
      "adm1",
    );
    const c = await prisma.company.findUniqueOrThrow({ where: { id: co.id } });
    expect(c.docIdBackUrl).toBeNull(); // kolona hiç yazılmadı
    expect(c.companyVerificationStatus).toBe("VERIFIED");
    const after = await prisma.companyKycRevision.findUniqueOrThrow({
      where: { id: rev.id },
    });
    expect(after.status).toBe("REJECTED");
    expect(after.reason).toBe("Belge okunmuyor");

    // Karara bağlanmış revizyon tekrar incelenemez (CAS).
    await expect(
      svc.reviewDocRevision(co.id, rev.id, { status: "APPROVED" }, "adm2"),
    ).rejects.toThrow(/bekleyen|karara bağlandı/i);
  });

  it("IDOR: başka firmanın revizyonu bu firma id'siyle incelenemez (404)", async () => {
    const docs = docsService();
    const { svc } = adminService();
    const a = await verifiedForeignCompany();
    const b = await verifiedForeignCompany();
    await docs.commit(a.id, "signatureCircular", `company-docs/${a.id}/yeni.pdf`);
    const rev = await prisma.companyKycRevision.findFirstOrThrow({
      where: { companyId: a.id },
    });
    await expect(
      svc.reviewDocRevision(b.id, rev.id, { status: "APPROVED" }, "adm1"),
    ).rejects.toThrow(/bulunamadı/i);
  });

  it("RET SONRASI yeniden yükleme → YENİ PENDING revizyon açılır", async () => {
    const docs = docsService();
    const { svc } = adminService();
    const co = await verifiedForeignCompany();
    await docs.commit(co.id, "signatureCircular", `company-docs/${co.id}/v1.pdf`);
    const rev1 = await prisma.companyKycRevision.findFirstOrThrow({
      where: { companyId: co.id, kind: "signatureCircular" },
    });
    await svc.reviewDocRevision(
      co.id,
      rev1.id,
      { status: "REJECTED", reason: "bulanık" },
      "adm1",
    );
    await docs.commit(co.id, "signatureCircular", `company-docs/${co.id}/v2.pdf`);
    const rows = await prisma.companyKycRevision.findMany({
      where: { companyId: co.id, kind: "signatureCircular" },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]!.status).toBe("PENDING");
    expect(rows[1]!.key).toBe(`company-docs/${co.id}/v2.pdf`);
  });
});
