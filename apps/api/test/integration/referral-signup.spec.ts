/**
 * BK-CONN-1: referral signup hook token-kapsamlı bağlantı kurmalı. Aynı e-postayı
 * davet eden birden çok firma varken, KULLANILAN davet linkinin (token) firması
 * ACTIVE bağlantı olur; diğerleri PENDING İSTEK olarak kalır (yeni firma
 * listIncoming'de görür, onaylayabilir). Rıza yalnız tıklanan davet için verildi.
 */
import { prisma, truncateAll } from "./test-db";
import { makeCompany, makeUser } from "./factories";
import { extractCode, makeAuthService } from "./make-auth-service";
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
type Binder = {
  acceptReferralInvites: (
    match: { token: string } | { email: string },
    id: string,
    actorEmail: string,
  ) => Promise<void>;
};

/** Sign-up stage: only the invitation of the referral token that was used. */
const bindToken = (
  service: CompanyAuthService,
  token: string,
  newCompanyId: string,
  signupEmail: string,
) => (service as unknown as Binder).acceptReferralInvites({ token }, newCompanyId, signupEmail);

/** Verification stage: the invitations sent to the address that was proven. */
const bindProvenEmail = (service: CompanyAuthService, email: string, newCompanyId: string) =>
  (service as unknown as Binder).acceptReferralInvites({ email }, newCompanyId, email);

/**
 * Both stages in the order the real flow runs them (code-auth-1): the token
 * at sign-up, the address once it is verified. The rule set below is about the
 * end state, which the split must not change.
 */
