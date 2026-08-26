/**
 * Denetim 2026-08-26 Parça 9 (Admin) — Dalga A sözleşmeleri.
 * Rapor: docs/audit-2026-08-26-part9-admin.md
 */
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";
import { AdminInspectionService } from "../../src/modules/admin-companies/admin-inspection.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { EmailSuppressionService } from "../../src/modules/email/email-suppression.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing } from "./factories";

function rig() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
  const notifications = { pushToCompany: jest.fn().mockResolvedValue(1) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const storage = {
    presignStoredObject: jest.fn().mockResolvedValue("https://signed/x"),
    presignInlinePreview: jest.fn().mockResolvedValue("https://signed/inline"),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    getPublicUrl: jest.fn().mockReturnValue(null),
    resolveImageUrl: jest.fn().mockResolvedValue(null),
  };
  const audit = new AuditService(prisma as never);
  const service = new AdminCompaniesService(
    prisma as never,
    storage as never,
    email as never,
    notifications as never,
    config as never,
    audit,
    new EmailSuppressionService(prisma as never),
  );
  return { service, notifications, email, storage, audit };
}

/** 6 KYC belgesini "yüklenmiş" hale getirir (anahtar yazar). */
async function uploadAllDocs(companyId: string, suffix = "v1") {
  await prisma.company.update({
    where: { id: companyId },
    data: {
      docTaxPlateUrl: `company-docs/${companyId}/taxPlate-${suffix}.pdf`,
      docTradeRegistryUrl: `company-docs/${companyId}/tradeRegistry-${suffix}.pdf`,
      docSignatureCircularUrl: `company-docs/${companyId}/signatureCircular-${suffix}.pdf`,
      docActivityCertUrl: `company-docs/${companyId}/activityCert-${suffix}.pdf`,
      docIdFrontUrl: `company-docs/${companyId}/idFront-${suffix}.pdf`,
      docIdBackUrl: `company-docs/${companyId}/idBack-${suffix}.pdf`,
    },
  });
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("#1 — /verify belgesiz onaylayamaz ve boş kolonu kilitlemez", () => {
  it("belge yüklenmemişse VERIFIED reddedilir", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {
      companyVerificationStatus: "UNVERIFIED",
    });
    await expect(
      service.setVerification(co.company.id, "VERIFIED", "admin-1"),
    ).rejects.toThrow(/Eksik belge/i);
    const after = await prisma.company.findUnique({
      where: { id: co.company.id },
      select: {
        companyVerificationStatus: true,
        docTaxPlateStatus: true,
      },
    });
    // KRİTİK: boş kolon APPROVED damgası YEMEZ — yerse firma o belgeyi bir
    // daha asla yükleyemezdi (company-docs "onaylandı; değiştirilemez" kilidi).
    expect(after!.companyVerificationStatus).toBe("UNVERIFIED");
    expect(after!.docTaxPlateStatus).not.toBe("APPROVED");
  });

  it("belgeler yüklüyse VERIFIED geçer ve zorunlu belgeler APPROVED olur", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {
      companyVerificationStatus: "PENDING",
    });
    await uploadAllDocs(co.company.id);
    await service.setVerification(co.company.id, "VERIFIED", "admin-1");
    const after = await prisma.company.findUnique({
      where: { id: co.company.id },
      select: {
        companyVerificationStatus: true,
        docTaxPlateStatus: true,
        companyVerifiedAt: true,
      },
    });
    expect(after!.companyVerificationStatus).toBe("VERIFIED");
    expect(after!.docTaxPlateStatus).toBe("APPROVED");
    expect(after!.companyVerifiedAt).not.toBeNull();
  });

  it("yabancı firmada YALNIZ zorunlu 3 belge damgalanır (kalan kolon serbest kalır)", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {
      country: "DE",
      companyVerificationStatus: "PENDING",
    });
    await prisma.company.update({
      where: { id: co.company.id },
      data: {
        docTradeRegistryUrl: "company-docs/x/tradeRegistry.pdf",
        docTaxPlateUrl: "company-docs/x/taxPlate.pdf",
        docIdFrontUrl: "company-docs/x/idFront.pdf",
      },
    });
    await service.setVerification(co.company.id, "VERIFIED", "admin-1");
    const after = await prisma.company.findUnique({
      where: { id: co.company.id },
      select: { docTradeRegistryStatus: true, docIdBackStatus: true },
    });
    expect(after!.docTradeRegistryStatus).toBe("APPROVED");
    // idBack yabancıda zorunlu değil ve hiç yüklenmedi → APPROVED olmamalı.
    expect(after!.docIdBackStatus).not.toBe("APPROVED");
  });
});

