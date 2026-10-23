/**
 * ONE RULE, four findings (arayuz testi 2026-10, authsec-1 ... authsec-4):
 *
 *  1. An account whose e-mail is NOT verified is never treated as the owner
 *     of that address - it is not "registered" for any invitation path
 *     (connection invite by e-mail: authsec-1; AI supplier discovery:
 *     authsec-4).
 *  2. Every secret mailed to an address (e-mail codes, password-reset and
 *     account-setup links) stops working when the account leaves that address
 *     (admin e-mail change: authsec-2; "change e-mail" at sign-up: authsec-3).
 *
 * Real services on the test database; only Supabase and the mail sender are
 * fakes.
 */
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { AdminCompanyUsersService } from "../../src/modules/admin-companies/admin-company-users.service";
import {
  SupplierDiscoveryService,
  type ExternalCandidate,
} from "../../src/modules/ai/supplier-discovery/supplier-discovery.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { PasswordResetService } from "../../src/modules/password-reset/password-reset.service";
import { makeCompanyWithUser } from "./factories";
import { extractCode, makeAuthService } from "./make-auth-service";
import { prisma, truncateAll } from "./test-db";

const PASSWORD = "Guclu!Parola9";

const signupDto = (email: string) =>
  ({
    firstName: "Ada",
    lastName: "Yilmaz",
    email,
    phone: "+90 555 111 22 33",
    password: PASSWORD,
    termsAccepted: true,
    mediationAccepted: true,
    kvkkAccepted: true,
  }) as never;

