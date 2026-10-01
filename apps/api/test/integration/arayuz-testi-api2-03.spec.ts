/**
 * Arayüz testi api2-03 — KYC belgeleri, doğrulama ve paket/üyelik e-postaları.
 *
 *  - D-014: KYC belgesi İÇERİK imzasıyla (ilk baytlar) denetlenir; ".pdf"
 *    adıyla yüklenen düz metin reddedilir ve nesne silinir.
 *  - D-166: firma kurulumu (onboarding) bitmeden belge doğrulamaya
 *    gönderilemez, admin de VERIFIED yapamaz.
 *  - D-141: kısmi red e-postası reddedilen her belgeyi gerekçesiyle sayar.
 *  - D-193: doğrulanmış firmanın belgesi reddedilince e-posta statü kaybını
 *    ve kapanan adımları anlatır.
 *  - D-167: not silme denetim kaydı firmaya bağlı ve not metnini taşır.
 *  - D-210: "Paketiniz tanımlandı" e-postası marka adı + bitiş tarihi taşır.
 *  - D-173: üyelik süresi dolumu e-postası davet iptalini söyler.
 */
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyDocsService } from "../../src/modules/company-docs/company-docs.service";
import { MembershipScheduler } from "../../src/modules/company-auth/schedulers/membership.scheduler";
import { EmailSuppressionService } from "../../src/modules/email/email-suppression.service";
import { sniffDocumentType } from "../../src/common/helpers/upload-validation";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

function storageMock(prefix: Buffer = Buffer.from("%PDF-1.7\n%")) {
  return {
    deleteObject: jest.fn().mockResolvedValue(undefined),
    presignStoredObject: jest.fn(async (_b: string, v: string | null) =>
      v ? `https://r2/presigned/${v}` : null,
    ),
    presignInlinePreview: jest.fn(async (_b: string, v: string | null) =>
      v ? `https://r2/presigned/${v}` : null,
    ),
    checkExists: jest.fn(async () => ({
      exists: true,
      size: 1024,
      contentType: "application/pdf",
    })),
    readObjectPrefix: jest.fn(async () => prefix),
  };
}

function adminRig() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
  const notifications = { pushToCompany: jest.fn().mockResolvedValue(1) };
  const config = { get: jest.fn(() => "http://localhost:3000") };
  const audit = new AuditService(prisma as never);
  const svc = new AdminCompaniesService(
    prisma as never,
    storageMock() as never,
    email as never,
    notifications as never,
    config as never,
    audit,
    new EmailSuppressionService(prisma as never),
  );
  return { svc, email, audit };
}

type SentMail = { subject: string; templateData: { data: { paragraphs: string[] } } };