describe("#4 — onay idempotent + CAS", () => {
  it("aynı karar tekrarlanınca companyVerifiedAt korunur ve ikinci e-posta gitmez", async () => {
    const { service, notifications } = rig();
    const co = await makeCompanyWithUser(prisma, {
      companyVerificationStatus: "PENDING",
    });
    await uploadAllDocs(co.company.id);
    await service.setVerification(co.company.id, "VERIFIED", "admin-1");
    const first = await prisma.company.findUnique({
      where: { id: co.company.id },
      select: { companyVerifiedAt: true },
    });
    const pushCount = notifications.pushToCompany.mock.calls.length;

    const res = await service.setVerification(
      co.company.id,
      "VERIFIED",
      "admin-2",
    );
    const second = await prisma.company.findUnique({
      where: { id: co.company.id },
      select: { companyVerifiedAt: true },
    });
    expect(res).toMatchObject({ unchanged: true });
    expect(second!.companyVerifiedAt).toEqual(first!.companyVerifiedAt);
    expect(notifications.pushToCompany.mock.calls.length).toBe(pushCount);
  });
});

describe("#5 — üyelik yazımı CAS'li (kayıp güncelleme yok)", () => {
  it("bayat okuma ile ikinci uzatma 409 verir", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await service.setTier(co.company.id, "GOLD", 12, "admin-1");
    // İki eşzamanlı uzatma: aynı tabanı okuyup ikisi de yazamamalı.
    const results = await Promise.allSettled([
      service.extendMembership(co.company.id, 12, "admin-1"),
      service.extendMembership(co.company.id, 12, "admin-2"),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    // Olay tablosu ile kolon birbirini tutmalı (rapor "satılan ay" buradan).
    const events = await prisma.companyMembershipEvent.findMany({
      where: { companyId: co.company.id, action: "EXTEND" },
    });
    expect(events).toHaveLength(1);
  });
});

describe("#6 — elle REVOKE, cron downgrade'iyle aynı temizliği yapar", () => {
  it("bekleyen giden davetler silinir", async () => {
    const { service } = rig();
    const inviter = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const invitee = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: inviter.company.id,
        inviteeCompanyId: invitee.company.id,
        invitedById: inviter.user.id,
        status: "PENDING",
      },
    });
    await service.setTier(inviter.company.id, "STANDART", undefined, "admin-1");
    const left = await prisma.companyConnection.count({
      where: { inviterCompanyId: inviter.company.id, status: "PENDING" },
    });
    expect(left).toBe(0);
  });
});

describe("#16 — listingDetail ham satır dönmez", () => {
  it("internalNotes ve logistics payload'da YOK", async () => {
    const audit = new AuditService(prisma as never);
    const inspection = new AdminInspectionService(
      prisma as never,
      audit,
      {} as never,
    );
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      status: "OPEN",
    });
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        internalNotes: "ALICININ GİZLİ NOTU",
        logistics: { pickupAddress: "Gizli adres 1" },
      },
    });
    const detail = await inspection.listingDetail(listing.id);
    expect(detail).not.toHaveProperty("internalNotes");
    expect(detail).not.toHaveProperty("logistics");
    // Destek için gereken alanlar duruyor.
    expect(detail).toHaveProperty("title");
    expect(detail).toHaveProperty("bids");
  });
});

describe("#17 — askı sessiz değil", () => {
  it("suspend + unsuspend firmayı bilgilendirir", async () => {
    const { service, notifications } = rig();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await service.suspend(co.company.id, "spam", "admin-1");
    await service.unsuspend(co.company.id, "admin-1");
    const types = notifications.pushToCompany.mock.calls.map(
      (c: unknown[]) => (c[1] as { type: string }).type,
    );
    expect(types).toContain("admin_company_suspended");
    expect(types).toContain("admin_company_unsuspended");
  });
});

