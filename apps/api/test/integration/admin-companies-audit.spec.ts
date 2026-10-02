/**
 * Admin yıkıcı aksiyonları append-only audit_logs'a yazılır (actor kimliğiyle).
 * Denetim izi olmadan firma askıya alınması/tier verilmesi = uyumluluk açığıydı.
 */
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { EmailSuppressionService } from "../../src/modules/email/email-suppression.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompany, makeCompanyWithUser } from "./factories";

function rig() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
  const notifications = { pushToCompany: jest.fn().mockResolvedValue(1) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const audit = new AuditService(prisma as never);
  const service = new AdminCompaniesService(
    prisma as never,
    {} as never,
    email as never,
    notifications as never,
    config as never,
    audit,
    new EmailSuppressionService(prisma as never),
  );
  return { service, notifications };
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("Admin aksiyonları audit'lenir", () => {
  it("suspend → audit_log (admin actorId + action + entityId)", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await service.suspend(co.company.id, "spam", "admin-123");
    const row = await prisma.auditLog.findFirst({
      where: { action: "admin.company.suspended", entityId: co.company.id },
    });
    expect(row).not.toBeNull();
    expect(row!.actorType).toBe("admin");
    expect(row!.actorId).toBe("admin-123");
  });

  it("setTier → audit_log (actorId + tier metadata)", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    await service.setTier(co.company.id, "GOLD", 12, "admin-9");
    const row = await prisma.auditLog.findFirst({
      where: { action: "admin.company.tier_set", entityId: co.company.id },
    });
    expect(row).not.toBeNull();
    expect(row!.actorId).toBe("admin-9");
  });

  // Arayüz testi D-192 yeniden doğrulama: paket değişimi herkese açık firma ve
  // ürün sayfalarını (Gold rozeti, Silver+ video/belgeler) tazeler.
  it("setTier paket değişince SEO tazelemesi yayar; aynı paket yeniden yazılınca yaymaz", async () => {
    const seo = { companyChanged: jest.fn() };
    const service = new AdminCompaniesService(
      prisma as never,
      {} as never,
      { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) } as never,
      { pushToCompany: jest.fn().mockResolvedValue(1) } as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      new AuditService(prisma as never),
      new EmailSuppressionService(prisma as never),
      seo as never,
    );
    const co = await makeCompanyWithUser(prisma, { tier: "SILVER" });
    await service.setTier(co.company.id, "STANDART", undefined, "admin-1");
    expect(seo.companyChanged).toHaveBeenCalledWith(co.company.id);
    seo.companyChanged.mockClear();
    await service.setTier(co.company.id, "STANDART", undefined, "admin-1");
    expect(seo.companyChanged).not.toHaveBeenCalled();
  });

  it("verification_set → audit_log", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    // Red gerekçesi (kod VEYA ≥3 karakterlik not) servis katmanında da zorunlu
    // (2026-09-27, kodlu gerekçe) — yalnız kodla red.
    await service.setVerification(co.company.id, "REJECTED", "admin-7", undefined, "UNREADABLE");
    const row = await prisma.auditLog.findFirst({
      where: {
        action: "admin.company.verification_set",
        entityId: co.company.id,
      },
    });
    expect(row).not.toBeNull();
    expect(row!.actorId).toBe("admin-7");
  });
});

