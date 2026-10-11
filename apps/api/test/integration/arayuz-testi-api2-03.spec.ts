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
 *  - D-210: ücretsiz dönemde paket tanımlama firmaya paket adıyla duyurulmaz
 *    (e-posta/bildirim yok); kayıt üyelik geçmişinde durur.
 *  - D-173: erişim düşüşünde (doğrulamanın geri alınması) davet iptali firmaya
 *    söylenir; üyelik zamanlayıcısı ücretsiz dönemde hiçbir şey yapmaz, süre
 *    dolumu düşüşü anahtar kapalı blokta sınanır.
 */
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyDocsService } from "../../src/modules/company-docs/company-docs.service";
import { MembershipScheduler } from "../../src/modules/company-auth/schedulers/membership.scheduler";
import { EmailSuppressionService } from "../../src/modules/email/email-suppression.service";
import { FREE_PERIOD } from "../../src/common/company/effective-tier";
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
  return { svc, email, audit, notifications };
}

type SentMail = {
  subject: string;
  templateData: { data: { paragraphs: string[]; highlights?: string[] } };
};

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

  it("boş (0 bayt) nesne: Range okunmaz, nesne silinir, 400 döner", async () => {
    const co = await kycCompany("UNVERIFIED");
    const storage = storageMock();
    storage.checkExists.mockResolvedValue({
      exists: true,
      size: 0,
      contentType: "application/pdf",
    });
    const docs = new CompanyDocsService(
      prisma as never,
      storage as never,
      new AuditService(prisma as never),
    );
    const key = `company-docs/${co.company.id}/taxPlate-empty.pdf`;
    await expect(docs.commit(co.company.id, "taxPlate", key)).rejects.toMatchObject({
      status: 400,
    });
    expect(storage.readObjectPrefix).not.toHaveBeenCalled();
    expect(storage.deleteObject).toHaveBeenCalledWith("private", key);
  });

  it("Range okuması 416 InvalidRange verirse 400 + silme; başka depolama hatası nesneyi silmez", async () => {
    const co = await kycCompany("UNVERIFIED");
    const key = `company-docs/${co.company.id}/taxPlate-r.pdf`;
    const invalidRange = storageMock();
    invalidRange.readObjectPrefix.mockRejectedValue(
      Object.assign(new Error("The requested range is not satisfiable"), {
        name: "InvalidRange",
        $metadata: { httpStatusCode: 416 },
      }),
    );
    await expect(
      new CompanyDocsService(prisma as never, invalidRange as never, new AuditService(prisma as never))
        .commit(co.company.id, "taxPlate", key),
    ).rejects.toMatchObject({ status: 400 });
    expect(invalidRange.deleteObject).toHaveBeenCalledWith("private", key);

    const transient = storageMock();
    transient.readObjectPrefix.mockRejectedValue(
      Object.assign(new Error("socket hang up"), { name: "TimeoutError" }),
    );
    await expect(
      new CompanyDocsService(prisma as never, transient as never, new AuditService(prisma as never))
        .commit(co.company.id, "taxPlate", key),
    ).rejects.toThrow("socket hang up");
    expect(transient.deleteObject).not.toHaveBeenCalled();
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
    const bodyB = mailB.templateData.data.paragraphs.join("\n");
    expect(bodyB).toContain("Gerekçe: sahte belge");
    // Tek tık red belge saymaz → "Reddedilen belgeler…" başlığı altı boş
    // kalıyordu (yeniden doğrulama NEW-2): başlık yok, yalnız gerekçe satırı.
    expect(bodyB).not.toContain("Reddedilen belgeler ve gerekçeleri:");
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

describe("D-210 — paket tanımlama firmaya paket adıyla duyurulmaz (ücretsiz dönem)", () => {
  // Ücretsiz dönem (sahip kararı 2026-10-07): hiçbir bildirim/e-posta paket adı
  // anmaz; "Paketiniz tanımlandı" e-postası kalktı. Kayıt üyelik geçmişinde durur.
  it.each(["tr", "ru"] as const)(
    "%s alıcı: setTier e-posta/bildirim göndermez; GRANT kaydı bitiş tarihiyle üyelik geçmişinde",
    async (locale) => {
      const { svc, email, notifications } = adminRig();
      const co = await makeCompanyWithUser(prisma, {
        tier: "STANDART",
        companyVerificationStatus: "UNVERIFIED",
      });
      await prisma.companyUser.update({ where: { id: co.user.id }, data: { locale } });
      const res = await svc.setTier(co.company.id, "GOLD", 12, undefined);
      // notifyCompany `void` ile çağrılırdı — geç gelen gönderimi de yakala.
      await new Promise((r) => setTimeout(r, 300));
      expect(email.send).not.toHaveBeenCalled();
      expect(notifications.pushToCompany).not.toHaveBeenCalled();
      expect(await prisma.notification.count({ where: { companyId: co.company.id } })).toBe(0);

      const row = await prisma.company.findUniqueOrThrow({ where: { id: co.company.id } });
      expect(row.tier).toBe("GOLD");
      expect(row.membershipEndAt?.getTime()).toBe(res.membershipEndAt!.getTime());
      const ev = await prisma.companyMembershipEvent.findFirstOrThrow({
        where: { companyId: co.company.id, action: "GRANT" },
      });
      expect(ev.months).toBe(12);
      expect(ev.endAfter?.getTime()).toBe(res.membershipEndAt!.getTime());
    },
  );
});

describe("D-173 — erişim düşüşünde davet iptali firmaya söylenir", () => {
  /** Giden bekleyen bağlantı daveti (düşüşte iptal edilir). */
  async function pendingOutgoingInvite(inviter: { company: { id: string }; user: { id: string } }) {
    const invitee = await makeCompanyWithUser(prisma, {});
    return prisma.companyConnection.create({
      data: {
        inviterCompanyId: inviter.company.id,
        inviteeCompanyId: invitee.company.id,
        invitedById: inviter.user.id,
        status: "PENDING",
        origin: "PREMIUM",
      },
    });
  }

  it("ücretsiz dönem: doğrulama geri alınınca davetler iptal edilir ve e-posta bunu söyler (paket adı yok)", async () => {
    const { svc, email } = adminRig();
    // Saklı kademe STANDART + doğrulanmış = tam erişim; doğrulama kalkınca efektif STANDART.
    const co = await kycCompany("VERIFIED");
    await prisma.company.update({ where: { id: co.company.id }, data: { tier: "STANDART" } });
    const outgoing = await pendingOutgoingInvite(co);

    await svc.reviewDocuments(
      co.company.id,
      { ...approvedAll(), tradeRegistry: { status: "REJECTED", reasonCode: "OUTDATED" } },
      "adm1",
    );
    const mail = await sentMail(email);
    expect(mail.subject).toBe("Firma doğrulamanız geri alındı");
    const body = mail.templateData.data.paragraphs.join("\n");
    expect(body).toContain(
      "taleplerinizde gönderim sırası bekleyen tedarikçi davetleri iptal edildi",
    );
    expect(body).not.toMatch(/Silver|Gold|paket/i);
    expect(await prisma.companyConnection.findUnique({ where: { id: outgoing.id } })).toBeNull();
  });

  it("ücretsiz dönem: saklı paketi süren firmada doğrulama kalkınca düşüş yok — davet durur, iptal paragrafı yazılmaz", async () => {
    const { svc, email } = adminRig();
    const co = await kycCompany("VERIFIED");
    await prisma.company.update({
      where: { id: co.company.id },
      data: { tier: "GOLD", membershipEndAt: new Date(Date.now() + 30 * 86_400_000) },
    });
    const outgoing = await pendingOutgoingInvite(co);
    await svc.reviewDocuments(
      co.company.id,
      { ...approvedAll(), tradeRegistry: { status: "REJECTED", reasonCode: "OUTDATED" } },
      "adm1",
    );
    const body = (await sentMail(email)).templateData.data.paragraphs.join("\n");
    expect(body).not.toContain("davetleri iptal edildi");
    expect(await prisma.companyConnection.findUnique({ where: { id: outgoing.id } })).not.toBeNull();
  });

  it("ücretsiz dönem: üyelik zamanlayıcısı hiçbir şey yapmaz (süresi dolan saklı paket, davet ve geçmiş olduğu gibi)", async () => {
    const scheduler = new MembershipScheduler(prisma as never);
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const past = new Date(Date.now() - 86_400_000);
    await prisma.company.update({ where: { id: co.company.id }, data: { membershipEndAt: past } });
    const outgoing = await pendingOutgoingInvite(co);
    await scheduler.downgradeExpired();
    const row = await prisma.company.findUniqueOrThrow({ where: { id: co.company.id } });
    expect(row.tier).toBe("GOLD");
    expect(row.membershipEndAt?.getTime()).toBe(past.getTime());
    expect(await prisma.companyConnection.findUnique({ where: { id: outgoing.id } })).not.toBeNull();
    expect(await prisma.companyMembershipEvent.count({ where: { companyId: co.company.id } })).toBe(0);
  });

  describe("ücretli paket makinesi (anahtar kapalı)", () => {
    // Ücretli paketler döndüğü gün süre dolumu düşüşü ve davet iptali çalışmalı.
    beforeEach(() => {
      jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("süre dolumu: firma STANDART'a iner, giden bekleyen davet iptal, EXPIRE kaydı yazılır", async () => {
      const scheduler = new MembershipScheduler(prisma as never);
      const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
      const past = new Date(Date.now() - 86_400_000);
      await prisma.company.update({
        where: { id: co.company.id },
        data: { membershipEndAt: past },
      });
      const outgoing = await pendingOutgoingInvite(co);
      await scheduler.downgradeExpired();
      const row = await prisma.company.findUniqueOrThrow({ where: { id: co.company.id } });
      expect(row.tier).toBe("STANDART");
      expect(row.membershipEndAt).toBeNull();
      expect(await prisma.companyConnection.findUnique({ where: { id: outgoing.id } })).toBeNull();
      const ev = await prisma.companyMembershipEvent.findFirstOrThrow({
        where: { companyId: co.company.id, action: "EXPIRE" },
      });
      expect(ev.endBefore?.getTime()).toBe(past.getTime());
    });
  });
});
