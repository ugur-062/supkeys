/**
 * Sözleşme onayı kapısı (derin denetim 2026-09-29 MU-04) — admin eliyle açılan
 * üye kullanıcı sözleşmesi / aracılık / KVKK onay izi olmadan doğuyordu.
 * `/me` `needsTermsAcceptance` döner; `acceptTerms` onayı kişinin kendisinden
 * alır, yalnız boş alanları yazar.
 */
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AdminCompanyUsersService } from "../../src/modules/admin-companies/admin-company-users.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { AcceptTermsDto } from "../../src/modules/company-auth/dto/account.dto";
import { makeAuthService } from "./make-auth-service";
import { makeCompanyWithUser, makeUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("sözleşme onayı kapısı", () => {
  it("admin eliyle eklenen üye onay ister; kabulden sonra üç onay yazılır ve kapı kapanır", async () => {
    const admin = new AdminCompanyUsersService(
      prisma as never,
      new AuditService(prisma as never),
      {
        requestForCompany: jest.fn().mockResolvedValue({ success: true }),
        requestAccountSetup: jest.fn().mockResolvedValue({ sent: true }),
      } as never,
      {} as never,
      {
        createUser: jest.fn().mockResolvedValue({ authId: "auth-terms-1" }),
        deleteUser: jest.fn(),
      } as never,
    );
    const co = await makeCompanyWithUser(prisma, {});
    const { userId } = await admin.addUser(
      co.company.id,
      { email: "admin-eklenen@firma.com", firstName: "A", lastName: "E", role: "SATISCI" },
      "admin-1",
    );

    const { service, audit } = makeAuthService();
    const before = await service.getMe(userId);
    expect(before.user.needsTermsAcceptance).toBe(true);

    const after = await service.acceptTerms(userId, { marketingConsent: true });
    expect(after.user.needsTermsAcceptance).toBe(false);
    const row = await prisma.companyUser.findUniqueOrThrow({
      where: { id: userId },
      select: {
        termsAcceptedAt: true,
        mediationAcceptedAt: true,
        kvkkAcceptedAt: true,
        marketingConsent: true,
      },
    });
    expect(row.termsAcceptedAt).not.toBeNull();
    expect(row.mediationAcceptedAt).not.toBeNull();
    expect(row.kvkkAcceptedAt).not.toBeNull();
    expect(row.marketingConsent).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "company.user.terms_accepted", actorId: userId }),
    );
  });

  it("onayı olan kullanıcıda kapı kapalı; ilk onay tarihi ezilmez", async () => {
    const co = await makeCompanyWithUser(prisma, {});
    const first = new Date("2026-09-01T10:00:00.000Z");
    const u = await makeUser(prisma, co.company.id, ["SATISCI"], {
      termsAcceptedAt: first,
      mediationAcceptedAt: first,
      kvkkAcceptedAt: first,
    });
    const { service, audit } = makeAuthService();
    expect((await service.getMe(u.id)).user.needsTermsAcceptance).toBe(false);
    await service.acceptTerms(u.id, { marketingConsent: true });
    const row = await prisma.companyUser.findUniqueOrThrow({
      where: { id: u.id },
      select: { termsAcceptedAt: true, marketingConsent: true },
    });
    expect(row.termsAcceptedAt?.toISOString()).toBe(first.toISOString());
    // Kapı açık değilken isteğe bağlı rıza bu uçtan değişmez.
    expect(row.marketingConsent).toBe(false);
    expect(audit.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "company.user.terms_accepted" }),
    );
  });

  it("DTO: üç zorunlu onaydan biri false ise reddedilir", async () => {
    const bad = plainToInstance(AcceptTermsDto, {
      termsAccepted: true,
      mediationAccepted: false,
      kvkkAccepted: true,
    });
    const errs = await validate(bad);
    expect(errs.map((e) => e.property)).toEqual(["mediationAccepted"]);
    const ok = plainToInstance(AcceptTermsDto, {
      termsAccepted: true,
      mediationAccepted: true,
      kvkkAccepted: true,
    });
    expect(await validate(ok)).toHaveLength(0);
  });
});