describe("updateProfile — kimlik düzeltme (Faz 2)", () => {
  it("yalnız gönderilen+değişen alanlar güncellenir, öncesi/sonrası audit'e yazılır", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { country: "TR" });
    const res = await service.updateProfile(
      co.company.id,
      { taxOffice: "Kadıköy", city: "İstanbul" },
      "admin-1",
    );
    expect(res.changed.sort()).toEqual(["city", "taxOffice"]);
    const after = await prisma.company.findUniqueOrThrow({
      where: { id: co.company.id },
      select: { taxOffice: true, city: true, name: true },
    });
    expect(after.taxOffice).toBe("Kadıköy");
    expect(after.city).toBe("İstanbul");
    // Ad gönderilmedi → dokunulmadı.
    expect(after.name).toBe(co.company.name);
    const log = await prisma.auditLog.findFirst({
      where: {
        action: "admin.company.profile_updated",
        entityId: co.company.id,
      },
    });
    expect(log).not.toBeNull();
    expect(log!.actorId).toBe("admin-1");
    const changes = (log!.metadata as { changes: Record<string, unknown> })
      .changes;
    expect(Object.keys(changes).sort()).toEqual(["city", "taxOffice"]);
  });

  it("değişiklik yoksa update/audit atlanır; ülke koda normalize edilir", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { country: "TR" });
    const noop = await service.updateProfile(
      co.company.id,
      { country: "TR" },
      "admin-1",
    );
    expect(noop.changed).toEqual([]);
    const res = await service.updateProfile(
      co.company.id,
      { country: "de" },
      "admin-1",
    );
    expect(res.changed).toEqual(["country"]);
    const after = await prisma.company.findUniqueOrThrow({
      where: { id: co.company.id },
      select: { country: true },
    });
    expect(after.country).toBe("DE");
  });

  it("firma adı boşa çekilemez", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    await expect(
      service.updateProfile(co.company.id, { name: "  " }, "admin-1"),
    ).rejects.toThrow("Firma adı boş olamaz");
  });

  it("başka firmadaki vergi numarasına düzeltme 500 değil 409 (derin denetim MU-16)", async () => {
    const { service } = rig();
    const a = await makeCompanyWithUser(prisma, {});
    const b = await makeCompanyWithUser(prisma, {});
    await prisma.company.update({ where: { id: a.company.id }, data: { taxNumber: "1234567890" } });
    const err = await service
      .updateProfile(b.company.id, { taxNumber: "1234567890" }, "admin-1")
      .catch((e: unknown) => e);
    expect((err as { getStatus: () => number }).getStatus()).toBe(409);
    expect((err as Error).message).toBe("Bu vergi numarası başka bir firmada kayıtlı");
  });
});

describe("üyelik yönetimi — event kayıtları + ek-süreli uzatma (Faz 3)", () => {
  it("setTier PAKET → GRANT eventi (endBefore/After + gerekçe + admin)", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    await service.setTier(co.company.id, "GOLD", 6, "admin-3", "satış");
    const ev = await prisma.companyMembershipEvent.findFirst({
      where: { companyId: co.company.id, action: "GRANT" },
    });
    expect(ev).not.toBeNull();
    expect(ev!.months).toBe(6);
    expect(ev!.reason).toBe("satış");
    expect(ev!.adminId).toBe("admin-3");
    expect(ev!.endAfter).not.toBeNull();
  });

  it("extend GELECEKTEKİ bitişe ay EKLER (bugünden yeniden hesaplamaz)", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    // Bitiş 6 ay sonra olsun.
    const end = new Date();
    end.setMonth(end.getMonth() + 6);
    await prisma.company.update({
      where: { id: co.company.id },
      data: { membershipEndAt: end },
    });
    const res = await service.extendMembership(co.company.id, 3, "admin-1");
    // Yeni bitiş ≈ 9 ay sonra (6+3) — bugünden 3 ay DEĞİL.
    const expected = new Date(end);
    expected.setMonth(expected.getMonth() + 3);
    expect(
      Math.abs(res.membershipEndAt.getTime() - expected.getTime()),
    ).toBeLessThan(5_000);
    const ev = await prisma.companyMembershipEvent.findFirst({
      where: { companyId: co.company.id, action: "EXTEND" },
    });
    expect(ev!.months).toBe(3);
  });

  it("bitiş geçmişteyse uzatma bugünden başlar; STANDARD'da uzatma reddedilir", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.company.update({
      where: { id: co.company.id },
      data: { membershipEndAt: new Date(Date.now() - 86_400_000) },
    });
    const res = await service.extendMembership(co.company.id, 2, "admin-1");
    const expected = new Date();
    expected.setMonth(expected.getMonth() + 2);
    expect(
      Math.abs(res.membershipEndAt.getTime() - expected.getTime()),
    ).toBeLessThan(60_000);

    const std = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    await expect(
      service.extendMembership(std.company.id, 3, "admin-1"),
    ).rejects.toThrow(/paketli üyelikte/);
  });

  it("membershipHistory + report toplamları (GRANT+EXTEND ay toplamı)", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    await service.setTier(co.company.id, "GOLD", 12, "admin-1", "ilk satış");
    await service.extendMembership(co.company.id, 6, "admin-1", "yenileme");
    await service.setTier(co.company.id, "STANDART", undefined, "admin-1", "iade");

    const history = await service.membershipHistory(co.company.id);
    expect(history.map((h) => h.action)).toEqual([
      "REVOKE",
      "EXTEND",
      "GRANT",
    ]);

    const report = await service.membershipReport();
    expect(report.totals.grants).toBeGreaterThanOrEqual(1);
    expect(report.totals.extends).toBeGreaterThanOrEqual(1);
    expect(report.totals.revokes).toBeGreaterThanOrEqual(1);
    // 12 (GRANT) + 6 (EXTEND) = 18 ay satış.
    expect(report.totals.monthsGranted).toBeGreaterThanOrEqual(18);
    const row = report.rows.find((r) => r.action === "GRANT");
    expect(row!.companyName).toBe(co.company.name);
  });
});