describe("#10 — admin para/yetki aksiyonları critical audit girdisiyle yazılır", () => {
  it("tier_set + verification_set + suspended → critical:true", async () => {
    // `critical` bir DB kolonu DEĞİL; AuditService girdisindeki bayraktır ve
    // yazım başarısız olursa [AUDIT-KRİTİK-KAYIP] marker'ı + Sentry'i tetikler.
    // Sözleşme bu yüzden çağrı üzerinde doğrulanır.
    const auditMock = { log: jest.fn().mockResolvedValue(undefined) };
    const { AdminCompaniesService } = await import(
      "../../src/modules/admin-companies/admin-companies.service"
    );
    const service = new AdminCompaniesService(
      prisma as never,
      {
        presignStoredObject: jest.fn().mockResolvedValue(null),
        presignInlinePreview: jest.fn().mockResolvedValue(null),
        deleteObject: jest.fn().mockResolvedValue(undefined),
      } as never,
      { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) } as never,
      { pushToCompany: jest.fn().mockResolvedValue(1) } as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      auditMock as never,
      new EmailSuppressionService(prisma as never),
    );
    const co = await makeCompanyWithUser(prisma, {
      tier: "STANDART",
      companyVerificationStatus: "PENDING",
    });
    await uploadAllDocs(co.company.id);
    await service.setTier(co.company.id, "GOLD", 12, "admin-1");
    await service.setVerification(co.company.id, "VERIFIED", "admin-1");
    await service.suspend(co.company.id, "gerekçe", "admin-1");

    const byAction = new Map<string, { critical?: boolean }>(
      auditMock.log.mock.calls.map((c: unknown[]) => {
        const e = c[0] as { action: string; critical?: boolean };
        return [e.action, e];
      }),
    );
    for (const action of [
      "admin.company.tier_set",
      "admin.company.verification_set",
      "admin.company.suspended",
    ]) {
      expect(byAction.get(action)).toBeDefined();
      expect(byAction.get(action)!.critical).toBe(true);
    }
  });
});

describe("#13 — KYC rozeti kuyrukla aynı evreni sayar", () => {
  it("belge revizyonu bekleyen VERIFIED firma da pendingReview'a girer", async () => {
    const { service } = rig();
    const pendingCo = await makeCompanyWithUser(prisma, {
      companyVerificationStatus: "PENDING",
    });
    const verifiedCo = await makeCompanyWithUser(prisma, {
      companyVerificationStatus: "VERIFIED",
    });
    await prisma.companyKycRevision.create({
      data: {
        companyId: verifiedCo.company.id,
        kind: "taxPlate",
        key: `company-docs/${verifiedCo.company.id}/taxPlate-v2.pdf`,
        status: "PENDING",
      },
    });
    const stats = await service.stats();
    expect(stats.pendingReview).toBe(2);
    // Liste (kuyruk) ile aynı sayı çıkmalı.
    const queue = await service.list({ queue: "kyc" });
    expect(queue.total).toBe(2);
    expect(pendingCo.company.id).toBeDefined();
  });
});

describe("#12 — pano ilan kırılımı MECE", () => {
  it("CLOSED ve IN_APPROVAL kendi kovalarında sayılır", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      status: "OPEN",
    });
    const moderated = await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      status: "OPEN",
    });
    await prisma.listing.update({
      where: { id: moderated.id },
      data: { status: "CLOSED" },
    });
    const stats = await service.stats();
    const l = stats.listings;
    expect(l.moderationClosed).toBe(1);
    // Kovalar yayınlanmış toplamı AÇIKLAMALI (buharlaşan ilan yok).
    const buckets =
      l.open +
      l.inAward +
      l.awarded +
      l.closedNoAward +
      l.inApproval +
      l.moderationClosed;
    expect(buckets).toBe(l.published);
  });
});

describe("#14 — üyelik raporu toplamları tavandan bağımsız", () => {
  it("truncated bayrağı döner ve toplamlar TÜM kayıtları kapsar", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    // Tavanın altında: bayrak kapalı, toplam = kayıt sayısı.
    await prisma.companyMembershipEvent.createMany({
      data: [
        { companyId: co.company.id, action: "GRANT", months: 12 },
        { companyId: co.company.id, action: "EXTEND", months: 6 },
      ],
    });
    const rep = await service.membershipReport();
    expect(rep.truncated).toBe(false);
    expect(rep.totals.monthsGranted).toBe(18);
    expect(rep.totals.grants).toBe(1);
    expect(rep.totals.extends).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────
// DALGA B
// ──────────────────────────────────────────────────────────────────────

describe("Dalga B — KYC kimlik alanları admin yolunda da zorunlu", () => {
  it("MERSİS/IBAN boşken belgeler tam olsa bile VERIFIED reddedilir (TR)", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {
      companyVerificationStatus: "PENDING",
    });
    await uploadAllDocs(co.company.id);
    await prisma.company.update({
      where: { id: co.company.id },
      data: { mersisNo: null, tradeRegistryNo: null, iban: null, ibanHolder: null },
    });
    await expect(
      service.setVerification(co.company.id, "VERIFIED", "admin-1"),
    ).rejects.toThrow(/eksik kimlik bilgisi/i);
  });

  it("yabancı firmada kimlik alanı kuralı uygulanmaz", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {
      country: "DE",
      companyVerificationStatus: "PENDING",
    });
    await prisma.company.update({
      where: { id: co.company.id },
      data: {
        docTradeRegistryUrl: "company-docs/x/tradeRegistry.pdf",
        docTaxPlateUrl: "company-docs/x/taxPlate.pdf",
        docIdFrontUrl: "company-docs/x/idFront.pdf",
        mersisNo: null,
        iban: null,
      },
    });
    await expect(
      service.setVerification(co.company.id, "VERIFIED", "admin-1"),
    ).resolves.toMatchObject({ ok: true });
  });
});

