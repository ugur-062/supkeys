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
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
  return new CompanyAuthService(
    prisma as never,
    {} as never, // jwt (acceptReferralInvites'te kullanılmaz)
    {} as never, // supabaseAuth
    { log: jest.fn() } as never, // audit (acceptReferralInvites fire-and-forget log'lar)
    email as never,
    { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
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
    const a = await makeCompany(prisma, { tier: "PAKET" });
    const aUser = await makeUser(prisma, a.id, ["SAHIP"] as never);
    const b = await makeCompany(prisma, { tier: "PAKET" });
    const bUser = await makeUser(prisma, b.id, ["SAHIP"] as never);
    const c = await makeCompany(prisma, { tier: "PAKET" }); // yeni kaydolan
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
    const a = await makeCompany(prisma, { tier: "PAKET" });
    const aUser = await makeUser(prisma, a.id, ["SAHIP"] as never);
    const c = await makeCompany(prisma, { tier: "PAKET" });
    const EMAIL = "yeni2@firma.com";
    await referral(a.id, aUser.id, EMAIL, "tok-x");

    await consume(service, EMAIL, c.id, undefined);

    const connA = await prisma.companyConnection.findFirstOrThrow({
      where: { inviterCompanyId: a.id, inviteeCompanyId: c.id },
    });
    expect(connA.status).toBe("PENDING");
  });
});
