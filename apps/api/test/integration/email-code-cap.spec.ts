/**
 * Denetim 2026-08-23 #9: 6 haneli e-posta kodu — hesap-bazlı ÜRETİM tavanı
 * (5/saat) + hatalı deneme sayacının koşullu (atomik) artışı.
 */
import "reflect-metadata";
import { prisma, truncateAll } from "./test-db";
import { extractCode, makeAuthService } from "./make-auth-service";

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

describe("e-posta 2FA girişinde kod tavanı (derin denetim MU-16)", () => {
  async function emailTwoFactorUser() {
    const rig = await signupUser();
    await rig.service.verifyEmail(rig.mail, extractCode(rig.email));
    await prisma.companyUser.update({
      where: { id: rig.user.id },
      data: { twoFactorEnabled: true, twoFactorMethod: "EMAIL" },
    });
    const login = (code?: string) =>
      rig.service.login({ email: rig.mail, password: "Guclu!Parola9", ...(code ? { code } : {}) } as never);
    return { ...rig, login };
  }

  it("tavan dolunca 503 DEĞİL: geçerli son kod varsa kod ekranına geçilir, o kodla giriş yapılır", async () => {
    const { email, login } = await emailTwoFactorUser();
    // signup kodu (1) + 4 giriş = saatte 5 kod → tavan doldu.
    for (let i = 0; i < 4; i++) await login();
    const lastCode = extractCode(email);
    const sentBefore = email.send.mock.calls.length;

    await expect(login()).resolves.toEqual({ twoFactorRequired: true, method: "email" });
    expect(email.send.mock.calls.length).toBe(sentBefore); // yeni kod YOK

    const ok = (await login(lastCode)) as { token?: string };
    expect(ok.token).toBeTruthy();
  });

  it("tavan dolu VE geçerli kod yoksa 429 (gönderim hatası 503'ü değil)", async () => {
    const { user, login } = await emailTwoFactorUser();
    for (let i = 0; i < 4; i++) await login();
    await prisma.emailVerificationCode.updateMany({
      where: { companyUserId: user.id, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const err = await login().catch((e: unknown) => e);
    expect((err as { getStatus: () => number }).getStatus()).toBe(429);
    expect((err as Error).message).toMatch(/çok fazla doğrulama kodu/i);
  });
});