describe("Dalga B — ülke değişimi zorunlu belge setini bozarsa yeniden incelemeye düşer", () => {
  it("DE→TR: eksik belgeler varsa VERIFIED kalkar", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {
      country: "DE",
      companyVerificationStatus: "VERIFIED",
    });
    await prisma.company.update({
      where: { id: co.company.id },
      data: {
        docTradeRegistryUrl: "company-docs/x/tradeRegistry.pdf",
        docTaxPlateUrl: "company-docs/x/taxPlate.pdf",
        docIdFrontUrl: "company-docs/x/idFront.pdf",
      },
    });
    await service.updateProfile(co.company.id, { country: "TR" }, "admin-1");
    const after = await prisma.company.findUnique({
      where: { id: co.company.id },
      select: { companyVerificationStatus: true, country: true },
    });
    expect(after!.country).toBe("TR");
    expect(after!.companyVerificationStatus).toBe("UNVERIFIED");
  });
});

describe("Dalga B — audit satırı admin e-postasını taşır", () => {
  it("actorEmail çağıran vermese de PlatformAdmin'den çözülür", async () => {
    const { service } = rig();
    const admin = await prisma.platformAdmin.create({
      data: {
        email: "denetci@rothern.com",
        firstName: "D",
        lastName: "E",
        role: "SUPER_ADMIN",
      },
    });
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await service.suspend(co.company.id, "gerekçe", admin.id);
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: "admin.company.suspended", entityId: co.company.id },
    });
    expect(row.actorEmail).toBe("denetci@rothern.com");
  });
});

describe("Dalga B — son aktif SUPER_ADMIN korunur (atomik)", () => {
  it("tek SUPER_ADMIN pasifleştirilemez", async () => {
    const only = await prisma.platformAdmin.create({
      data: {
        email: "tek@rothern.com",
        firstName: "T",
        lastName: "K",
        role: "SUPER_ADMIN",
      },
    });
    const { AdminStaffService } = await import(
      "../../src/modules/admin-auth/admin-staff.service"
    );
    const staff = new AdminStaffService(
      prisma as never,
      new AuditService(prisma as never),
      {} as never,
    );
    await expect(staff.setActive(only.id, false, "başka-admin")).rejects.toThrow(
      /Son aktif SUPER_ADMIN/i,
    );
    const after = await prisma.platformAdmin.findUniqueOrThrow({
      where: { id: only.id },
    });
    expect(after.isActive).toBe(true);
  });
});

describe("Dalga B — duyuru dry-run gerçek hedefi sayar", () => {
  it("askıdaki/pasif firma hedefe girmez ve gönderim yapılmaz", async () => {
    const { service, notifications } = rig();
    await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const blocked = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.company.update({
      where: { id: blocked.company.id },
      data: { isBlocked: true },
    });
    const res = await service.announce(
      { subject: "x", message: "y", tier: "GOLD", dryRun: true },
      "admin-1",
    );
    expect(res.targets).toBe(1);
    expect(res.delivered).toBe(0);
    // dry-run HİÇBİR gönderim yapmaz.
    expect(notifications.pushToCompany).not.toHaveBeenCalled();
  });
});

describe("Dalga B — firma listesi sayaçları silinmiş kullanıcıyı saymaz", () => {
  it("soft-delete edilmiş kullanıcı userCount'a girmez", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.companyUser.update({
      where: { id: co.user.id },
      data: { deletedAt: new Date() },
    });
    const res = await service.list({});
    const row = res.items.find((i) => i.id === co.company.id);
    expect(row!.userCount).toBe(0);
  });
});
