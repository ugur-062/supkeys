/**
 * GÜNLÜK E-POSTA PROGRAMI (2026-09-27, Faz 2) — sözleşme:
 *  - AKŞAM ÖZETİ: kuyruktaki kategori eşleşmeleri alıcının yerel 18:00'inden
 *    sonra TEK e-postada gider; kapanmış talep düşer; öğeler bir kez gönderilir.
 *  - KARŞILAMA SERİSİ: yerel 10:00'da, davranışa bağlı, firma başına günde bir.
 *  - HAFTALIK ÖZET: pazartesi yerel 10:00, görüntülenme varsa, haftada bir;
 *    uzun süredir giriş yapmayana gitmez.
 *  - TEKLİFSİZ TALEP: kapanışa 12-72 saat, teklif yok → talebi açana bir kez.
 */
import { EmailProgramsService } from "../../src/modules/email-programs/email-programs.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing } from "./factories";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function makeService() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
  const notifications = { pushToUser: jest.fn().mockResolvedValue(1) };
  const config = { get: jest.fn((k: string) => (k === "WEB_URL" ? "http://localhost:3000" : undefined)) };
  const svc = new EmailProgramsService(prisma as never, email as never, config as never, undefined, notifications as never);
  return { svc, email, notifications };
}

/**
 * Gönderimi EmailLog'a da yazan sahte (tekillik geçmişi EmailLog'dan okunur);
 * `clock.now` testin simüle ettiği an — kayıt o anla yazılır.
 */