async function consume(
  service: CompanyAuthService,
  email: string,
  newCompanyId: string,
  token?: string,
) {
  if (token) await bindToken(service, token, newCompanyId, email);
  await bindProvenEmail(service, email, newCompanyId);
}

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

  it("AI-1: talep özele çevrildiği için gönderilmeden DÜŞEN otomatik davet (AUTO_INVITE_OFF) kayıtta bağlanmaz; aynı alıcının gitmiş daveti bağlanır", async () => {
    // Yayın sonrası keşif turu adresi iki talebe kuyruğa aldı. Alıcı ilkini
    // "yalnız seçtiğim firmalar"a çevirdi → dağıtıcı satırı e-posta gitmeden
    // düşürdü. Bağlantı jetonu (referral) ise GEÇERLİ: ikinci talebin daveti
    // gitti. Adres kaydolunca özel talebi GÖRMEMELİ — hiç davet edilmedi.
    const service = svc();
    const a = await makeCompany(prisma, { tier: "GOLD" });
    const aUser = await makeUser(prisma, a.id, ["SAHIP"] as never);
    const c = await makeCompany(prisma, { tier: "GOLD" }); // yeni kaydolan
    const EMAIL = "bulunan@firma.com";
    const ra = await referral(a.id, aUser.id, EMAIL, "tok-a");
    const nowPrivate = await prisma.listing.create({
      data: { companyId: a.id, createdById: aUser.id, type: "ALIM", title: "t", status: "OPEN", visibility: "PRIVATE" },
    });
    const stillPublic = await prisma.listing.create({
      data: { companyId: a.id, createdById: aUser.id, type: "ALIM", title: "t", status: "OPEN", visibility: "PUBLIC", aiDiscovery: true },
    });
    await prisma.externalListingInvite.create({
      data: {
        listingId: nowPrivate.id,
        inviterCompanyId: a.id,
        referralInviteId: ra.id,
        email: EMAIL,
        locale: "tr",
        source: "AI_AUTO",
        state: "CANCELLED",
        cancelReason: "AUTO_INVITE_OFF",
      },
    });
    await prisma.externalListingInvite.create({
      data: { listingId: stillPublic.id, inviterCompanyId: a.id, referralInviteId: ra.id, email: EMAIL, locale: "tr", source: "AI_AUTO", state: "SENT" },
    });

    await consume(service, EMAIL, c.id, "tok-a");

    const invited = await prisma.listingInvitation.findMany({ where: { invitedCompanyId: c.id }, select: { listingId: true } });
    expect(invited.map((i) => i.listingId)).toEqual([stillPublic.id]);
  });

  it("A-1: e-postası HİÇ gitmemiş otomatik davet, talep artık özelse ya da kutu kapalıysa kayıtta BAĞLANMAZ — satır kuyrukta beklese de, başka nedenle (FREQUENCY, PAUSED, ALLOWLIST) düşmüş olsa da", async () => {
    // İkinci gözden geçirmenin senaryosu: adres iki gün önce başka bir alıcıdan
    // davet aldı; A'nın yayın sonrası turu adresi kuyruğa aldı, dağıtıcı satırı
    // FREQUENCY ile düşürdü (e-posta hiç gitmedi, A'nın ekranı "gönderilmedi"
    // diyor). A sonra talebi "yalnız seçtiğim firmalar"a çevirdi. Dağıtıcı
    // yalnız KUYRUKTAKİ satırı `AUTO_INVITE_OFF` yapar — bu satır eski nedeniyle
    // kalır. Adres başka alıcının bağlantısıyla kaydolup adresini doğrulayınca
    // A'nın ÖZEL talebine davetli oluyor, talebi görüp teklif verebiliyordu.
    const service = svc();
    const a = await makeCompany(prisma, { tier: "GOLD" });
    const aUser = await makeUser(prisma, a.id, ["SAHIP"] as never);
    const c = await makeCompany(prisma, { tier: "GOLD" }); // yeni kaydolan
    const EMAIL = "bulunan@firma.com";
    const ra = await referral(a.id, aUser.id, EMAIL, "tok-a");
    type Row = {
      visibility: "PUBLIC" | "CONNECTIONS" | "PRIVATE";
      aiDiscovery: boolean;
      source: "MANUAL" | "AI_FORM" | "AI_AUTO";
      state: "QUEUED" | "SENT" | "CANCELLED";
      cancelReason?: string;
      sent?: boolean;
      bound: boolean;
    };
    const rows: Record<string, Row> = {
      // Hiç gitmemiş otomatik davet + talep özel / kutu kapalı → BAĞLANMAZ.
      "özel, FREQUENCY ile düşmüş": { visibility: "PRIVATE", aiDiscovery: false, source: "AI_AUTO", state: "CANCELLED", cancelReason: "FREQUENCY", bound: false },
      "özel, PAUSED ile düşmüş": { visibility: "PRIVATE", aiDiscovery: false, source: "AI_AUTO", state: "CANCELLED", cancelReason: "PAUSED", bound: false },
      "özel, ALLOWLIST ile düşmüş": { visibility: "PRIVATE", aiDiscovery: true, source: "AI_AUTO", state: "CANCELLED", cancelReason: "ALLOWLIST", bound: false },
      "özel, hâlâ kuyrukta (dağıtıcı dakikası koşmadı)": { visibility: "PRIVATE", aiDiscovery: false, source: "AI_AUTO", state: "QUEUED", bound: false },
      "herkese açık ama kutu kapalı, hâlâ kuyrukta": { visibility: "PUBLIC", aiDiscovery: false, source: "AI_AUTO", state: "QUEUED", bound: false },
      // DENETİM — bağlanmaya devam edenler.
      "özel, e-postası GERÇEKTEN gitmiş otomatik davet": { visibility: "PRIVATE", aiDiscovery: false, source: "AI_AUTO", state: "SENT", sent: true, bound: true },
      "özel, alıcının ELLE yazdığı adres": { visibility: "PRIVATE", aiDiscovery: false, source: "MANUAL", state: "QUEUED", bound: true },
      "özel, alıcının pencereden SEÇTİĞİ adres": { visibility: "PRIVATE", aiDiscovery: false, source: "AI_FORM", state: "CANCELLED", cancelReason: "FREQUENCY", bound: true },
      "herkese açık + kutu açık, FREQUENCY ile düşmüş": { visibility: "PUBLIC", aiDiscovery: true, source: "AI_AUTO", state: "CANCELLED", cancelReason: "FREQUENCY", bound: true },
      "bağlantılara açık + kutu açık, kuyrukta": { visibility: "CONNECTIONS", aiDiscovery: true, source: "AI_AUTO", state: "QUEUED", bound: true },
    };
    const listingOf: Record<string, string> = {};
    for (const [name, r] of Object.entries(rows)) {
      const l = await prisma.listing.create({
        data: { companyId: a.id, createdById: aUser.id, type: "ALIM", title: name, status: "OPEN", visibility: r.visibility, aiDiscovery: r.aiDiscovery },
      });
      listingOf[name] = l.id;
      await prisma.externalListingInvite.create({
        data: {
          listingId: l.id,
          inviterCompanyId: a.id,
          referralInviteId: ra.id,
          email: EMAIL,
          locale: "tr",
          source: r.source,
          state: r.state,
          cancelReason: r.cancelReason ?? null,
          sentAt: r.sent ? new Date(Date.now() - 24 * 3_600_000) : null,
        },
      });
    }

    // Kayıt başka bir yoldan (jeton yok); adres doğrulanınca adrese gelmiş davetler bağlanır.
    await consume(service, EMAIL, c.id, undefined);

    const invited = new Set(
      (await prisma.listingInvitation.findMany({ where: { invitedCompanyId: c.id }, select: { listingId: true } })).map((i) => i.listingId),
    );
    const got = Object.fromEntries(Object.keys(rows).map((name) => [name, invited.has(listingOf[name]!)]));
    expect(got).toEqual(Object.fromEntries(Object.entries(rows).map(([name, r]) => [name, r.bound])));
  });
});

