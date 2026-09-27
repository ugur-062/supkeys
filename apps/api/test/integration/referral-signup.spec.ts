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