/** notifyCompany `void` ile çağrılır — e-posta gönderimini bekle. */
async function sentMail(email: { send: jest.Mock }): Promise<SentMail> {
  for (let i = 0; i < 50 && email.send.mock.calls.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
  expect(email.send).toHaveBeenCalledTimes(1);
  return email.send.mock.calls[0]![0] as SentMail;
}

const DOCS = {
  docTaxPlateUrl: "company-docs/x/tax.pdf",
  docTradeRegistryUrl: "company-docs/x/trade.pdf",
  docSignatureCircularUrl: "company-docs/x/sig.pdf",
  docActivityCertUrl: "company-docs/x/act.pdf",
  docIdFrontUrl: "company-docs/x/idf.pdf",
  docIdBackUrl: "company-docs/x/idb.pdf",
};

/** TR firma + kurucu kullanıcı; belgeler yüklü, kurulum bitmiş (varsayılan). */
async function kycCompany(
  status: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED",
  opts: { onboarded?: boolean } = {},
) {
  const made = await makeCompanyWithUser(prisma, {
    country: "TR",
    companyVerificationStatus: status,
  });
  await prisma.company.update({
    where: { id: made.company.id },
    data: {
      ...DOCS,
      onboardingCompletedAt: opts.onboarded === false ? null : new Date(),
    },
  });
  return made;
}

const approvedAll = () => ({
  taxPlate: { status: "APPROVED" as const },
  tradeRegistry: { status: "APPROVED" as const },
  signatureCircular: { status: "APPROVED" as const },
  activityCert: { status: "APPROVED" as const },
  idFront: { status: "APPROVED" as const },
  idBack: { status: "APPROVED" as const },
});

describe("D-014 — KYC belgesi içerik imzasıyla denetlenir", () => {
  it("imza tanıma: PDF/PNG/JPEG/WEBP; düz metin tanınmaz", () => {
    expect(sniffDocumentType(Buffer.from("%PDF-1.4"))).toBe("application/pdf");
    expect(
      sniffDocumentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe("image/png");
    expect(sniffDocumentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffDocumentType(Buffer.from("RIFF\x00\x00\x00\x00WEBPVP8 ", "latin1"))).toBe(
      "image/webp",
    );
    expect(sniffDocumentType(Buffer.from("hello, I am not a pdf"))).toBeNull();
    expect(sniffDocumentType(Buffer.alloc(0))).toBeNull();
  });

  it("'.pdf' adlı düz metin reddedilir, nesne silinir, belge kaydedilmez", async () => {
    const co = await kycCompany("UNVERIFIED");
    const storage = storageMock(Buffer.from("just plain text"));
    const docs = new CompanyDocsService(
      prisma as never,
      storage as never,
      new AuditService(prisma as never),
    );
    await prisma.company.update({
      where: { id: co.company.id },
      data: { docTaxPlateUrl: null },
    });
    const key = `company-docs/${co.company.id}/taxPlate-fake.pdf`;
    await expect(docs.commit(co.company.id, "taxPlate", key)).rejects.toMatchObject({
      status: 400,
    });
    expect(storage.deleteObject).toHaveBeenCalledWith("private", key);
    const c = await prisma.company.findUniqueOrThrow({ where: { id: co.company.id } });
    expect(c.docTaxPlateUrl).toBeNull();
  });

  it("PNG içeriği PDF diye beyan edilirse de reddedilir; gerçek PDF geçer", async () => {
    const co = await kycCompany("UNVERIFIED");
    const png = storageMock(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
    );
    const key = `company-docs/${co.company.id}/taxPlate-x.pdf`;
    await expect(
      new CompanyDocsService(prisma as never, png as never, new AuditService(prisma as never))
        .commit(co.company.id, "taxPlate", key),
    ).rejects.toMatchObject({ status: 400 });

    const ok = new CompanyDocsService(
      prisma as never,
      storageMock() as never,
      new AuditService(prisma as never),
    );
    await expect(ok.commit(co.company.id, "taxPlate", key)).resolves.toEqual({ ok: true });
  });

  it("VERIFIED firmanın revizyon yüklemesi de imzayla denetlenir", async () => {
    const co = await kycCompany("VERIFIED");
    await prisma.company.update({
      where: { id: co.company.id },
      data: { docActivityCertStatus: "REJECTED" },
    });
    const storage = storageMock(Buffer.from("<html>"));
    const docs = new CompanyDocsService(
      prisma as never,
      storage as never,
      new AuditService(prisma as never),
    );
    await expect(
      docs.commit(co.company.id, "activityCert", `company-docs/${co.company.id}/a.pdf`),
    ).rejects.toMatchObject({ status: 400 });
    expect(await prisma.companyKycRevision.count({ where: { companyId: co.company.id } })).toBe(0);
  });
});

describe("D-166 — kurulumu bitmemiş firma doğrulanamaz", () => {
  it("firma tarafı: submit reddedilir, durum değişmez", async () => {
    const co = await kycCompany("UNVERIFIED", { onboarded: false });
    const docs = new CompanyDocsService(
      prisma as never,
      storageMock() as never,
      new AuditService(prisma as never),
    );
    await expect(
      docs.submit(co.company.id, {
        mersisNo: "0123456789012345",
        tradeRegistryNo: "TSR-1",
        iban: "TR120006100519786457841399",
        ibanHolder: "Test Firma A.Ş.",
        bankSwiftBic: "TGBATRIS",
      }),
    ).rejects.toThrow(/kurulum/i);
    const c = await prisma.company.findUniqueOrThrow({ where: { id: co.company.id } });
    expect(c.companyVerificationStatus).toBe("UNVERIFIED");
  });

  it("admin: belge kararıyla da tek tık onayla da VERIFIED yapılamaz; red serbest", async () => {
    const { svc } = adminRig();
    const co = await kycCompany("PENDING", { onboarded: false });
    await expect(svc.reviewDocuments(co.company.id, approvedAll(), "adm1")).rejects.toThrow(
      /kurulum/i,
    );
    await expect(svc.setVerification(co.company.id, "VERIFIED", "adm1")).rejects.toThrow(
      /kurulum/i,
    );
    expect(
      (await prisma.company.findUniqueOrThrow({ where: { id: co.company.id } }))
        .companyVerificationStatus,
    ).toBe("PENDING");
    await expect(
      svc.setVerification(co.company.id, "REJECTED", "adm1", undefined, "INCOMPLETE"),
    ).resolves.toEqual({ ok: true });
  });
});

describe("D-141 / D-193 — red e-postası belgeyi, gerekçeyi ve etkisini söyler", () => {
  it("kısmi red: reddedilen her belge kod metni ve notuyla listelenir", async () => {
    const { svc, email } = adminRig();
    const co = await kycCompany("PENDING");
    await svc.reviewDocuments(
      co.company.id,
      {
        ...approvedAll(),
        taxPlate: { status: "REJECTED", reasonCode: "UNREADABLE", reason: "kenar kesik" },
        idBack: { status: "REJECTED", reason: "arka yüz yok" },
      },
      "adm1",
    );
    const mail = await sentMail(email);
    expect(mail.subject).toBe("Bazı belgeleriniz reddedildi");
    const body = mail.templateData.data.paragraphs.join("\n");
    expect(body).toContain("Reddedilen belgeler ve gerekçeleri:");
    expect(body).toContain(
      "• Vergi Levhası: Belge okunmuyor ya da bulanık — net bir tarama yükleyin. Not: kenar kesik",
    );
    expect(body).toContain("• Yetkili Kimlik (Arka): arka yüz yok");
    expect(body).not.toContain("İmza Sirküleri");
  });

  it("doğrulanmış firmada red: 'doğrulamanız geri alındı' + kapanan adımlar + belge listesi", async () => {
    const { svc, email } = adminRig();
    const co = await kycCompany("VERIFIED");
    await svc.reviewDocuments(
      co.company.id,
      { ...approvedAll(), tradeRegistry: { status: "REJECTED", reasonCode: "OUTDATED" } },
      "adm1",
    );
    const mail = await sentMail(email);
    expect(mail.subject).toBe("Firma doğrulamanız geri alındı");
    const body = mail.templateData.data.paragraphs.join("\n");
    expect(body).toMatch(/talep yayınlama, teklif verme ve teklif kazandırma/);
    expect(body).toContain("Mevcut siparişleriniz etkilenmez.");
    expect(body).toContain(
      "• Ticaret Sicil Gazetesi: Belge güncel değil — son 3 ay içinde alınmış bir belge yükleyin.",
    );
  });

  it("tek tık red (setVerification) gerekçeyi taşır; doğrulanmışta geri alma metni", async () => {
    const pending = adminRig();
    const a = await kycCompany("PENDING");
    await pending.svc.setVerification(a.company.id, "REJECTED", "adm1", "unvan farklı", "MISMATCH");
    const mailA = await sentMail(pending.email);
    expect(mailA.subject).toBe("Firma doğrulamanız reddedildi");
    expect(mailA.templateData.data.paragraphs.join("\n")).toContain(
      "Gerekçe: Belgedeki bilgiler firma bilgilerinizle uyuşmuyor. Not: unvan farklı",
    );

    const verified = adminRig();
    const b = await kycCompany("VERIFIED");
    await verified.svc.setVerification(b.company.id, "REJECTED", "adm1", "sahte belge");
    const mailB = await sentMail(verified.email);
    expect(mailB.subject).toBe("Firma doğrulamanız geri alındı");
    expect(mailB.templateData.data.paragraphs.join("\n")).toContain("Gerekçe: sahte belge");
  });

  it("İngilizce alıcıda belge adı ve gerekçe kodu İngilizce, admin notu olduğu gibi", async () => {
    const { svc, email } = adminRig();
    const co = await kycCompany("PENDING");
    await prisma.companyUser.update({ where: { id: co.user.id }, data: { locale: "en" } });
    await svc.reviewDocuments(
      co.company.id,
      { ...approvedAll(), taxPlate: { status: "REJECTED", reasonCode: "MISSING_SIGNATURE" } },
      "adm1",
    );
    const body = (await sentMail(email)).templateData.data.paragraphs.join("\n");
    expect(body).toContain(
      "• Tax registration certificate: The signature or company stamp is missing.",
    );
  });
});

describe("D-167 — not silme denetimi firmaya bağlı", () => {
  it("silme kaydı firma Denetim sekmesi aramasında görünür ve not metnini taşır", async () => {
    const { svc, audit } = adminRig();
    const co = await kycCompany("VERIFIED");
    const { id } = await svc.addNote(co.company.id, "Musteri arandi, belge bekleniyor", "adm1");
    await svc.deleteNote(id, "adm1");
    const res = await audit.query({ search: co.company.id });
    const actions = res.items.map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining(["admin.company.note_added", "admin.company.note_deleted"]),
    );
    const del = res.items.find((r) => r.action === "admin.company.note_deleted")!;
    expect(del.metadata).toMatchObject({
      companyId: co.company.id,
      body: "Musteri arandi, belge bekleniyor",
    });
  });
});

describe("D-210 — paket tanımlandı e-postası", () => {
  it("paket adı marka adıyla (Gold) ve bitiş tarihiyle yazılır", async () => {
    const { svc, email } = adminRig();
    const co = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    const res = await svc.setTier(co.company.id, "GOLD", 12, undefined);
    const mail = await sentMail(email);
    const body = mail.templateData.data.paragraphs.join("\n");
    expect(body).toContain("Gold paketi");
    expect(body).not.toContain("GOLD");
    const year = String(res.membershipEndAt!.getFullYear());
    expect(body).toContain(`${year} tarihine kadar`);
  });
});

describe("D-173 — üyelik süresi dolumu e-postası", () => {
  it("davet iptali paragrafı e-postada", async () => {
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
    const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
    const scheduler = new MembershipScheduler(prisma as never, email as never, config as never);
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.company.update({
      where: { id: co.company.id },
      data: { membershipEndAt: new Date(Date.now() - 86_400_000) },
    });
    await scheduler.downgradeExpired();
    const mail = await sentMail(email);
    expect(mail.templateData.data.paragraphs.join("\n")).toContain(
      "taleplerinizde gönderim sırası bekleyen tedarikçi davetleri iptal edildi",
    );
  });
});
