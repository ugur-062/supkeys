/**
 * Token'lı davet-kabul akışı (davet → e-posta linki → kabulde hesap açılır)
 * + onay motoru meta eklemeleri (APR-YYYY-NNNN, başlatıcı notu, adım etiketi
 * snapshot'ı, Tüm Süreçler listesi, Yönetici iptal yetkisi, preview).
 */
import { EventEmitter2 } from "@nestjs/event-emitter";
import { CompanyApprovalsService } from "../../src/modules/company-approvals/company-approvals.service";
import { CompanyUsersService } from "../../src/modules/company-users/company-users.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { makeCompanyWithUser, makeListing, makeUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

let authSeq = 0;
function makeUsersService() {
  const supabase = {
    createUser: jest.fn(async () => ({ authId: `auth-inv-${authSeq++}` })),
    deleteUser: jest.fn(async () => undefined),
  };
  const companyAuth = {
    createSession: jest.fn(async (userId: string) => ({
      token: "t",
      user: { id: userId },
      company: {},
    })),
  };
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const service = new CompanyUsersService(
    prisma as never,
    supabase as never,
    companyAuth as never,
    email as never,
    config as never,
    new AuditService(prisma as never),
  );
  return { service, supabase, companyAuth, email };
}

function makeApprovalsService() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const notifications = new NotificationService(prisma as never);
  const events = new EventEmitter2();
  const service = new CompanyApprovalsService(
    prisma as never,
    events,
    email as never,
    config as never,
    notifications,
    new AuditService(prisma as never),
  );
  return { service, events };
}

const ACCEPT_DTO = {
  firstName: "Deniz",
  lastName: "Kaya",
  phone: "+90 555 000 11 22",
  password: "Guclu!Parola9x",
  termsAccepted: true,
  mediationAccepted: true,
  kvkkAccepted: true,
  marketingConsent: true,
};