/** Connection service with a mail sender of its own (not the auth one). */
function makeConnections() {
  const email = { send: jest.fn(async () => ({ emailLogId: "t", sent: true })) };
  const service = new CompanyConnectionsService(
    prisma as never,
    prisma as never,
    { blockedCompanyIds: jest.fn().mockResolvedValue([]) } as never,
    email as never,
    { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
    {
      pushToCompany: jest.fn().mockResolvedValue(1),
      pushToUser: jest.fn().mockResolvedValue(1),
    } as never,
    new AuditService(prisma as never),
  );
  return { service, email };
}

type ResetDb = ConstructorParameters<typeof PasswordResetService>[0];

/** Real password-reset service; `db` lets a test put a step between its queries. */
function makeReset(db: unknown = prisma) {
  const email = { send: jest.fn(async () => ({ emailLogId: "t", sent: true })) };
  const supabase = { updatePassword: jest.fn(async () => undefined) };
  const service = new PasswordResetService(
    db as ResetDb,
    email as never,
    { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
    supabase as never,
  );
  return { service, email, supabase };
}

/** What the last `send` call of a fake mail sender was given. */
function lastMail(email: { send: jest.Mock }) {
  const mail = email.send.mock.calls.at(-1)?.[0] as
    | {
        to: { email: string };
        templateData: { template: string; data: { resetUrl?: string; ctaUrl?: string } };
      }
    | undefined;
  if (!mail) throw new Error("no mail was sent");
  return mail;
}

/** Recipient + token of the last password link that was mailed (reset or setup). */
function lastLink(email: { send: jest.Mock }) {
  const call = lastMail(email);
  const url = call.templateData.data.resetUrl ?? call.templateData.data.ctaUrl;
  const token = new URL(url!).searchParams.get("token");
  if (!token) throw new Error("no token in the mailed link");
  return { to: call.to.email, token };
}

function makeAdmin(
  auth: ReturnType<typeof makeAuthService>,
  reset: PasswordResetService,
  db: unknown = prisma,
) {
  return new AdminCompanyUsersService(
    db as never,
    new AuditService(prisma as never),
    reset,
    auth.service,
    auth.supabaseAuth as never,
  );
}

/**
 * The password-reset service's database, with one step run right after it has
 * READ the account (and its address) and before it writes the link: the place
 * where a concurrent address change lands.
 */
function resetDbWithStepAfterAccountRead(step: () => Promise<unknown>) {
  let done = false;
  return {
    passwordResetToken: prisma.passwordResetToken,
    $queryRaw: (...args: unknown[]) =>
      (prisma.$queryRaw as unknown as (...a: unknown[]) => Promise<unknown>)(...args),
    companyUser: {
      findFirst: async (args: never) => {
        const row = await prisma.companyUser.findFirst(args);
        if (!done) {
          done = true;
          await step();
        }
        return row;
      },
      update: (args: never) => prisma.companyUser.update(args),
    },
  };
}

beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("authsec-1: a connection invite by e-mail does not go to an unverified sign-up", () => {
  it("the finding: sign-up with a supplier's address, buyer invites that address, account moves to an own mailbox and verifies -> nothing is bound", async () => {
    const victim = "satis@gercek-tedarikci.com";
    const own = "mallory@baska-kutu.com";
    const auth = makeAuthService();
    await auth.service.signup(signupDto(victim));
    const attacker = await prisma.companyUser.findUniqueOrThrow({ where: { email: victim } });
    expect(attacker.emailVerifiedAt).toBeNull();

    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const { service, email } = makeConnections();
    const res = await service.inviteByEmail(buyer.auth, victim);

    // Not a request to the unproven account: an invitation mailed TO THE ADDRESS.
    expect(res).toMatchObject({ kind: "invited", email: victim, delivery: "SENT" });
    expect(res).not.toHaveProperty("targetName");
    expect(await prisma.companyConnection.count()).toBe(0);
    expect(
      await prisma.companyReferralInvite.findMany({
        where: { inviterCompanyId: buyer.company.id },
        select: { email: true, status: true },
      }),
    ).toEqual([{ email: victim, status: "PENDING" }]);
    const mail = lastMail(email);
    expect(mail.to.email).toBe(victim);
    expect(mail.templateData.template).toBe("referral_invite");

    // The account moves to a mailbox of its own and verifies THERE.
    await auth.service.changeSignupEmail({ email: victim, password: PASSWORD, newEmail: own });
    const login = await auth.service.verifyEmail(own, extractCode(auth.email));
    expect(login).toHaveProperty("token");

    expect(await service.listIncoming(attacker.companyId)).toEqual([]);
    expect(await prisma.companyConnection.count()).toBe(0);
    expect(
      await prisma.companyReferralInvite.findFirstOrThrow({ where: { inviterCompanyId: buyer.company.id } }),
    ).toMatchObject({ status: "PENDING", acceptedCompanyId: null });
  });

  it("the honest case: the invitation waits for the address and becomes a PENDING request once that address is verified", async () => {
    const address = "satis@yeni-tedarikci.com";
    const auth = makeAuthService();
    await auth.service.signup(signupDto(address));
    const account = await prisma.companyUser.findUniqueOrThrow({ where: { email: address } });

    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const { service } = makeConnections();
    await expect(service.inviteByEmail(buyer.auth, address)).resolves.toMatchObject({ kind: "invited" });
    expect(await service.listIncoming(account.companyId)).toEqual([]);

    await auth.service.verifyEmail(address, extractCode(auth.email));

    expect(
      await prisma.companyConnection.findMany({
        select: { inviterCompanyId: true, inviteeCompanyId: true, status: true, origin: true },
      }),
    ).toEqual([
      {
        inviterCompanyId: buyer.company.id,
        inviteeCompanyId: account.companyId,
        status: "PENDING",
        origin: "INVITE",
      },
    ]);
    expect(await service.listIncoming(account.companyId)).toHaveLength(1);
    expect(
      await prisma.companyReferralInvite.findFirstOrThrow({ where: { inviterCompanyId: buyer.company.id } }),
    ).toMatchObject({ status: "ACCEPTED", acceptedCompanyId: account.companyId });

    // From now on the address IS registered: a second buyer gets a direct request.
    const second = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await expect(service.inviteByEmail(second.auth, address)).resolves.toMatchObject({ kind: "request" });
  });

  it("batch invite: verified address -> request, unverified sign-up -> invitation by e-mail", async () => {
    const unverified = "bekleyen@tedarikci.com";
    const auth = makeAuthService();
    await auth.service.signup(signupDto(unverified));
    const member = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.companyUser.update({ where: { id: member.user.id }, data: { emailVerifiedAt: new Date() } });

    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const { service } = makeConnections();
    const res = await service.inviteByEmailBatch(buyer.auth, [member.user.email, unverified]);

    expect(res.results.map((r) => [r.email, r.status])).toEqual([
      [member.user.email, "request"],
      [unverified, "invited"],
    ]);
    expect(
      await prisma.companyConnection.findMany({ select: { inviteeCompanyId: true, status: true } }),
    ).toEqual([{ inviteeCompanyId: member.company.id, status: "PENDING" }]);
  });
});

describe("authsec-4: AI supplier discovery does not count an unverified sign-up as a member", () => {
  const candidate = (name: string, email: string, website: string | null = null): ExternalCandidate => ({
    name,
    city: null,
    country: "TR",
    website,
    email,
    reason: "r",
    matchedItems: [1],
    scope: null,
  });

  function makeDiscovery() {
    const discovery = new SupplierDiscoveryService(prisma as never, {} as never, prisma as never);
    discovery.mxCheck = async () => true;
    return discovery;
  }

  it("a candidate whose address has an unverified sign-up stays in the list as an e-mail candidate", async () => {
    const taken = "info@gercek-tedarikci.com";
    const auth = makeAuthService();
    await auth.service.signup(signupDto(taken));
    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const discovery = makeDiscovery();
    const list = [candidate("Gercek Tedarikci", taken), candidate("Baska Firma", "info@baska-firma.com")];

    const out = await discovery.annotate(buyer.company.id, null, list);

    expect(out.map((c) => [c.email, c.status, c.memberCompanyId])).toEqual([
      [taken, "SUGGESTED", null],
      ["info@baska-firma.com", "SUGGESTED", null],
    ]);

    // Contrast (unchanged rule): once the address is PROVEN the account is a
    // member, and a member that cannot be recommended gets no e-mail invitation.
    await auth.service.verifyEmail(taken, extractCode(auth.email));
    const after = await discovery.annotate(buyer.company.id, null, list);
    expect(after.map((c) => c.email)).toEqual(["info@baska-firma.com"]);
  });

  it("web site match: the user that proves the domain must have a verified e-mail", async () => {
    const buyer = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const member = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.company.update({
      where: { id: member.company.id },
      data: { website: "https://www.uretici-firma.com" },
    });
    await prisma.companyUser.update({
      where: { id: member.user.id },
      data: { email: "satis@uretici-firma.com", emailVerifiedAt: null },
    });
    const discovery = makeDiscovery();
    const list = [candidate("Uretici Firma", "info@uretici-firma.com", "https://uretici-firma.com")];

    expect(
      (await discovery.annotate(buyer.company.id, null, list)).map((c) => [c.status, c.memberCompanyId]),
    ).toEqual([["SUGGESTED", null]]);

    await prisma.companyUser.update({ where: { id: member.user.id }, data: { emailVerifiedAt: new Date() } });
    expect(
      (await discovery.annotate(buyer.company.id, null, list)).map((c) => [c.status, c.memberCompanyId]),
    ).toEqual([["MEMBER", member.company.id]]);
  });
});

describe("authsec-2: an admin e-mail change closes what was mailed to the old address", () => {
  it("the 72 h setup link of a member added with a wrong address dies with the correction; a link asked for afterwards works", async () => {
    const auth = makeAuthService();
    const reset = makeReset();
    const admin = makeAdmin(auth, reset.service);
    const company = await makeCompanyWithUser(prisma, {});

    const added = await admin.addUser(
      company.company.id,
      { email: "jon@firma.com", firstName: "John", lastName: "Kaya", role: "SATISCI" },
      "admin-1",
    );
    const wrong = lastLink(reset.email);
    expect(wrong.to).toBe("jon@firma.com");
    await expect(reset.service.checkResetToken(wrong.token)).resolves.toEqual({ valid: true });

    await admin.changeEmail(company.company.id, added.userId, "john@firma.com", "admin-1");

    await expect(reset.service.checkResetToken(wrong.token)).resolves.toMatchObject({ valid: false });
    await expect(reset.service.confirmPasswordReset(wrong.token, "Yabanci!Parola9")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(reset.supabase.updatePassword).not.toHaveBeenCalled();
    expect(await prisma.passwordResetToken.count({ where: { companyUserId: added.userId } })).toBe(0);

    // The admin sends a new link: it goes to the corrected address and works.
    await admin.sendPasswordReset(company.company.id, added.userId, "admin-1");
    const right = lastLink(reset.email);
    expect(right.to).toBe("john@firma.com");
    await expect(reset.service.confirmPasswordReset(right.token, "Yepyeni!Parola9")).resolves.toEqual({
      success: true,
    });
    expect(reset.supabase.updatePassword).toHaveBeenCalledTimes(1);
  });

  it("a 60 min reset link, and a link that is being confirmed right now, do not survive the change either", async () => {
    const auth = makeAuthService();
    const reset = makeReset();
    const admin = makeAdmin(auth, reset.service);
    await auth.service.signup(signupDto("eski@firma.com"));
    await auth.service.verifyEmail("eski@firma.com", extractCode(auth.email));
    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: "eski@firma.com" } });

    await reset.service.requestForCompany("eski@firma.com");
    const old = lastLink(reset.email);
    expect(old.to).toBe("eski@firma.com");
    // A confirm in flight has CLAIMED its link (`usedAt` set); a failed
    // password update gives the link back by clearing that stamp.
    const claimed = await prisma.passwordResetToken.create({
      data: {
        companyUserId: user.id,
        tokenHash: "claimed-link-hash",
        expiresAt: new Date(Date.now() + 3_600_000),
        usedAt: new Date(),
      },
    });

    await admin.changeEmail(user.companyId, user.id, "yeni@firma.com", "admin-1");

    await expect(reset.service.checkResetToken(old.token)).resolves.toMatchObject({ valid: false });
    expect(await prisma.passwordResetToken.findUnique({ where: { id: claimed.id } })).toBeNull();
    expect(await prisma.passwordResetToken.count({ where: { companyUserId: user.id } })).toBe(0);
  });

  it("an e-mail 2FA login code read in the OLD mailbox does not log in at the new address; a code mailed to the new one does", async () => {
    const oldMail = "eski@firma.com";
    const newMail = "yeni@firma.com";
    const auth = makeAuthService();
    const admin = makeAdmin(auth, makeReset().service);
    await auth.service.signup(signupDto(oldMail));
    await auth.service.verifyEmail(oldMail, extractCode(auth.email));
    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: oldMail } });
    await prisma.companyUser.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true, twoFactorMethod: "EMAIL" },
    });

    await expect(auth.service.login({ email: oldMail, password: PASSWORD } as never)).resolves.toEqual({
      twoFactorRequired: true,
      method: "email",
    });
    expect(lastMail(auth.email).to.email).toBe(oldMail);
    const codeAtOld = extractCode(auth.email);

    await admin.changeEmail(user.companyId, user.id, newMail, "admin-1");

    expect(await prisma.emailVerificationCode.count({ where: { companyUserId: user.id, usedAt: null } })).toBe(0);
    await expect(
      auth.service.login({ email: newMail, password: PASSWORD, code: codeAtOld } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(auth.service.login({ email: newMail, password: PASSWORD } as never)).resolves.toEqual({
      twoFactorRequired: true,
      method: "email",
    });
    expect(lastMail(auth.email).to.email).toBe(newMail);
    await expect(
      auth.service.login({ email: newMail, password: PASSWORD, code: extractCode(auth.email) } as never),
    ).resolves.toHaveProperty("token");
  });

  it("unverified sign-up moved by the admin: the verification code mailed to the first address is closed", async () => {
    const auth = makeAuthService();
    const admin = makeAdmin(auth, makeReset().service);
    await auth.service.signup(signupDto("yanlis@firma.com"));
    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: "yanlis@firma.com" } });
    expect(await prisma.emailVerificationCode.count({ where: { companyUserId: user.id, usedAt: null } })).toBe(1);

    await admin.changeEmail(user.companyId, user.id, "dogru@firma.com", "admin-1");

    expect(await prisma.emailVerificationCode.count({ where: { companyUserId: user.id, usedAt: null } })).toBe(0);
    expect(
      await prisma.companyUser.findUniqueOrThrow({
        where: { id: user.id },
        select: { email: true, tokenVersion: true },
      }),
    ).toEqual({ email: "dogru@firma.com", tokenVersion: user.tokenVersion + 1 });
  });

  it("the write fails: nothing moves and the login source goes back to the address the row has", async () => {
    const auth = makeAuthService();
    await auth.service.signup(signupDto("eski@firma.com"));
    await auth.service.verifyEmail("eski@firma.com", extractCode(auth.email));
    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: "eski@firma.com" } });
    auth.supabaseAuth.updateEmail.mockClear();
    const failing = {
      companyUser: prisma.companyUser,
      emailVerificationCode: prisma.emailVerificationCode,
      $transaction: jest.fn().mockRejectedValue(new Error("db connection lost")),
    };
    const admin = makeAdmin(auth, makeReset().service, failing);

    await expect(admin.changeEmail(user.companyId, user.id, "yeni@firma.com", "admin-1")).rejects.toThrow(
      "db connection lost",
    );

    expect(auth.supabaseAuth.updateEmail.mock.calls).toEqual([
      [user.authId, "yeni@firma.com"],
      [user.authId, "eski@firma.com"],
    ]);
    expect((await prisma.companyUser.findUniqueOrThrow({ where: { id: user.id } })).email).toBe("eski@firma.com");
    expect(await prisma.auditLog.count({ where: { action: "admin.user.email_changed" } })).toBe(0);
    // Still the same account at the old address for the login source.
    await expect(auth.service.login({ email: "eski@firma.com", password: PASSWORD } as never)).resolves.toHaveProperty(
      "token",
    );
  });
});