describe("destek araçları (Faz 6) — notlar + arama + duyuru + şikayet sayfalama", () => {
  it("not ekle/listele/sil — audit'li; kısa not reddedilir", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, {});
    await expect(
      service.addNote(co.company.id, "a", "admin-1"),
    ).rejects.toThrow(/en az 3/);
    const added = await service.addNote(
      co.company.id,
      "Telefonla arandı, belge yarın gelecek",
      "admin-1",
    );
    const notes = await service.listNotes(co.company.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.body).toContain("Telefonla arandı");
    await service.deleteNote(added.id, "admin-1");
    expect(await service.listNotes(co.company.id)).toHaveLength(0);
    const log = await prisma.auditLog.findFirst({
      where: { action: "admin.company.note_added", entityId: co.company.id },
    });
    expect(log).not.toBeNull();
  });

  it("globalSearch: firma adı + kullanıcı e-postası bulur; 2 karakterden kısa boş döner", async () => {
    const { service } = rig();
    const co = await makeCompanyWithUser(prisma, { name: "Arama Test A.Ş." });
    expect(await service.globalSearch("a")).toEqual({
      companies: [],
      users: [],
    });
    const byName = await service.globalSearch("Arama Test");
    expect(byName.companies.map((c) => c.id)).toContain(co.company.id);
    const byEmail = await service.globalSearch(co.user.email.slice(0, 10));
    expect(byEmail.users.map((u) => u.companyId)).toContain(co.company.id);
  });

  it("announce: segment (tier) filtresine uyan firmalara in-app push + audit", async () => {
    const { service, notifications } = rig();
    await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await makeCompanyWithUser(prisma, { tier: "STANDART" });
    const res = await service.announce(
      { subject: "Bakım", message: "Planlı bakım bildirimi", tier: "GOLD" },
      "admin-1",
    );
    expect(res.targets).toBe(2);
    expect(res.delivered).toBe(2);
    expect(notifications.pushToCompany).toHaveBeenCalledTimes(2);
    const log = await prisma.auditLog.findFirst({
      where: { action: "admin.announcement.sent" },
    });
    expect(log?.metadata).toMatchObject({ tier: "GOLD", targets: 2 });
  });

  it("listComplaints: paged + q araması (firma adı)", async () => {
    const { service } = rig();
    const a = await makeCompanyWithUser(prisma, { name: "Şikayetçi Firma" });
    const b = await makeCompanyWithUser(prisma, { name: "Suçlanan Firma" });
    await prisma.companyComplaint.create({
      data: {
        complainantCompanyId: a.company.id,
        againstCompanyId: b.company.id,
        reason: "Geç teslimat",
        createdById: a.user.id,
      },
    });
    const all = await service.listComplaints();
    expect(all.total).toBe(1);
    expect(all.items[0]!.reason).toBe("Geç teslimat");
    const byName = await service.listComplaints(
      undefined,
      undefined,
      "Suçlanan",
    );
    expect(byName.total).toBe(1);
    const miss = await service.listComplaints(undefined, undefined, "yok-böyle");
    expect(miss.total).toBe(0);
  });
});

