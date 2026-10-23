/**
 * Token'lı davet-kabul akışı (davet → e-posta linki → kabulde hesap açılır)
 * + onay motoru meta eklemeleri (APR-YYYY-NNNN, başlatıcı notu, adım etiketi
 * snapshot'ı, Tüm Süreçler listesi, Yönetici iptal yetkisi, preview).
 */
import { EventEmitter2 } from "@nestjs/event-emitter";
import { CompanyRole } from "@prisma/client";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { AcceptCompanyInvitationDto } from "../../src/modules/company-users/dto/company-user.dto";
import { CompanyApprovalsService } from "../../src/modules/company-approvals/company-approvals.service";
import { CompanyUsersService } from "../../src/modules/company-users/company-users.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { makeCompanyWithUser, makeListing, makeUser } from "./factories";
import { prisma, truncateAll } from "./test-db";
import { runWithLocale } from "../../src/common/i18n/locale-context";

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
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
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
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const notifications = new NotificationService(prisma as never);
  const events = new EventEmitter2();
  const service = new CompanyApprovalsService(
    prisma as never,
    // P12 #3: bypass client (testte RLS kapalı → aynı client)
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
  it("davet e-postası GİTMEDİYSE yanıt bunu söyler; yalnız görüntüleme izniyle davet rol satırı 'Görüntüleyici'", async () => {
    const { service, email } = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    email.send.mockResolvedValueOnce({ emailLogId: "t", sent: false });
    const res = await service.invite(owner.auth, {
      email: "izleyici@firma.com",
      permissions: ["buy:view"],
    } as never);
    expect(res).toMatchObject({ emailSent: false, emailFailureReason: "suppressed" });
    const call = email.send.mock.calls.at(-1)?.[0] as {
      templateData: { data: { infoRows: Array<{ label: string; value: string }> } };
    };
    const roleRow = call.templateData.data.infoRows.find((r) => r.label === "Rol");
    expect(roleRow?.value).toBe("Görüntüleyici");

    email.send.mockRejectedValueOnce(new Error("resend down"));
    const again = await service.resendInvitation(owner.auth, res.id);
    expect(again).toMatchObject({ ok: true, emailSent: false, emailFailureReason: "failed" });
    const ok = await service.resendInvitation(owner.auth, res.id);
    expect(ok).toMatchObject({ ok: true, emailSent: true });
  });

  it("teslim edilemez alan adına davet: neden 'undeliverable' (ekran 'adres geri çevirdi' demez)", async () => {
    const { service, email } = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    email.send.mockResolvedValueOnce({ emailLogId: "t", sent: false, skipReason: "undeliverable" });
    const res = await service.invite(owner.auth, {
      email: "yeni@firma.test",
      permissions: ["buy:view"],
    } as never);
    expect(res).toMatchObject({ emailSent: false, emailFailureReason: "undeliverable" });
  });

  it("staging izin listesinde olmayan adrese davet: neden 'allowlist' (ekran 'adres geri çevirdi' demez)", async () => {
    const { service, email } = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    email.send.mockResolvedValueOnce({ emailLogId: "t", sent: false, skipReason: "allowlist" });
    const res = await service.invite(owner.auth, {
      email: "yeni@firma.com",
      permissions: ["buy:view"],
    } as never);
    expect(res).toMatchObject({ emailSent: false, emailFailureReason: "allowlist" });
  });

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

    // Faz R: YONETICI+SATISCI kombosu davette GEÇERLİ (münhasırlık kalktı).
    await expect(
      service.invite(owner.auth, {
        email: "baska@firma.com",
        roles: ["YONETICI", "SATISCI"],
      } as never),
    ).resolves.toBeDefined();
    // SAHIP davetle yine verilemez (etiket yalnız devirle geçer).
    await expect(
      service.invite(owner.auth, {
        email: "kurucu-adayi@firma.com",
        roles: ["SAHIP"],
      } as never),
    ).rejects.toThrow(/davetle verilemez/i);
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
    // Eski web paketi telefonu göndermeyi sürdürebilir: gelen numara saklanır.
    expect(user.phone).toBe("+90 555 000 11 22");
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

  // Sahip kararı 2026-10-08: davet kabul formu telefonu sormaz; API alanı
  // isteğe bağlı kabul etmeyi sürdürür.
  it("kabul telefonsuz: gövde DTO'dan geçer, üye phone=null ile açılır", async () => {
    const { service } = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const res = await service.invite(owner.auth, {
      email: "telefonsuz@firma.com",
      roles: ["ONAYLAYICI"],
    } as never);
    const inv = await prisma.companyUserInvitation.findUniqueOrThrow({ where: { id: res.id } });

    const { phone: _phone, ...body } = ACCEPT_DTO;
    const dto = plainToInstance(AcceptCompanyInvitationDto, body);
    expect(validateSync(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    await service.acceptInvitation(inv.token, dto);

    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: "telefonsuz@firma.com" } });
    expect(user.phone).toBeNull();
    expect(user.firstName).toBe("Deniz");
    // Ekip listesi "null" yazısı değil boş değer alır.
    const row = (await service.list(owner.company.id)).find((u) => u.id === user.id);
    expect(row?.phone).toBeNull();
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

  // DAVET DİLİ (2026-09-27): Türk kurucu İngilizce konuşan çalışanını davet
  // eder → e-posta ve kabul adresi İngilizce; yeniden gönderim aynı dili korur;
  // hesap kabul sayfasının dilinde doğar.
  it("Aktivite Logu: davet iptali ve kişi bilgisi düzenlemesi iz bırakır; PII yazılmaz, değişmeyen alan yazılmaz (arayüz testi webC-07 NEW-2)", async () => {
    const { service } = makeUsersService();
    const a = await makeCompanyWithUser(prisma);
    const b = await makeCompanyWithUser(prisma);
    const res = await service.invite(a.auth, {
      email: "iptal-iz@firma.com",
      roles: ["SATISCI"],
    } as never);

    // Başka firmanın iptal denemesi (404) iz bırakmaz.
    await expect(service.cancelInvitation(b.auth, res.id)).rejects.toThrow(/bulunamadı/i);
    await service.cancelInvitation(a.auth, res.id);
    const cancelled = await prisma.auditLog.findMany({
      where: { action: "company.user.invitation_cancelled" },
    });
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]).toMatchObject({
      tenantId: a.company.id,
      actorId: a.user.id,
      entityType: "company_user_invitation",
      entityId: res.id,
    });
    expect(JSON.stringify(cancelled[0].metadata ?? {})).not.toContain("iptal-iz@firma.com");
    // Detay için geri alınan yetki seti yazılır (arayüz testi kalanlar api-2).
    expect(cancelled[0].metadata).toMatchObject({ roles: ["SATISCI"] });
    expect(Array.isArray((cancelled[0].metadata as { permissions?: unknown }).permissions)).toBe(true);

    const member = await makeUser(prisma, a.company.id, [CompanyRole.SATISCI], {
      firstName: "Ayşe",
      lastName: "Yılmaz",
      phone: null,
    });
    // Soyad aynı (yalnız boşluk farkı) → yalnız ad ve telefon değişti sayılır.
    await service.updateUser(a.auth, member.id, {
      firstName: "Ayşegül",
      lastName: " Yılmaz ",
      phone: "+90 532 000 00 00",
    });
    const updated = await prisma.auditLog.findMany({
      where: { action: "company.user.profile_updated" },
    });
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      tenantId: a.company.id,
      entityType: "company_user",
      entityId: member.id,
      metadata: { changedFields: ["firstName", "phone"] },
    });
    expect(JSON.stringify(updated[0].metadata)).not.toMatch(/Ayşegül|532/);

    // Hiçbir alan değişmediyse (aynı değerlerle kaydet) yeni iz yok.
    await service.updateUser(a.auth, member.id, { firstName: "Ayşegül", phone: "+90 532 000 00 00" });
    expect(
      await prisma.auditLog.count({ where: { action: "company.user.profile_updated" } }),
    ).toBe(1);

    // Tenant listesinde (Aktivite Logu, kullanıcı modülü) hedef kişiyle görünür.
    const log = await new AuditService(prisma as never).queryForTenant(a.company.id, {
      module: "user",
    });
    const actions = log.items.map((r: { action: string }) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining(["company.user.invitation_cancelled", "company.user.profile_updated"]),
    );
    // Davet satırları hedef adresi okuma anında AYNI firmanın davetinden çözer
    // (metadata'da PII yok); başka firmanın listesinde görünmez.
    const cancelRow = log.items.find(
      (r: { action: string }) => r.action === "company.user.invitation_cancelled",
    ) as { entityLabel: string | null };
    expect(cancelRow.entityLabel).toBe("iptal-iz@firma.com");
    const other = await new AuditService(prisma as never).queryForTenant(b.company.id, {
      module: "user",
    });
    expect(JSON.stringify(other.items)).not.toContain("iptal-iz@firma.com");
  });

  it("davet dili: seçilen dilde e-posta + kabul adresi, yeniden gönderimde korunur; dilsiz davet davet edenin dili", async () => {
    const { service, email } = makeUsersService();
    const owner = await makeCompanyWithUser(prisma); // kurucu Türkçe (varsayılan)
    type Sent = { locale: string; subject?: string; templateData: { data: { subject: string; ctaUrl: string } } };
    const lastSent = () => email.send.mock.calls.at(-1)?.[0] as Sent;

    const res = await service.invite(owner.auth, {
      email: "english@firma.com",
      permissions: ["buy:view"],
      locale: "en",
    } as never);
    const inv = await prisma.companyUserInvitation.findUniqueOrThrow({ where: { id: res.id } });
    expect(inv.locale).toBe("en");
    expect(lastSent().locale).toBe("en");
    expect(lastSent().templateData.data.ctaUrl).toBe(
      `http://localhost:3000/en/company/invite/${inv.token}`,
    );
    expect(lastSent().templateData.data.subject).not.toMatch(/davet/i);

    await service.resendInvitation(owner.auth, res.id);
    const renewed = await prisma.companyUserInvitation.findUniqueOrThrow({ where: { id: res.id } });
    expect(lastSent().locale).toBe("en");
    expect(lastSent().templateData.data.ctaUrl).toBe(
      `http://localhost:3000/en/company/invite/${renewed.token}`,
    );

    // Kabul sayfası İngilizce açıldı → hesap İngilizce doğar.
    await runWithLocale("en", () =>
      service.acceptInvitation(renewed.token, ACCEPT_DTO as never),
    );
    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: "english@firma.com" } });
    expect(user.locale).toBe("en");

    // Dil seçilmediyse davet edenin kayıtlı dili (Rusça kurucu → Rusça davet).
    await prisma.companyUser.update({ where: { id: owner.user.id }, data: { locale: "ru" } });
    const plain = await service.invite(owner.auth, {
      email: "dilsiz@firma.com",
      permissions: ["buy:view"],
    } as never);
    const plainInv = await prisma.companyUserInvitation.findUniqueOrThrow({ where: { id: plain.id } });
    expect(plainInv.locale).toBeNull();
    expect(lastSent().locale).toBe("ru");
    expect(lastSent().templateData.data.ctaUrl).toBe(
      `http://localhost:3000/ru/kompaniya/priglashenie/${plainInv.token}`,
    );
  });
});

