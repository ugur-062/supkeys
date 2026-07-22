/**
 * Faz Y — KYC A-modeli: VERIFIED firmanın belge güncellemesi Company doc
 * kolonlarına DOKUNMADAN CompanyKycRevision(PENDING)'e düşer; admin onaylarsa
 * yeni belge geçerli olur, reddederse ESKİ belge kalır; firma hep VERIFIED.
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
    checkExists: jest.fn(async () => ({ exists: true, size: 1024 })),
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

/** Tüm belgeleri APPROVED + firma VERIFIED. */
async function verifiedCompany() {
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

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("A-modeli — firma tarafı (VERIFIED'da commit → revizyon)", () => {
  it("commit revizyon yazar; Company kolonları ve VERIFIED statüsü DEĞİŞMEZ; audit düşer", async () => {
    const docs = docsService();
    const co = await verifiedCompany();
    const actor = { userId: "u-1", email: "k@f.com" } as never;

    const res = await docs.commit(
      co.id,
      "taxPlate",
      `company-docs/${co.id}/yeni-vergi.pdf`,
      actor,
    );
    expect(res).toEqual({ ok: true, revision: true });

    const rev = await prisma.companyKycRevision.findFirstOrThrow({
      where: { companyId: co.id, kind: "taxPlate" },
    });
    expect(rev.status).toBe("PENDING");
    expect(rev.key).toBe(`company-docs/${co.id}/yeni-vergi.pdf`);
    expect(rev.submittedById).toBe("u-1");

    const c = await prisma.company.findUniqueOrThrow({ where: { id: co.id } });
    expect(c.companyVerificationStatus).toBe("VERIFIED"); // firma VERIFIED kaldı
    expect(c.docTaxPlateUrl).toBe("company-docs/x/tax.pdf"); // eski belge duruyor
    expect(c.docTaxPlateStatus).toBe("APPROVED");

    await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.docs.revision_submitted", entityId: co.id },
    });
  });

  it("bekleyeni tekrar yükleme AYNI satırı günceller (kind başına tek PENDING)", async () => {
    const docs = docsService();
    const co = await verifiedCompany();

    await docs.commit(co.id, "taxPlate", `company-docs/${co.id}/v1.pdf`);
    const first = await prisma.companyKycRevision.findFirstOrThrow({
      where: { companyId: co.id, kind: "taxPlate", status: "PENDING" },
    });
    await docs.commit(co.id, "taxPlate", `company-docs/${co.id}/v2.pdf`);

    const rows = await prisma.companyKycRevision.findMany({
      where: { companyId: co.id, kind: "taxPlate" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(first.id);
    expect(rows[0]!.key).toBe(`company-docs/${co.id}/v2.pdf`);
  });

  it("get(): kind başına SON revizyon döner (status + presigned url)", async () => {
    const docs = docsService();
    const co = await verifiedCompany();
    await docs.commit(co.id, "idFront", `company-docs/${co.id}/kimlik2.pdf`);

    const out = (await docs.get(co.id)) as {
      revisions: Record<
        string,
        { status: string; url: string | null } | null
      >;
    };
    expect(out.revisions.idFront).toMatchObject({ status: "PENDING" });
    expect(out.revisions.idFront!.url).toContain("kimlik2.pdf");
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
    const co = await verifiedCompany();
    await docs.commit(co.id, "taxPlate", `company-docs/${co.id}/yeni.pdf`);
    const rev = await prisma.companyKycRevision.findFirstOrThrow({
      where: { companyId: co.id, kind: "taxPlate" },
    });

    const res = await svc.reviewDocRevision(
      co.id,
      rev.id,
      { status: "APPROVED" },
      "adm1",
    );
    expect(res).toEqual({ ok: true, status: "APPROVED" });

    const c = await prisma.company.findUniqueOrThrow({ where: { id: co.id } });
    expect(c.docTaxPlateUrl).toBe(`company-docs/${co.id}/yeni.pdf`); // yeni geçerli
    expect(c.docTaxPlateStatus).toBe("APPROVED");
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

  it("REJECT: eski belge geçerli kalır; gerekçesiz ret 400; PENDING-dışı tekrar karar 400", async () => {
    const docs = docsService();
    const { svc } = adminService();
    const co = await verifiedCompany();
    await docs.commit(co.id, "idFront", `company-docs/${co.id}/yeni-kimlik.pdf`);
    const rev = await prisma.companyKycRevision.findFirstOrThrow({
      where: { companyId: co.id, kind: "idFront" },
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
    expect(c.docIdFrontUrl).toBe("company-docs/x/idf.pdf"); // ESKİ belge duruyor
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
    const a = await verifiedCompany();
    const b = await verifiedCompany();
    await docs.commit(a.id, "taxPlate", `company-docs/${a.id}/yeni.pdf`);
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
    const co = await verifiedCompany();
    await docs.commit(co.id, "taxPlate", `company-docs/${co.id}/v1.pdf`);
    const rev1 = await prisma.companyKycRevision.findFirstOrThrow({
      where: { companyId: co.id, kind: "taxPlate" },
    });
    await svc.reviewDocRevision(
      co.id,
      rev1.id,
      { status: "REJECTED", reason: "bulanık" },
      "adm1",
    );
    await docs.commit(co.id, "taxPlate", `company-docs/${co.id}/v2.pdf`);
    const rows = await prisma.companyKycRevision.findMany({
      where: { companyId: co.id, kind: "taxPlate" },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]!.status).toBe("PENDING");
    expect(rows[1]!.key).toBe(`company-docs/${co.id}/v2.pdf`);
  });
});