function loggingEmail(clock: { now: Date | null } = { now: null }) {
  return {
    send: jest.fn(async (a: { to: { email: string }; context: { type: string; id: string } }) => {
      await prisma.emailLog.create({
        data: {
          template: "notification",
          toEmail: a.to.email,
          subject: "s",
          provider: "test",
          status: "SENT",
          contextType: a.context.type,
          contextId: a.context.id,
          ...(clock.now ? { queuedAt: clock.now } : {}),
        },
      });
      return { emailLogId: "t", sent: true };
    }),
  };
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("akşam özeti", () => {
  it("yerel 18:00'den önce gitmez; sonra TEK e-posta; kapanmış talep düşer; bir kez", async () => {
    const { svc, email } = makeService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const open1 = await makeListing(prisma, { companyId: buyer.company.id, createdById: buyer.user.id, status: "OPEN", title: "Cıvata", closesAt: new Date(Date.now() + 5 * DAY) });
    const open2 = await makeListing(prisma, { companyId: buyer.company.id, createdById: buyer.user.id, status: "OPEN", title: "Rulman", closesAt: new Date(Date.now() + 6 * DAY) });
    const closed = await makeListing(prisma, { companyId: buyer.company.id, createdById: buyer.user.id, status: "AWARDED" });
    const created = new Date("2026-10-07T06:00:00Z"); // İstanbul 09:00
    for (const l of [open1, open2, closed]) {
      await prisma.emailDigestItem.create({
        data: { email: "satis@firma.com", locale: "tr", companyId: seller.company.id, kind: "CATEGORY_MATCH", listingId: l.id, createdAt: created },
      });
    }
    expect(await svc.sendDigests(new Date("2026-10-07T12:00:00Z"))).toBe(0); // İstanbul 15:00
    expect(await svc.sendDigests(new Date("2026-10-07T15:30:00Z"))).toBe(1); // İstanbul 18:30
    const arg = email.send.mock.calls[0][0] as {
      context: { type: string };
      templateData: { data: { infoRows: Array<{ label: string }>; ctaUrl: string } };
    };
    expect(arg.context.type).toBe("listing_category_digest");
    expect(arg.templateData.data.infoRows.map((r) => r.label.split(" (")[0])).toEqual(["Cıvata", "Rulman"]);
    expect(arg.templateData.data.ctaUrl).toBe("http://localhost:3000/company/satis");
    expect(await prisma.emailDigestItem.count({ where: { sentAt: null } })).toBe(0);
    expect(await svc.sendDigests(new Date("2026-10-07T16:30:00Z"))).toBe(0);
  });

  it("hepsi kilitli (ücretsiz alıcı) → Silver teşviki, talep bağlantısı yok", async () => {
    const { svc, email } = makeService();
    const seller = await makeCompanyWithUser(prisma);
    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const l = await makeListing(prisma, { companyId: buyer.company.id, createdById: buyer.user.id, status: "OPEN" });
    await prisma.emailDigestItem.create({
      data: { email: "u@x.com", locale: "en", companyId: seller.company.id, kind: "CATEGORY_MATCH", listingId: l.id, locked: true, createdAt: new Date(Date.now() - 25 * HOUR) },
    });
    await svc.sendDigests(new Date());
    const data = (email.send.mock.calls[0][0] as { templateData: { data: { ctaUrl: string } } }).templateData.data;
    expect(data.ctaUrl).toBe("http://localhost:3000/en/company/plans");
  });
});

describe("davet özeti (AI üye davetleri, 2026-09-28)", () => {
  it("INVITATION öğeleri kategori özetinden AYRI e-postada gider (davet konusu, davet bağlamı)", async () => {
    const { svc, email } = makeService();
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const a = await makeListing(prisma, { companyId: buyer.company.id, createdById: buyer.user.id, status: "OPEN", title: "Cıvata" });
    const b = await makeListing(prisma, { companyId: buyer.company.id, createdById: buyer.user.id, status: "OPEN", title: "Rulman" });
    const created = new Date("2026-10-07T06:00:00Z");
    await prisma.emailDigestItem.create({
      data: { email: "satis@firma.com", locale: "tr", companyId: seller.company.id, kind: "INVITATION", listingId: a.id, createdAt: created },
    });
    await prisma.emailDigestItem.create({
      data: { email: "satis@firma.com", locale: "tr", companyId: seller.company.id, kind: "CATEGORY_MATCH", listingId: b.id, createdAt: created },
    });
    expect(await svc.sendDigests(new Date("2026-10-07T15:30:00Z"))).toBe(2);
    const calls = email.send.mock.calls.map((c) => c[0] as { subject: string; context: { type: string } });
    const invite = calls.find((c) => c.context.type === "listing_invitation_digest")!;
    expect(invite.subject).toBe("Bugün 1 talebe daha davet edildiniz");
    expect(calls.map((c) => c.context.type).sort()).toEqual(["listing_category_digest", "listing_invitation_digest"]);
  });
});

describe("karşılama serisi", () => {
  it("yerel 10:00'da profil adımı; aynı gün ikinci ipucu yok; tamamlanan adım atlanır", async () => {
    const clock = { now: null as Date | null };
    const email = loggingEmail(clock);
    const svc = new EmailProgramsService(prisma as never, email as never, { get: () => "http://localhost:3000" } as never);
    const c = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.company.update({
      where: { id: c.company.id },
      data: { onboardingCompletedAt: new Date("2026-10-05T07:00:00Z"), ownerUserId: c.user.id, aboutText: null },
    });
    await prisma.companyUser.update({ where: { id: c.user.id }, data: { lastLoginAt: new Date("2026-10-06T07:00:00Z") } });
    const tenAm = new Date("2026-10-07T07:15:00Z"); // İstanbul 10:15
    expect(await svc.sendLifecycle(new Date("2026-10-07T05:00:00Z"))).toBe(0); // 08:00 — pencere dışı
    clock.now = tenAm;
    expect(await svc.sendLifecycle(tenAm)).toBe(1);
    expect(email.send.mock.calls[0][0].context).toEqual({ type: "lifecycle_profile", id: c.company.id });
    expect(await svc.sendLifecycle(new Date(tenAm.getTime() + 30 * 60_000))).toBe(0);
    await prisma.company.update({
      where: { id: c.company.id },
      data: { aboutText: "Endüstriyel bağlantı elemanları üreten, otuz yıllık deneyimli bir aile şirketiyiz." },
    });
    // Ertesi gün kayıttan bu yana 3 gün doldu: profil yazıldığı için profil
    // adımı atlanır, sıradaki ilk ürün adımı gider.
    clock.now = new Date(tenAm.getTime() + DAY);
    expect(await svc.sendLifecycle(new Date(tenAm.getTime() + DAY))).toBe(1);
    expect(email.send.mock.calls[1][0].context.type).toBe("lifecycle_first_product");
  });

  it("tercih kapalıysa (lifecycle) gitmez", async () => {
    const { svc, email } = makeService();
    const c = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.company.update({
      where: { id: c.company.id },
      data: { onboardingCompletedAt: new Date("2026-10-05T07:00:00Z"), ownerUserId: c.user.id },
    });
    await prisma.companyUser.update({
      where: { id: c.user.id },
      data: { notificationPrefs: { lifecycle: false }, lastLoginAt: new Date("2026-10-06T07:00:00Z") },
    });
    expect(await svc.sendLifecycle(new Date("2026-10-07T07:15:00Z"))).toBe(0);
    expect(email.send).not.toHaveBeenCalled();
  });
});

describe("haftalık görünürlük özeti", () => {
  it("pazartesi yerel 10:00, görüntülenme varsa, haftada bir; 200 gün giriş yoksa gitmez", async () => {
    const monday = new Date("2026-10-05T07:10:00Z"); // Pazartesi İstanbul 10:10
    const email = loggingEmail({ now: monday });
    const svc = new EmailProgramsService(prisma as never, email as never, { get: () => "http://localhost:3000" } as never);
    const c = await makeCompanyWithUser(prisma, { country: "TR" });
    await prisma.company.update({ where: { id: c.company.id }, data: { ownerUserId: c.user.id } });
    await prisma.companyUser.update({ where: { id: c.user.id }, data: { lastLoginAt: new Date(monday.getTime() - 2 * DAY) } });
    for (let i = 0; i < 3; i++) {
      await prisma.companyView.create({
        data: { targetCompanyId: c.company.id, surface: "PUBLIC", dedupeKey: `k${i}`, viewedAt: new Date(monday.getTime() - (i + 1) * DAY) },
      });
    }
    expect(await svc.sendWeeklySummaries(new Date(monday.getTime() + DAY))).toBe(0); // salı
    expect(await svc.sendWeeklySummaries(monday)).toBe(1);
    expect(await svc.sendWeeklySummaries(new Date(monday.getTime() + 20 * 60_000))).toBe(0);
    await prisma.emailLog.deleteMany({});
    await prisma.companyUser.update({ where: { id: c.user.id }, data: { lastLoginAt: new Date(monday.getTime() - 200 * DAY) } });
    expect(await svc.sendWeeklySummaries(monday)).toBe(0);
  });
});

describe("teklifsiz talep hatırlatması", () => {
  it("kapanışa 12-72 saat + teklif yok → talebi açana e-posta + bildirim, BİR kez", async () => {
    const email = loggingEmail();
    const notifications = { pushToUser: jest.fn(async (userId: string, p: { type: string; listingId: string }) => {
      const u = await prisma.companyUser.findUniqueOrThrow({ where: { id: userId }, select: { companyId: true } });
      await prisma.notification.create({
        data: { companyUserId: userId, companyId: u.companyId, type: p.type, title: "t", body: "b", listingId: p.listingId },
      });
      return 1;
    }) };
    const svc = new EmailProgramsService(prisma as never, email as never, { get: () => "http://localhost:3000" } as never, undefined, notifications as never);
    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const l = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "OPEN",
      publishedAt: new Date(Date.now() - 5 * DAY),
      closesAt: new Date(Date.now() + 30 * HOUR),
      aiDiscovery: true,
    });
    const far = await makeListing(prisma, {
      companyId: buyer.company.id,
      createdById: buyer.user.id,
      status: "OPEN",
      publishedAt: new Date(),
      closesAt: new Date(Date.now() + 10 * DAY),
    });
    expect(await svc.sendZeroBidReminders(new Date())).toBe(1);
    const arg = email.send.mock.calls[0][0] as { context: { id: string }; templateData: { data: { ctaUrl: string } } };
    expect(arg.context.id).toBe(l.id);
    expect(arg.templateData.data.ctaUrl).toBe(`http://localhost:3000/company/ilan/${l.id}?ai-davet=1`);
    expect(notifications.pushToUser).toHaveBeenCalledTimes(1);
    expect(await svc.sendZeroBidReminders(new Date())).toBe(0);
    expect(notifications.pushToUser).toHaveBeenCalledTimes(1);
    void far;
  });
});