describe("list — sayfalama + kuyruk sıralaması (Faz 1-2)", () => {
  it("paged shape döner; sort=oldest updatedAt artan sıralar", async () => {
    const { service } = rig();
    const a = await makeCompanyWithUser(prisma, {});
    const b = await makeCompanyWithUser(prisma, {});
    // b'yi daha eski güncellenmiş yap (kuyrukta önce gelmeli).
    await prisma.company.update({
      where: { id: b.company.id },
      data: { updatedAt: new Date(Date.now() - 3 * 86_400_000) },
    });
    const res = await service.list({ sort: "oldest", page: 1, pageSize: 10 });
    expect(res.total).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(res.items)).toBe(true);
    const ids = res.items.map((r) => r.id);
    expect(ids.indexOf(b.company.id)).toBeLessThan(ids.indexOf(a.company.id));
    // Kuyruk yaşı alanı mevcut.
    expect(res.items[0]!.updatedAt).toBeInstanceOf(Date);
  });

  it("kuyruk (queue=kyc): Başvuru tarihi ve sıra belge gönderiminden gelir, sonraki düzenleme sırayı bozmaz (arayüz testi O-075)", async () => {
    const { service } = rig();
    const day = 86_400_000;
    const first = await makeCompanyWithUser(prisma, { companyVerificationStatus: "PENDING" });
    const second = await makeCompanyWithUser(prisma, { companyVerificationStatus: "PENDING" });
    const revising = await makeCompanyWithUser(prisma, { companyVerificationStatus: "VERIFIED" });
    const submitAt = (id: string, at: Date) =>
      prisma.auditLog.create({
        data: {
          action: "company.docs.submitted",
          actorType: "company",
          entityType: "company",
          entityId: id,
          createdAt: at,
        },
      });
    await submitAt(first.company.id, new Date(Date.now() - 5 * day));
    await submitAt(second.company.id, new Date(Date.now() - 3 * day));
    const revAt = new Date(Date.now() - 4 * day);
    await prisma.companyKycRevision.create({
      data: {
        companyId: revising.company.id,
        kind: "taxPlate",
        key: `company-docs/${revising.company.id}/taxPlate-v2.pdf`,
        status: "PENDING",
        createdAt: revAt,
      },
    });
    // Admin ilk firmanın bilgisini düzenledi → updatedAt şimdi.
    await prisma.company.update({
      where: { id: first.company.id },
      data: { name: "Edited Name", updatedAt: new Date() },
    });

    const res = await service.list({ queue: "kyc", sort: "oldest", page: 1, pageSize: 10 });
    expect(res.total).toBe(3);
    expect(res.items.map((r) => r.id)).toEqual([
      first.company.id,
      revising.company.id,
      second.company.id,
    ]);
    expect(Math.round((Date.now() - res.items[0]!.submittedAt!.getTime()) / day)).toBe(5);
    expect(res.items[1]!.submittedAt!.getTime()).toBe(revAt.getTime());

    // Sayfalama sırayı korur.
    const p2 = await service.list({ queue: "kyc", sort: "oldest", page: 2, pageSize: 2 });
    expect(p2.total).toBe(3);
    expect(p2.items.map((r) => r.id)).toEqual([second.company.id]);
  });

  it("stats funnel adımlarını döner", async () => {
    const { service } = rig();
    await makeCompanyWithUser(prisma, {});
    const stats = await service.stats();
    expect(stats.funnel.signedUp).toBeGreaterThanOrEqual(1);
    expect(stats.funnel).toHaveProperty("onboarded");
    expect(stats.funnel).toHaveProperty("kycSubmitted");
    expect(stats.funnel).toHaveProperty("verified");
  });

  it("stats ülke seçenekleri ilk 10 ile sınırlı değil (derin denetim LU-11)", async () => {
    const { service } = rig();
    const countries = ["TR", "DE", "FR", "IT", "ES", "NL", "PL", "GB", "US", "AZ", "GE", "KZ"];
    for (const country of countries) {
      await makeCompanyWithUser(prisma, { country });
    }
    await makeCompanyWithUser(prisma, { country: "TR" });
    const stats = await service.stats();
    // Pano yine en kalabalık 10 ülkeyi gösterir…
    expect(stats.countryBreakdown).toHaveLength(10);
    expect(stats.countryBreakdown[0]).toEqual({ country: "TR", count: 2 });
    // …ama duyuru segmenti / firma filtresi tüm ülkeleri alır.
    expect(stats.countryOptions).toHaveLength(12);
    expect(stats.countryOptions.map((c) => c.country).sort()).toEqual([...countries].sort());
  });
});

describe("list — expiring=30 süzgeci (arayüz testi D-146)", () => {
  it("yalnız 30 gün içinde bitecek paket üyelikler, bitişi en yakın önce; pano sayısıyla aynı", async () => {
    const { service } = rig();
    const day = 86_400_000;
    const soon = await makeCompany(prisma, { tier: "GOLD", membershipEndAt: new Date(Date.now() + 20 * day) });
    const sooner = await makeCompany(prisma, { tier: "SILVER", membershipEndAt: new Date(Date.now() + 3 * day) });
    await makeCompany(prisma, { tier: "GOLD", membershipEndAt: new Date(Date.now() + 60 * day) });
    await makeCompany(prisma, { tier: "GOLD", membershipEndAt: new Date(Date.now() - day) });
    await makeCompany(prisma, { tier: "STANDART", membershipEndAt: new Date(Date.now() + 5 * day) });
    await makeCompany(prisma, { tier: "GOLD", membershipEndAt: null });

    const res = await service.list({ expiring: "30", page: 1, pageSize: 25 });
    expect(res.items.map((r) => r.id)).toEqual([sooner.id, soon.id]);
    expect(res.total).toBe(2);
    expect((await service.stats()).expiringMembershipsCount).toBe(res.total);

    // Kademe süzgeciyle birlikte: GOLD → yalnız 20 günlük; STANDART → boş.
    const gold = await service.list({ expiring: "30", tier: "GOLD", page: 1, pageSize: 25 });
    expect(gold.items.map((r) => r.id)).toEqual([soon.id]);
    const std = await service.list({ expiring: "30", tier: "STANDART", page: 1, pageSize: 25 });
    expect(std.total).toBe(0);
  });
});