describe("authsec-3: 'change e-mail' at sign-up closes the reset link mailed to the first address", () => {
  it("the finding: link asked for at the typo address stops working once the account moved (also after verification)", async () => {
    const typo = "ayse@firma-yanlis.com";
    const right = "ayse@firma.com";
    const auth = makeAuthService();
    const reset = makeReset();
    await auth.service.signup(signupDto(typo));
    const before = await prisma.companyUser.findUniqueOrThrow({ where: { email: typo } });

    // Whoever reads the typo mailbox asks for a reset link.
    await reset.service.requestForCompany(typo);
    const link = lastLink(reset.email);
    expect(link.to).toBe(typo);
    await expect(reset.service.checkResetToken(link.token)).resolves.toEqual({ valid: true });

    await auth.service.changeSignupEmail({ email: typo, password: PASSWORD, newEmail: right });

    await expect(reset.service.checkResetToken(link.token)).resolves.toMatchObject({ valid: false });
    expect(await prisma.passwordResetToken.count({ where: { companyUserId: before.id } })).toBe(0);

    await auth.service.verifyEmail(right, extractCode(auth.email));
    await expect(reset.service.confirmPasswordReset(link.token, "Yabanci!Parola9")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(reset.supabase.updatePassword).not.toHaveBeenCalled();
    const after = await prisma.companyUser.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.email).toBe(right);
    expect(after.tokenVersion).toBe(before.tokenVersion);
  });

  it("a link asked for at the NEW address after the change works", async () => {
    const auth = makeAuthService();
    const reset = makeReset();
    await auth.service.signup(signupDto("ilk@firma.com"));
    await auth.service.changeSignupEmail({ email: "ilk@firma.com", password: PASSWORD, newEmail: "ikinci@firma.com" });

    await reset.service.requestForCompany("ikinci@firma.com");
    const link = lastLink(reset.email);
    expect(link.to).toBe("ikinci@firma.com");
    await expect(reset.service.confirmPasswordReset(link.token, "Yepyeni!Parola9")).resolves.toEqual({
      success: true,
    });
  });

  it("the same address again (resend) is not a move: the link stays", async () => {
    const auth = makeAuthService();
    const reset = makeReset();
    await auth.service.signup(signupDto("ayni@firma.com"));
    await reset.service.requestForCompany("ayni@firma.com");
    const link = lastLink(reset.email);

    await auth.service.changeSignupEmail({ email: "ayni@firma.com", password: PASSWORD, newEmail: "ayni@firma.com" });

    await expect(reset.service.checkResetToken(link.token)).resolves.toEqual({ valid: true });
  });
});

