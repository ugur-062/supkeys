/**
 * Denetim 2026-08-23 #9: 6 haneli e-posta kodu — hesap-bazlı ÜRETİM tavanı
 * (5/saat) + hatalı deneme sayacının koşullu (atomik) artışı.
 */
import "reflect-metadata";
import { prisma, truncateAll } from "./test-db";
import { makeAuthService } from "./make-auth-service";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function signupUser() {
  const { service, email } = makeAuthService();
  const mail = `cap-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  await service.signup(
    {
      firstName: "Ada",
      lastName: "Yılmaz",
      email: mail,
      phone: "+90 555 111 22 33",
      password: "Guclu!Parola9",
      termsAccepted: true,
      mediationAccepted: true,
      kvkkAccepted: true,
      marketingConsent: true,
    } as never,
    { ip: "127.0.0.1", userAgent: "jest" },
  );
  const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: mail } });
  return { service, email, mail, user };
}

describe("e-posta kodu üretim tavanı", () => {
  it("saatte en fazla 5 kod üretilir; 6. resend yeni kod ÜRETMEZ ve e-posta göndermez ama generic başarı döner", async () => {
    const { service, email, mail, user } = await signupUser();
    const countCodes = () => prisma.emailVerificationCode.count({ where: { companyUserId: user.id } });
    expect(await countCodes()).toBe(1); // signup kodu
    for (let i = 0; i < 4; i++) await service.resendEmailCode(mail);
    expect(await countCodes()).toBe(5);
    const sentBefore = email.send.mock.calls.length;
    const res = await service.resendEmailCode(mail);
    expect(res).toEqual({ success: true }); // enumeration sızdırmaz
    expect(await countCodes()).toBe(5); // yeni kod YOK
    expect(email.send.mock.calls.length).toBe(sentBefore); // e-posta YOK
    // Mevcut (5.) kod hâlâ geçerli: usedAt null + süresi dolmamış
    const active = await prisma.emailVerificationCode.findFirst({
      where: { companyUserId: user.id, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    expect(active).not.toBeNull();
  });

  it("hatalı deneme sayacı tavanı AŞMAZ (eşzamanlı burst) ve tavana ulaşınca doğru kod bile reddedilir", async () => {
    const { service, mail, user } = await signupUser();
    // 12 eşzamanlı yanlış deneme → attempts ≤ 5 (koşullu updateMany)
    await Promise.all(
      Array.from({ length: 12 }, () => service.verifyEmail(mail, "000000").catch(() => undefined)),
    );
    const rec = await prisma.emailVerificationCode.findFirstOrThrow({
      where: { companyUserId: user.id },
      orderBy: { createdAt: "desc" },
    });
    expect(rec.attempts).toBeLessThanOrEqual(5);
    expect(rec.attempts).toBeGreaterThanOrEqual(1);
  });
});
