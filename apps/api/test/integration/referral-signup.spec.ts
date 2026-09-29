/**
 * BK-CONN-1: referral signup hook token-kapsamlı bağlantı kurmalı. Aynı e-postayı
 * davet eden birden çok firma varken, KULLANILAN davet linkinin (token) firması
 * ACTIVE bağlantı olur; diğerleri PENDING İSTEK olarak kalır (yeni firma
 * listIncoming'de görür, onaylayabilir). Rıza yalnız tıklanan davet için verildi.
 */
import { prisma, truncateAll } from "./test-db";
import { makeCompany, makeUser } from "./factories";
import { CompanyAuthService } from "../../src/modules/company-auth/services/company-auth.service";

function svc() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
  return new CompanyAuthService(
    prisma as never,
    {} as never, // jwt (acceptReferralInvites'te kullanılmaz)
    {} as never, // supabaseAuth
    { log: jest.fn() } as never, // audit (acceptReferralInvites fire-and-forget log'lar)
    email as never,
    { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
    prisma as never, // bypass client (acceptReferralInvites bypass'ta)
  );
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function referral(
  inviterId: string,
  invitedById: string,
  email: string,
  token: string,
) {
  return prisma.companyReferralInvite.create({
    data: {
      inviterCompanyId: inviterId,
      email,
      invitedById,
      token,
      status: "PENDING",
    },
  });
}

// acceptReferralInvites private → cast ile çağır.
const consume = (
  service: CompanyAuthService,
  email: string,
  newCompanyId: string,
  token?: string,
) =>
  (
    service as unknown as {
      acceptReferralInvites: (
        e: string,
        id: string,
        t?: string,
      ) => Promise<void>;
    }
  ).acceptReferralInvites(email, newCompanyId, token);

describe("BK-CONN-1: referral signup token-kapsamlı bağlantı", () => {
  it("iki firma aynı e-postayı davet etti; A'nın token'ıyla kayıt → A ACTIVE, B PENDING", async () => {
    const service = svc();
    const a = await makeCompany(prisma, { tier: "GOLD" });
    const aUser = await makeUser(prisma, a.id, ["SAHIP"] as never);
    const b = await makeCompany(prisma, { tier: "GOLD" });
    const bUser = await makeUser(prisma, b.id, ["SAHIP"] as never);
    const c = await makeCompany(prisma, { tier: "GOLD" }); // yeni kaydolan
    const EMAIL = "yeni@firma.com";
    await referral(a.id, aUser.id, EMAIL, "tok-a");
    await referral(b.id, bUser.id, EMAIL, "tok-b");

    await consume(service, EMAIL, c.id, "tok-a");

    const connA = await prisma.companyConnection.findFirstOrThrow({
      where: { inviterCompanyId: a.id, inviteeCompanyId: c.id },
    });
    const connB = await prisma.companyConnection.findFirstOrThrow({
      where: { inviterCompanyId: b.id, inviteeCompanyId: c.id },
    });
    expect(connA.status).toBe("ACTIVE"); // tıklanan davet → rıza var
    expect(connB.status).toBe("PENDING"); // diğeri onay bekler (eskiden ACTIVE'di)
    // İki referral da tüketildi (ACCEPTED).
    const refs = await prisma.companyReferralInvite.findMany({
      where: { email: EMAIL },
    });
    expect(refs.every((r) => r.status === "ACCEPTED")).toBe(true);
  });

  it("token YOK (doğrudan signup) → davet PENDING istek kalır (istenmeyen bağlantı yok)", async () => {
    const service = svc();
    const a = await makeCompany(prisma, { tier: "GOLD" });
    const aUser = await makeUser(prisma, a.id, ["SAHIP"] as never);
    const c = await makeCompany(prisma, { tier: "GOLD" });
    const EMAIL = "yeni2@firma.com";
    await referral(a.id, aUser.id, EMAIL, "tok-x");

    await consume(service, EMAIL, c.id, undefined);

    const connA = await prisma.companyConnection.findFirstOrThrow({
      where: { inviterCompanyId: a.id, inviteeCompanyId: c.id },
    });
    expect(connA.status).toBe("PENDING");
  });

  it("token'la FARKLI e-postayla kayıt (info@ davetli, kişisel adresle kayıt) → davet yine kabul edilir", async () => {
    const service = svc();
    const a = await makeCompany(prisma, { tier: "GOLD" });
    const aUser = await makeUser(prisma, a.id, ["SAHIP"] as never);
    const c = await makeCompany(prisma, { tier: "GOLD" });
    await referral(a.id, aUser.id, "info@tedarikci.com", "tok-info");

    await consume(service, "ahmet@tedarikci.com", c.id, "tok-info");

    const conn = await prisma.companyConnection.findFirstOrThrow({
      where: { inviterCompanyId: a.id, inviteeCompanyId: c.id },
    });
    expect(conn.status).toBe("ACTIVE");
    const ref = await prisma.companyReferralInvite.findFirstOrThrow({
      where: { token: "tok-info" },
    });
    expect(ref.status).toBe("ACCEPTED");
    expect(ref.acceptedCompanyId).toBe(c.id);
  });

  it("son gönderimden 30 günü geçmiş davet süresi dolmuş sayılır (bağlantı kurulmaz)", async () => {
    const service = svc();
    const a = await makeCompany(prisma, { tier: "GOLD" });
    const aUser = await makeUser(prisma, a.id, ["SAHIP"] as never);
    const c = await makeCompany(prisma, { tier: "GOLD" });
    const EMAIL = "eski@firma.com";
    const inv = await referral(a.id, aUser.id, EMAIL, "tok-eski");
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    // Ham SQL: Prisma `@updatedAt`i her update'te "şimdi"ye çekebilir.
    await prisma.$executeRaw`UPDATE company_referral_invites SET "createdAt" = ${old}, "updatedAt" = ${old} WHERE id = ${inv.id}`;

    await consume(service, EMAIL, c.id, "tok-eski");

    expect(
      await prisma.companyConnection.count({
        where: { inviterCompanyId: a.id, inviteeCompanyId: c.id },
      }),
    ).toBe(0);
    const ref = await prisma.companyReferralInvite.findUniqueOrThrow({ where: { id: inv.id } });
    expect(ref.status).toBe("PENDING");
  });
});

// "DAVETİNİZ KABUL EDİLDİ" (2026-09-27): kayıt anında firmanın adı geçici
// (kurucunun adı) olduğu için e-posta kayıtta GİTMEZ; onboarding bitince
// gerçek adla ve davet edenin dilinde gider — yalnız KULLANILAN davetin
// (ACTIVE) sahibine, PENDING istek sahibine değil.
describe("davet kabul e-postası onboarding'de, gerçek firma adıyla", () => {
  it("kayıtta e-posta yok; onboarding sonrası yalnız ACTIVE davet edene, onun dilinde ve firma adıyla", async () => {
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
    const service = new CompanyAuthService(
      prisma as never,
      {} as never,
      {} as never,
      { log: jest.fn() } as never,
      email as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      prisma as never,
    );
    const a = await makeCompany(prisma, { tier: "GOLD" });
    const aUser = await makeUser(prisma, a.id, ["SAHIP"] as never);
    await prisma.companyUser.update({ where: { id: aUser.id }, data: { locale: "en" } });
    const b = await makeCompany(prisma, { tier: "GOLD" });
    const bUser = await makeUser(prisma, b.id, ["SAHIP"] as never);
    const c = await makeCompany(prisma, { tier: "STANDART" });
    const EMAIL = "kabul@firma.com";
    await referral(a.id, aUser.id, EMAIL, "tok-kabul-a");
    await referral(b.id, bUser.id, EMAIL, "tok-kabul-b");

    await consume(service, EMAIL, c.id, "tok-kabul-a");
    expect(email.send).not.toHaveBeenCalled();

    // Onboarding firmanın GERÇEK adını yazar, ardından bildirim tetiklenir.
    await prisma.company.update({ where: { id: c.id }, data: { name: "Yeni Tedarik A.Ş." } });
    await (
      service as unknown as { notifyReferralInvitersJoined: (id: string) => Promise<void> }
    ).notifyReferralInvitersJoined(c.id);
    await new Promise((r) => setTimeout(r, 20)); // gönderim fire-and-forget

    expect(email.send).toHaveBeenCalledTimes(1);
    const call = email.send.mock.calls[0][0] as {
      to: { email: string };
      locale: string;
      templateData: { data: { subject: string; paragraphs: string[] } };
    };
    expect(call.to.email).toBe(aUser.email);
    expect(call.locale).toBe("en");
    expect(call.templateData.data.subject).toBe("Your invitation was accepted");
    expect(call.templateData.data.paragraphs.join(" ")).toContain("Yeni Tedarik A.Ş.");
  });

  it("TALEP DAVETLERİ (talep × adres): adrese gelmiş açık talep davetleri yeni firmaya bağlanır; kapanmış talep bağlanmaz", async () => {
    const service = svc();
    const a = await makeCompany(prisma, { tier: "GOLD" });
    const aUser = await makeUser(prisma, a.id, ["SAHIP"] as never);
    const b = await makeCompany(prisma, { tier: "GOLD" });
    const bUser = await makeUser(prisma, b.id, ["SAHIP"] as never);
    const c = await makeCompany(prisma, { tier: "GOLD" });
    const EMAIL = "tedarik@firma.com";
    const ra = await referral(a.id, aUser.id, EMAIL, "tok-a");
    const rb = await referral(b.id, bUser.id, EMAIL, "tok-b");
    const mk = (companyId: string, userId: string, status: "OPEN" | "AWARDED") =>
      prisma.listing.create({ data: { companyId, createdById: userId, type: "ALIM", title: "t", status, visibility: "PUBLIC" } });
    const a1 = await mk(a.id, aUser.id, "OPEN");
    const a2 = await mk(a.id, aUser.id, "OPEN");
    const b1 = await mk(b.id, bUser.id, "OPEN");
    const bClosed = await mk(b.id, bUser.id, "AWARDED");
    for (const [l, r] of [[a1, ra], [a2, ra], [b1, rb], [bClosed, rb]] as const) {
      await prisma.externalListingInvite.create({
        data: { listingId: l.id, inviterCompanyId: l.companyId, referralInviteId: r.id, email: EMAIL, locale: "tr", state: "SENT" },
      });
    }

    await consume(service, EMAIL, c.id, "tok-a");

    const invited = await prisma.listingInvitation.findMany({ where: { invitedCompanyId: c.id }, select: { listingId: true } });
    expect(invited.map((i) => i.listingId).sort()).toEqual([a1.id, a2.id, b1.id].sort());
  });

  it("İPTAL EDİLMİŞ talep daveti kayıtta bağlanmaz — kuyrukta iptal, iptal öncesi SENT ve paket düşümü (derin denetim MU-16)", async () => {
    const service = svc();
    const a = await makeCompany(prisma, { tier: "GOLD" });
    const aUser = await makeUser(prisma, a.id, ["SAHIP"] as never);
    const b = await makeCompany(prisma, { tier: "GOLD" });
    const bUser = await makeUser(prisma, b.id, ["SAHIP"] as never);
    const d = await makeCompany(prisma, { tier: "GOLD" });
    const dUser = await makeUser(prisma, d.id, ["SAHIP"] as never);
    const c = await makeCompany(prisma, { tier: "GOLD" }); // yeni kaydolan
    const EMAIL = "rakip@firma.com";
    // A referral'ı iptal etti (kuyruktaki satır CANCELLED/REFERRAL_CANCELLED,
    // daha önce gitmiş satır SENT kaldı); B'nin paketi düştü; D'nin daveti geçerli.
    const ra = await prisma.companyReferralInvite.create({
      data: { inviterCompanyId: a.id, email: EMAIL, invitedById: aUser.id, token: "tok-a", status: "CANCELLED" },
    });
    const rb = await prisma.companyReferralInvite.create({
      data: { inviterCompanyId: b.id, email: EMAIL, invitedById: bUser.id, token: "tok-b", status: "CANCELLED" },
    });
    const rd = await referral(d.id, dUser.id, EMAIL, "tok-d");
    const mk = (companyId: string, userId: string) =>
      prisma.listing.create({ data: { companyId, createdById: userId, type: "ALIM", title: "t", status: "OPEN", visibility: "PRIVATE" } });
    const aQueued = await mk(a.id, aUser.id);
    const aSent = await mk(a.id, aUser.id);
    const bQueued = await mk(b.id, bUser.id);
    const dOk = await mk(d.id, dUser.id);
    const rows = [
      [aQueued, ra, "CANCELLED", "REFERRAL_CANCELLED"],
      [aSent, ra, "SENT", null],
      [bQueued, rb, "CANCELLED", "INVITER_DOWNGRADED"],
      [dOk, rd, "SENT", null],
    ] as const;
    for (const [l, r, state, cancelReason] of rows) {
      await prisma.externalListingInvite.create({
        data: { listingId: l.id, inviterCompanyId: l.companyId, referralInviteId: r.id, email: EMAIL, locale: "tr", state, cancelReason },
      });
    }

    await consume(service, EMAIL, c.id, undefined);

    const invited = await prisma.listingInvitation.findMany({ where: { invitedCompanyId: c.id }, select: { listingId: true } });
    expect(invited.map((i) => i.listingId)).toEqual([dOk.id]);
  });
});