describe("a password link is never mailed for an address the account has just left", () => {
  it("forgot password read the address, then the account moved (change e-mail): no link is mailed to the old address and none is left", async () => {
    const auth = makeAuthService();
    await auth.service.signup(signupDto("ilk@firma.com"));
    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: "ilk@firma.com" } });
    const reset = makeReset(
      resetDbWithStepAfterAccountRead(() =>
        auth.service.changeSignupEmail({ email: "ilk@firma.com", password: PASSWORD, newEmail: "ikinci@firma.com" }),
      ),
    );

    await expect(reset.service.requestForCompany("ilk@firma.com")).resolves.toEqual({ success: true });

    expect((await prisma.companyUser.findUniqueOrThrow({ where: { id: user.id } })).email).toBe("ikinci@firma.com");
    expect(reset.email.send).not.toHaveBeenCalled();
    expect(await prisma.passwordResetToken.count({ where: { companyUserId: user.id } })).toBe(0);
  });

  it("account setup read the address, then the admin corrected it: nothing is mailed to the wrong address", async () => {
    const auth = makeAuthService();
    const company = await makeCompanyWithUser(prisma, {});
    const added = await makeAdmin(auth, makeReset().service).addUser(
      company.company.id,
      { email: "jon@firma.com", firstName: "John", lastName: "Kaya", role: "SATISCI" },
      "admin-1",
    );
    // The first setup link is gone with the correction below; this is a second
    // request racing with it.
    const admin = makeAdmin(auth, makeReset().service);
    const reset = makeReset(
      resetDbWithStepAfterAccountRead(() =>
        admin.changeEmail(company.company.id, added.userId, "john@firma.com", "admin-1"),
      ),
    );

    await expect(reset.service.requestAccountSetup(added.userId)).resolves.toEqual({ sent: false });

    expect(reset.email.send).not.toHaveBeenCalled();
    expect(await prisma.passwordResetToken.count({ where: { companyUserId: added.userId } })).toBe(0);
  });
});