describe("announce — toplu duyuru (batch + paralel, per-firma findUnique yok)", () => {
  function announceRig() {
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
    const notifications = { pushToCompany: jest.fn().mockResolvedValue(1) };
    const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
    const audit = new AuditService(prisma as never);
    const service = new AdminCompaniesService(
      prisma as never,
      {} as never,
      email as never,
      notifications as never,
      config as never,
      audit,
      new EmailSuppressionService(prisma as never),
    );
    return { service, email, notifications };
  }

  it("sendEmail: her firmaya in-app push + e-posta; per-firma company.findUnique ÇAĞRILMAZ", async () => {
    const { service, email, notifications } = announceRig();
    // 3 firma: biri billingEmail'li, ikisi user-fallback'li.
    const a = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.company.update({
      where: { id: a.company.id },
      data: { billingEmail: "muhasebe@a.test" },
    });
    await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await makeCompanyWithUser(prisma, { tier: "GOLD" });

    const findUniqueSpy = jest.spyOn(prisma.company, "findUnique");

    const res = await service.announce(
      { subject: "Duyuru", message: "Merhaba dünya", sendEmail: true },
      "admin-1",
    );

    expect(res.targets).toBe(3);
    expect(res.delivered).toBe(3);
    // In-app push her firmaya bir kez.
    expect(notifications.pushToCompany).toHaveBeenCalledTimes(3);
    // E-posta her firmaya (billingEmail veya user fallback).
    expect(email.send).toHaveBeenCalledTimes(3);
    // N+1 kalktı: toplu findMany kullanılır, per-firma findUnique YOK.
    expect(findUniqueSpy).not.toHaveBeenCalled();
    findUniqueSpy.mockRestore();

    // Audit metadata delivered=3.
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "admin.announcement.sent" },
    });
    expect((log.metadata as { delivered: number }).delivered).toBe(3);
  });

  it("Y-08: e-postalar `bulk` öncelikle kuyruğa gider; yanıt emailQueued, bitince sent/failed audit'e yazılır", async () => {
    const { service, email } = announceRig();
    for (let i = 0; i < 3; i++) await makeCompanyWithUser(prisma, { tier: "GOLD" });
    // Biri başarısız, biri suppress (sent:false), biri gönderildi.
    email.send
      .mockRejectedValueOnce(new Error("[resend] rate_limit_exceeded: x"))
      .mockResolvedValueOnce({ emailLogId: "s", sent: false })
      .mockResolvedValueOnce({ emailLogId: "t", sent: true });

    const res = await service.announce(
      { subject: "Duyuru", message: "Merhaba", sendEmail: true },
      "admin-1",
    );
    expect(res).toMatchObject({ targets: 3, delivered: 3, emailQueued: 3 });
    // Duyuru kuyruğu diğer e-postaları bekletmesin: bulk öncelik.
    for (const call of email.send.mock.calls) {
      expect(call[0]).toMatchObject({ priority: "bulk" });
    }
    // E-posta sonucu arka planda yazılır.
    let done = null as Awaited<ReturnType<typeof prisma.auditLog.findFirst>>;
    for (let i = 0; i < 50 && !done; i++) {
      await new Promise((r) => setTimeout(r, 20));
      done = await prisma.auditLog.findFirst({
        where: { action: "admin.announcement.email_completed" },
      });
    }
    expect(done?.metadata).toMatchObject({ sent: 1, skipped: 1, failed: 1 });
  });

  it("sendEmail=false: yalnız in-app push, e-posta yok", async () => {
    const { service, email, notifications } = announceRig();
    await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await makeCompanyWithUser(prisma, { tier: "GOLD" });

    const res = await service.announce(
      { subject: "Duyuru", message: "yalnız uygulama-içi" },
      "admin-1",
    );
    expect(res.delivered).toBe(2);
    expect(notifications.pushToCompany).toHaveBeenCalledTimes(2);
    expect(email.send).not.toHaveBeenCalled();
  });
});