/**
 * Arayuz testi 2026-10 code-auth-1: the sign-up address is NOT proven, so
 * nothing is bound by address at sign-up (only the referral token that was
 * used). Invitations sent to an address are bound when that address is
 * verified, with the address the account has at that moment. Before the fix
 * an unverified sign-up with someone else's address took that address's
 * invitations and kept them after "change e-mail".
 */
describe("code-auth-1: invitations are bound by address only once the address is proven", () => {
  const signupDto = (email: string, over: Record<string, unknown> = {}) => ({
    firstName: "Ada",
    lastName: "Yılmaz",
    email,
    phone: "+90 555 111 22 33",
    password: "Guclu!Parola9",
    termsAccepted: true,
    mediationAccepted: true,
    kvkkAccepted: true,
    ...over,
  });

  /** A buyer with a pending referral invitation + a request invitation for `email`. */
  async function buyerInviting(email: string, token: string) {
    const company = await makeCompany(prisma, { tier: "GOLD" });
    const user = await makeUser(prisma, company.id, ["SAHIP"] as never);
    const invite = await referral(company.id, user.id, email, token);
    const listing = await prisma.listing.create({
      data: { companyId: company.id, createdById: user.id, type: "ALIM", title: "t", status: "OPEN", visibility: "PRIVATE" },
    });
    await prisma.externalListingInvite.create({
      data: {
        listingId: listing.id,
        inviterCompanyId: company.id,
        referralInviteId: invite.id,
        email,
        locale: "tr",
        state: "SENT",
      },
    });
    return { company, user, invite, listing };
  }

  const companyOf = async (email: string) =>
    (await prisma.companyUser.findUniqueOrThrow({ where: { email }, select: { companyId: true } })).companyId;

  async function boundTo(companyId: string) {
    const [connections, listingInvitations, accepted] = await Promise.all([
      prisma.companyConnection.findMany({
        where: { inviteeCompanyId: companyId },
        select: { inviterCompanyId: true, status: true },
      }),
      prisma.listingInvitation.findMany({ where: { invitedCompanyId: companyId }, select: { listingId: true } }),
      prisma.companyReferralInvite.findMany({ where: { acceptedCompanyId: companyId }, select: { id: true } }),
    ]);
    return {
      connections,
      listings: listingInvitations.map((l) => l.listingId),
      acceptedInvites: accepted.map((a) => a.id),
    };
  }
  const NOTHING = { connections: [], listings: [], acceptedInvites: [] };

  it("the finding: sign-up with someone else's address, then change e-mail and verify -> the address's invitations are NOT taken", async () => {
    const { service, email } = makeAuthService();
    const X = "tedarikci@hedef.com";
    const Y = "saldirgan@baska.com";
    const buyer = await buyerInviting(X, "tok-x");

    await service.signup(signupDto(X) as never);
    const companyId = await companyOf(X);
    expect(await boundTo(companyId)).toEqual(NOTHING); // X is not proven

    await service.changeSignupEmail({ email: X, password: "Guclu!Parola9", newEmail: Y });
    const verified = (await service.verifyEmail(Y, extractCode(email))) as { token?: string };
    expect(verified.token).toBeTruthy();

    expect(await boundTo(companyId)).toEqual(NOTHING);
    const invite = await prisma.companyReferralInvite.findUniqueOrThrow({ where: { id: buyer.invite.id } });
    expect(invite.status).toBe("PENDING"); // still waiting for the real owner of X
    expect(invite.acceptedCompanyId).toBeNull();
  });

  it("a code mailed to the attacker's own address cannot verify (and bind) the address the account was changed to", async () => {
    const { service, email } = makeAuthService();
    const OWN = "saldirgan@kendi.com";
    const X = "tedarikci@hedef2.com";
    const buyer = await buyerInviting(X, "tok-x2");

    await service.signup(signupDto(OWN) as never);
    const companyId = await companyOf(OWN);
    // Hourly cap reached: change-email cannot issue a new code any more. The
    // last code (read in the attacker's mailbox) used to stay valid.
    for (let i = 0; i < 4; i++) await service.resendEmailCode(OWN);
    const ownCode = extractCode(email);
    await service.changeSignupEmail({ email: OWN, password: "Guclu!Parola9", newEmail: X });

    await expect(service.verifyEmail(X, ownCode)).rejects.toThrow();

    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: X } });
    expect(user.emailVerifiedAt).toBeNull();
    expect(await boundTo(companyId)).toEqual(NOTHING);
    const invite = await prisma.companyReferralInvite.findUniqueOrThrow({ where: { id: buyer.invite.id } });
    expect(invite.status).toBe("PENDING");
  });

  it("typo corrected with change e-mail: the CORRECT address gets its invitations at verification, the typo address gets none", async () => {
    const { service, email } = makeAuthService();
    const TYPO = "ayse@frima.com";
    const REAL = "ayse@firma.com";
    const buyer = await buyerInviting(REAL, "tok-real");
    const otherBuyer = await buyerInviting(TYPO, "tok-typo"); // somebody else's address

    await service.signup(signupDto(TYPO) as never);
    const companyId = await companyOf(TYPO);
    await service.changeSignupEmail({ email: TYPO, password: "Guclu!Parola9", newEmail: REAL });
    expect(await boundTo(companyId)).toEqual(NOTHING); // nothing before the code is entered

    await service.verifyEmail(REAL, extractCode(email));

    expect(await boundTo(companyId)).toEqual({
      // No token was used -> a request the new firm can accept, not an active connection.
      connections: [{ inviterCompanyId: buyer.company.id, status: "PENDING" }],
      listings: [buyer.listing.id],
      acceptedInvites: [buyer.invite.id],
    });
    const typoInvite = await prisma.companyReferralInvite.findUniqueOrThrow({ where: { id: otherBuyer.invite.id } });
    expect(typoInvite.status).toBe("PENDING");
  });

  it("plain sign-up: nothing is bound until the code is verified, then the address's invitations are", async () => {
    const { service, email } = makeAuthService();
    const X = "satis@uretici.com";
    const buyer = await buyerInviting(X, "tok-plain");

    await service.signup(signupDto(X) as never);
    const companyId = await companyOf(X);
    expect(await boundTo(companyId)).toEqual(NOTHING);

    // A wrong code proves nothing.
    const code = extractCode(email);
    await expect(service.verifyEmail(X, code === "000000" ? "111111" : "000000")).rejects.toThrow();
    expect(await boundTo(companyId)).toEqual(NOTHING);

    await service.verifyEmail(X, code);
    expect(await boundTo(companyId)).toEqual({
      connections: [{ inviterCompanyId: buyer.company.id, status: "PENDING" }],
      listings: [buyer.listing.id],
      acceptedInvites: [buyer.invite.id],
    });
  });

  it("referral token: its invitation is bound at sign-up (also for a different address); other invitations to the sign-up address wait for verification", async () => {
    const { service, email } = makeAuthService();
    const INFO = "info@tedarikci.com";
    const PERSONAL = "ahmet@tedarikci.com";
    const viaToken = await buyerInviting(INFO, "tok-info-2");
    const byAddress = await buyerInviting(PERSONAL, "tok-personal");
    const unrelated = await buyerInviting("baskasi@firma.com", "tok-unrelated");

    await service.signup(signupDto(PERSONAL, { referralToken: "tok-info-2" }) as never);
    const companyId = await companyOf(PERSONAL);
    expect(await boundTo(companyId)).toEqual({
      connections: [{ inviterCompanyId: viaToken.company.id, status: "ACTIVE" }],
      listings: [viaToken.listing.id],
      acceptedInvites: [viaToken.invite.id],
    });

    await service.verifyEmail(PERSONAL, extractCode(email));
    const after = await boundTo(companyId);
    expect(after.connections).toHaveLength(2);
    expect(after.connections).toEqual(
      expect.arrayContaining([
        { inviterCompanyId: viaToken.company.id, status: "ACTIVE" },
        { inviterCompanyId: byAddress.company.id, status: "PENDING" },
      ]),
    );
    expect(after.listings.sort()).toEqual([viaToken.listing.id, byAddress.listing.id].sort());
    expect(after.acceptedInvites.sort()).toEqual([viaToken.invite.id, byAddress.invite.id].sort());
    const other = await prisma.companyReferralInvite.findUniqueOrThrow({ where: { id: unrelated.invite.id } });
    expect(other.status).toBe("PENDING");
  });

  it("sign-up stage alone never matches by address (two firms invited the same address, one token used)", async () => {
    const service = svc();
    const EMAIL = "ortak@firma.com";
    const withToken = await buyerInviting(EMAIL, "tok-used");
    const sameAddress = await buyerInviting(EMAIL, "tok-other");
    const c = await makeCompany(prisma, { tier: "STANDART" });

    await bindToken(service, "tok-used", c.id, EMAIL);

    expect(await boundTo(c.id)).toEqual({
      connections: [{ inviterCompanyId: withToken.company.id, status: "ACTIVE" }],
      listings: [withToken.listing.id],
      acceptedInvites: [withToken.invite.id],
    });
    const waiting = await prisma.companyReferralInvite.findUniqueOrThrow({ where: { id: sameAddress.invite.id } });
    expect(waiting.status).toBe("PENDING");
  });

  it("an unknown token binds nothing (and never falls back to every pending invitation)", async () => {
    const { service } = makeAuthService();
    const X = "yeni@uretici.com";
    await buyerInviting(X, "tok-real-one");
    await buyerInviting("baska@firma.com", "tok-someone-else");

    await service.signup(signupDto(X, { referralToken: "tok-does-not-exist" }) as never);

    expect(await boundTo(await companyOf(X))).toEqual(NOTHING);
    expect(await prisma.companyReferralInvite.count({ where: { status: "PENDING" } })).toBe(2);
  });

  it("an account that is already verified does not bind again through verify-email", async () => {
    const { service, email } = makeAuthService();
    const X = "dogrulanmis@firma.com";
    await service.signup(signupDto(X) as never);
    const companyId = await companyOf(X);
    await service.verifyEmail(X, extractCode(email));
    const later = await buyerInviting(X, "tok-later"); // invited after the account was verified

    await expect(service.verifyEmail(X, "000000")).resolves.toEqual({ alreadyVerified: true });

    expect(await boundTo(companyId)).toEqual(NOTHING);
    const invite = await prisma.companyReferralInvite.findUniqueOrThrow({ where: { id: later.invite.id } });
    expect(invite.status).toBe("PENDING");
  });

  it("a binding error at verification does not cost the user the session", async () => {
    const { service, email } = makeAuthService();
    const X = "hata@firma.com";
    await buyerInviting(X, "tok-err");
    await service.signup(signupDto(X) as never);
    const spy = jest
      .spyOn(service as unknown as Binder, "acceptReferralInvites")
      .mockRejectedValueOnce(new Error("db down"));

    const verified = (await service.verifyEmail(X, extractCode(email))) as { token?: string };

    expect(spy).toHaveBeenCalledWith({ email: X }, await companyOf(X), X);
    expect(verified.token).toBeTruthy();
    spy.mockRestore();
  });
});