// ════════════════════════════ Davet-kabul akışı ════════════════════════════
describe("token'lı davet-kabul", () => {
  it("davet: PENDING kayıt + 7 gün TTL + kabul linkli e-posta; mükerrer/kayıtlı e-posta reddedilir", async () => {
    const { service, email } = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);

    const res = await service.invite(owner.auth, {
      email: "Yeni@Firma.com",
      roles: ["SATIN_ALMACI", "SATISCI"],
    } as never);
    expect(res.email).toBe("yeni@firma.com"); // normalize

    const inv = await prisma.companyUserInvitation.findUniqueOrThrow({
      where: { id: res.id },
    });
    expect(inv.status).toBe("PENDING");
    expect(inv.token).toMatch(/^[0-9a-f]{64}$/);
    const ttlDays =
      (inv.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(ttlDays).toBeGreaterThan(6.9);
    expect(ttlDays).toBeLessThanOrEqual(7.01);

    // E-posta kabul linkini taşır.
    const call = email.send.mock.calls.at(-1)?.[0] as {
      templateData: { data: { ctaUrl: string } };
    };
    expect(call.templateData.data.ctaUrl).toBe(
      `http://localhost:3000/company/davet/${inv.token}`,
    );

    // Aynı e-postaya ikinci bekleyen davet → çakışma.
    await expect(
      service.invite(owner.auth, {
        email: "yeni@firma.com",
        roles: ["SATISCI"],
      } as never),
    ).rejects.toThrow(/bekleyen bir davet/i);

    // Kayıtlı kullanıcı e-postası → çakışma.
    await expect(
      service.invite(owner.auth, {
        email: owner.user.email,
        roles: ["SATISCI"],
      } as never),
    ).rejects.toThrow(/zaten kayıtlı/i);

    // Rol kombinasyon kuralı davette de geçerli.
    await expect(
      service.invite(owner.auth, {
        email: "baska@firma.com",
        roles: ["YONETICI", "SATISCI"],
      } as never),
    ).rejects.toThrow(/tek başına/i);
  });

  it("kabul: kullanıcı KENDİ adı/parolası + sözleşmeleriyle açılır, davet ACCEPTED, oturum döner; ikinci kabul reddedilir", async () => {
    const { service, companyAuth } = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const res = await service.invite(owner.auth, {
      email: "davetli@firma.com",
      roles: ["ONAYLAYICI"],
    } as never);
    const inv = await prisma.companyUserInvitation.findUniqueOrThrow({
      where: { id: res.id },
    });

    // Önizleme firma + rol gösterir.
    const preview = await service.getInvitationByToken(inv.token);
    expect(preview.companyName).toBe(owner.company.name);
    expect(preview.roles).toEqual(["ONAYLAYICI"]);

    const session = (await service.acceptInvitation(
      inv.token,
      ACCEPT_DTO as never,
    )) as { user: { id: string } };
    expect(companyAuth.createSession).toHaveBeenCalledTimes(1);

    const user = await prisma.companyUser.findUniqueOrThrow({
      where: { email: "davetli@firma.com" },
    });
    expect(session.user.id).toBe(user.id);
    expect(user.companyId).toBe(owner.company.id);
    expect(user.roles).toEqual(["ONAYLAYICI"]); // davet anındaki rol
    expect(user.firstName).toBe("Deniz"); // kullanıcı kendi girdi
    expect(user.emailVerifiedAt).not.toBeNull(); // link e-postaya gitti
    expect(user.invitedById).toBe(owner.user.id);
    expect(user.termsAcceptedAt).not.toBeNull();
    expect(user.kvkkAcceptedAt).not.toBeNull();
    expect(user.marketingConsent).toBe(true);

    const after = await prisma.companyUserInvitation.findUniqueOrThrow({
      where: { id: inv.id },
    });
    expect(after.status).toBe("ACCEPTED");
    expect(after.acceptedAt).not.toBeNull();

    // Aynı token ikinci kez kullanılamaz.
    await expect(
      service.acceptInvitation(inv.token, ACCEPT_DTO as never),
    ).rejects.toThrow(/zaten kabul/i);
  });

  it("süre dolumu: okumada EXPIRED'a düşer; yeniden gönder token+süreyi yeniler; iptal CANCELLED", async () => {
    const { service } = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const res = await service.invite(owner.auth, {
      email: "gecikmis@firma.com",
      roles: ["SATISCI"],
    } as never);
    const inv = await prisma.companyUserInvitation.findUniqueOrThrow({
      where: { id: res.id },
    });
    await prisma.companyUserInvitation.update({
      where: { id: inv.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(service.getInvitationByToken(inv.token)).rejects.toThrow(
      /süresi dolmuş/i,
    );
    const expired = await prisma.companyUserInvitation.findUniqueOrThrow({
      where: { id: inv.id },
    });
    expect(expired.status).toBe("EXPIRED");

    // Yeniden gönder: PENDING'e döner, token değişir, süre uzar.
    await service.resendInvitation(owner.auth, inv.id);
    const renewed = await prisma.companyUserInvitation.findUniqueOrThrow({
      where: { id: inv.id },
    });
    expect(renewed.status).toBe("PENDING");
    expect(renewed.token).not.toBe(inv.token);
    expect(renewed.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // İptal → CANCELLED; kabul reddedilir.
    await service.cancelInvitation(owner.auth, inv.id);
    await expect(
      service.acceptInvitation(renewed.token, ACCEPT_DTO as never),
    ).rejects.toThrow(/iptal/i);
  });

  it("IDOR: başka firmanın daveti iptal/yeniden gönderilemez; liste davet edeni gösterir", async () => {
    const { service } = makeUsersService();
    const a = await makeCompanyWithUser(prisma);
    const b = await makeCompanyWithUser(prisma);
    const res = await service.invite(a.auth, {
      email: "a-davet@firma.com",
      roles: ["SATISCI"],
    } as never);

    await expect(service.cancelInvitation(b.auth, res.id)).rejects.toThrow(
      /bulunamadı/i,
    );
    await expect(service.resendInvitation(b.auth, res.id)).rejects.toThrow(
      /bulunamadı/i,
    );

    const list = await service.listInvitations(a.company.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.email).toBe("a-davet@firma.com");
    expect(list[0]!.invitedByName).toContain(a.user.firstName);
  });
});

// ════════════════════════════ Onay motoru meta ════════════════════════════
describe("onay motoru meta (APR no, not, etiket, Tüm Süreçler, iptal)", () => {
  /** Aktif akış + ilan hazırlığı — approver YONETICI (owner). */
  async function rig() {
    const { service } = makeApprovalsService();
    const owner = await makeCompanyWithUser(prisma);
    const flowRes = await service.createFlow(owner.auth, {
      name: "Kazandırma Onayı",
      type: "LISTING_AWARD",
      steps: [
        {
          approverUserId: owner.user.id,
          displayLabel: "Satınalma Müdürü",
          conditionMinAmount: undefined,
        },
      ],
    } as never);
    await service.setStatus(owner.auth, flowRes.id, { status: "ACTIVE" } as never);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "CLOSED",
    });
    return { service, owner, listing, flowId: flowRes.id };
  }

  it("requestNo APR-YYYY-NNNN sırayla; firma bazında bağımsız; not + etiket snapshot", async () => {
    const { service, owner, listing } = await rig();
    const year = new Date().getFullYear();

    const r1 = await service.requestApproval(owner.auth, {
      listingId: listing.id,
      type: "LISTING_AWARD",
      listingType: "ALIM",
      amount: 1000,
      currency: "TRY",
      initiatorNote: "Acil ihtiyaç — lütfen bugün onaylayın",
    });
    expect(r1).toMatchObject({ approved: false });

    const req1 = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: (r1 as { requestId: string }).requestId },
      include: { steps: true },
    });
    expect(req1.requestNo).toBe(`APR-${year}-0001`);
    expect(req1.initiatorNote).toContain("Acil ihtiyaç");
    expect(req1.steps[0]!.displayLabel).toBe("Satınalma Müdürü");

    // İkinci istek → 0002 (ilk isteği kapatmadan da numara artar).
    const listing2 = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "CLOSED",
    });
    const r2 = await service.requestApproval(owner.auth, {
      listingId: listing2.id,
      type: "LISTING_AWARD",
      listingType: "ALIM",
      amount: 2000,
      currency: "TRY",
    });
    const req2 = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: (r2 as { requestId: string }).requestId },
    });
    expect(req2.requestNo).toBe(`APR-${year}-0002`);

    // Başka firma kendi sayacından başlar.
    const other = await rig();
    const r3 = await other.service.requestApproval(other.owner.auth, {
      listingId: other.listing.id,
      type: "LISTING_AWARD",
      listingType: "ALIM",
      amount: 500,
      currency: "TRY",
    });
    const req3 = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: (r3 as { requestId: string }).requestId },
    });
    expect(req3.requestNo).toBe(`APR-${year}-0001`);
  });

  it("listPending + listAll: requestNo/not/etiket döner; filtre (durum + arama) çalışır", async () => {
    const { service, owner, listing } = await rig();
    await service.requestApproval(owner.auth, {
      listingId: listing.id,
      type: "LISTING_AWARD",
      listingType: "ALIM",
      amount: 1000,
      currency: "TRY",
      initiatorNote: "Not-123",
    });

    const pending = await service.listPending(owner.auth);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.requestNo).toMatch(/^APR-\d{4}-0001$/);
    expect(pending[0]!.initiatorNote).toBe("Not-123");
    expect(pending[0]!.createdBy).toContain(owner.user.firstName);

    const all = await service.listAll(owner.auth, {});
    expect(all).toHaveLength(1);
    expect(all[0]!.steps[0]!.displayLabel).toBe("Satınalma Müdürü");
    expect(all[0]!.currentApprover).toContain(owner.user.firstName);

    // requestNo ile arama bulur; durum filtresi eler.
    const byNo = await service.listAll(owner.auth, {
      search: pending[0]!.requestNo!,
    });
    expect(byNo).toHaveLength(1);
    const rejectedOnly = await service.listAll(owner.auth, {
      status: "REJECTED",
    });
    expect(rejectedOnly).toHaveLength(0);
  });

  it("iptal: başlatan DEĞİL ama YONETICI olan kullanıcı iptal edebilir; yetkisiz rol edemez", async () => {
    const { service, owner, listing } = await rig();
    // Başlatan: satın almacı üye.
    const buyer = await makeUser(prisma, owner.company.id, [
      "SATIN_ALMACI",
    ] as never);
    const buyerAuth = {
      userId: buyer.id,
      companyId: owner.company.id,
      email: buyer.email,
      roles: ["SATIN_ALMACI"],
      isOwner: false,
    } as never;
    const res = await service.requestApproval(buyerAuth, {
      listingId: listing.id,
      type: "LISTING_AWARD",
      listingType: "ALIM",
      amount: 900,
      currency: "TRY",
    });
    const requestId = (res as { requestId: string }).requestId;

    // Yetkisiz (başka satışçı) iptal edemez.
    const seller = await makeUser(prisma, owner.company.id, [
      "SATISCI",
    ] as never);
    await expect(
      service.cancelRequest(
        {
          userId: seller.id,
          companyId: owner.company.id,
          roles: ["SATISCI"],
          isOwner: false,
        } as never,
        requestId,
      ),
    ).rejects.toThrow(/başlatan veya Yönetici/i);

    // Yönetici (owner değilken de) iptal edebilir.
    const manager = await makeUser(prisma, owner.company.id, [
      "YONETICI",
    ] as never);
    await service.cancelRequest(
      {
        userId: manager.id,
        companyId: owner.company.id,
        roles: ["YONETICI"],
        isOwner: false,
      } as never,
      requestId,
    );
    const after = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    expect(after.status).toBe("CANCELLED");
  });

  it("preview: akış tipi + başlatıcı rol eşleşmesine göre publish/award bayrakları", async () => {
    const { service } = makeApprovalsService();
    const owner = await makeCompanyWithUser(prisma);
    // Yalnız SATIN_ALMACI başlatıcılı AWARD akışı (ALIM'a özel).
    const f = await service.createFlow(owner.auth, {
      name: "Alım Kazandırma",
      type: "LISTING_AWARD",
      listingType: "ALIM",
      initiatorRoles: ["SATIN_ALMACI"],
      steps: [{ approverUserId: owner.user.id }],
    } as never);
    await service.setStatus(owner.auth, f.id, { status: "ACTIVE" } as never);

    // Satın almacı için ALIM award=true, publish=false.
    const buyer = await makeUser(prisma, owner.company.id, [
      "SATIN_ALMACI",
    ] as never);
    const buyerAuth = {
      userId: buyer.id,
      companyId: owner.company.id,
      roles: ["SATIN_ALMACI"],
      isOwner: false,
    } as never;
    expect(await service.preview(buyerAuth, "ALIM")).toEqual({
      publish: false,
      award: true,
    });
    // SATIS ilanına uygulanmaz.
    expect(await service.preview(buyerAuth, "SATIS")).toEqual({
      publish: false,
      award: false,
    });
    // Satışçı başlatıcı rolde değil → akış onu yakalamaz.
    const seller = await makeUser(prisma, owner.company.id, [
      "SATISCI",
    ] as never);
    expect(
      await service.preview(
        {
          userId: seller.id,
          companyId: owner.company.id,
          roles: ["SATISCI"],
          isOwner: false,
        } as never,
        "ALIM",
      ),
    ).toEqual({ publish: false, award: false });
  });
});