// ════════════════════════════ Onay motoru meta ════════════════════════════
describe("onay motoru meta (APR no, not, etiket, Tüm Süreçler, iptal)", () => {
  /** Aktif akış + ilan hazırlığı — approver YONETICI (owner). */
  async function rig() {
    const { service } = makeApprovalsService();
    const owner = await makeCompanyWithUser(prisma);
    // Onaycı initiator'dan FARKLI olmalı (INV-APPR-1 görev ayrılığı) — ayrı admin.
    const approver = await makeUser(prisma, owner.company.id, [
      "YONETICI",
    ] as never);
    const flowRes = await service.createFlow(owner.auth, {
      name: "Kazandırma Onayı",
      type: "LISTING_AWARD",
      steps: [
        {
          approverUserId: approver.id,
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
    return { service, owner, listing, flowId: flowRes.id, approver };
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
    const { service, owner, listing, approver } = await rig();
    await service.requestApproval(owner.auth, {
      listingId: listing.id,
      type: "LISTING_AWARD",
      listingType: "ALIM",
      amount: 1000,
      currency: "TRY",
      initiatorNote: "Not-123",
    });

    // Bekleyen adımın onaycısı initiator DEĞİL (görev ayrılığı) — ayrı approver.
    const approverAuth = {
      userId: approver.id,
      companyId: owner.company.id,
      roles: ["YONETICI"],
    } as never;
    const pending = await service.listPending(approverAuth);
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

  it("wouldRequireApproval: akış tipi + başlatıcı rol + TUTAR eşiğine göre onay gerekliliği", async () => {
    const { service } = makeApprovalsService();
    const owner = await makeCompanyWithUser(prisma);
    // Yalnız SATIN_ALMACI başlatıcılı AWARD akışı (ALIM'a özel), eşik 10.000 TL.
    const f = await service.createFlow(owner.auth, {
      name: "Alım Kazandırma",
      type: "LISTING_AWARD",
      listingType: "ALIM",
      initiatorRoles: ["SATIN_ALMACI"],
      steps: [{ approverUserId: owner.user.id, conditionMinAmount: 10_000 }],
    } as never);
    await service.setStatus(owner.auth, f.id, { status: "ACTIVE" } as never);

    const buyer = await makeUser(prisma, owner.company.id, [
      "SATIN_ALMACI",
    ] as never);
    const buyerAuth = {
      userId: buyer.id,
      companyId: owner.company.id,
      roles: ["SATIN_ALMACI"],
      isOwner: false,
    } as never;

    // Eşik-ÜSTÜ ALIM tutarı → onay gerekir.
    expect(
      await service.wouldRequireApproval(buyerAuth, {
        type: "LISTING_AWARD",
        listingType: "ALIM",
        amount: 50_000,
      }),
    ).toBe(true);
    // Eşik-ALTI tutar → akış VAR ama onay GEREKMEZ. (Kök-neden fix: preview akışın
    // yalnız varlığına baksaydı burada true dönerdi → "Onaya Gönder" yanıltması.
    // requestApproval ile AYNI eleme mantığı sayesinde doğrudan kazandırılır.)
    expect(
      await service.wouldRequireApproval(buyerAuth, {
        type: "LISTING_AWARD",
        listingType: "ALIM",
        amount: 500,
      }),
    ).toBe(false);
    // Satışçı başlatıcı rolde değil → akış onu yakalamaz.
    const seller = await makeUser(prisma, owner.company.id, [
      "SATISCI",
    ] as never);
    expect(
      await service.wouldRequireApproval(
        {
          userId: seller.id,
          companyId: owner.company.id,
          roles: ["SATISCI"],
          isOwner: false,
        } as never,
        { type: "LISTING_AWARD", listingType: "ALIM", amount: 50_000 },
      ),
    ).toBe(false);
  });
});

/**
 * Yayın denetimi 2026-09-28 Bölüm 5: görüntüleme izinli davet koltuk
 * tüketmediği ve yeniden gönderim beklemesiz olduğu için ücretsiz hesap
 * rastgele adreslere sınırsız davet e-postası attırabiliyordu (işlem
 * göndereninden). Firma başına günde 20 davet e-postası, aynı davete 10 dk'da bir.
 */
describe("ekip daveti e-posta freni", () => {
  async function logSend(invitationId: string, minutesAgo = 0) {
    await prisma.emailLog.create({
      data: {
        template: "notification",
        toEmail: "x@firma.com",
        subject: "davet",
        provider: "test",
        status: "SENT",
        contextType: "company_user_invitation",
        contextId: invitationId,
        queuedAt: new Date(Date.now() - minutesAgo * 60_000),
      },
    });
  }

  it("günde 20 davet e-postası gitmişse yeni davet 429 DAILY_LIMIT; kayıt açılmaz, e-posta gitmez — iptal etmek sayacı SIFIRLAMAZ", async () => {
    const { service, email } = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    for (let i = 0; i < 20; i++) {
      const res = await service.invite(owner.auth, { email: `izleyici${i}@firma.com`, permissions: ["buy:view"] } as never);
      await logSend(res.id);
      await service.cancelInvitation(owner.auth, res.id);
    }
    email.send.mockClear();

    await expect(
      service.invite(owner.auth, { email: "fazla@firma.com", permissions: ["buy:view"] } as never),
    ).rejects.toMatchObject({ status: 429, response: expect.objectContaining({ code: "DAILY_LIMIT" }) });
    expect(await prisma.companyUserInvitation.count({ where: { email: "fazla@firma.com" } })).toBe(0);
    expect(email.send).not.toHaveBeenCalled();

    // Başka firmanın tavanı ayrı.
    const other = await makeCompanyWithUser(prisma);
    await expect(
      service.invite(other.auth, { email: "fazla@firma.com", permissions: ["buy:view"] } as never),
    ).resolves.toMatchObject({ emailSent: true });
  });

  it("aynı davet 10 dk içinde yeniden gönderilemez (429 RESEND_COOLDOWN); süre geçince gönderilir", async () => {
    const { service } = makeUsersService();
    const owner = await makeCompanyWithUser(prisma);
    const res = await service.invite(owner.auth, { email: "yeniden@firma.com", permissions: ["buy:view"] } as never);
    await logSend(res.id, 2);

    await expect(service.resendInvitation(owner.auth, res.id)).rejects.toMatchObject({
      status: 429,
      response: expect.objectContaining({ code: "RESEND_COOLDOWN" }),
    });

    await prisma.emailLog.updateMany({ where: { contextId: res.id }, data: { queuedAt: new Date(Date.now() - 11 * 60_000) } });
    await expect(service.resendInvitation(owner.auth, res.id)).resolves.toMatchObject({ ok: true, emailSent: true });
  });
});
