/**
 * Kayıt + e-posta doğrulama akışı (Faz 1): signup → 6 haneli kod → verify →
 * token; doğrulanmadan login engelli; sözleşme kayıtları; enumeration.
 */
import { prisma, truncateAll } from "./test-db";
import { extractCode, makeAuthService } from "./make-auth-service";

const validSignup = (over: Record<string, unknown> = {}) => ({
  firstName: "Ada",
  lastName: "Yılmaz",
  email: `u-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
  phone: "+90 555 111 22 33",
  password: "Guclu!Parola9",
  termsAccepted: true,
  mediationAccepted: true,
  kvkkAccepted: true,
  marketingConsent: true,
  ...over,
});

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("signup", () => {
  it("token DÖNMEZ, doğrulama gerektirir; kullanıcı emailVerifiedAt=null + kod üretir", async () => {
    const { service, email } = makeAuthService();
    const dto = validSignup();
    const res = (await service.signup(dto as never)) as {
      verificationRequired?: boolean;
      token?: string;
    };
    expect(res.verificationRequired).toBe(true);
    expect(res.token).toBeUndefined();

    const user = await prisma.companyUser.findUniqueOrThrow({
      where: { email: dto.email },
    });
    expect(user.emailVerifiedAt).toBeNull();
    // sözleşme kayıtları
    expect(user.termsAcceptedAt).not.toBeNull();
    expect(user.kvkkAcceptedAt).not.toBeNull();
    expect(user.marketingConsent).toBe(true);
    expect(user.profileImprovementConsent).toBe(false);
    // kod üretildi + e-posta gönderildi
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(
      await prisma.emailVerificationCode.count({
        where: { companyUserId: user.id },
      }),
    ).toBe(1);
  });

  it("aynı e-posta ikinci kez → çakışma", async () => {
    const { service } = makeAuthService();
    const dto = validSignup();
    await service.signup(dto as never);
    await expect(service.signup(dto as never)).rejects.toThrow();
  });
});

describe("verifyEmail", () => {
  it("yanlış kod reddedilir, doğru kod token + emailVerifiedAt verir", async () => {
    const { service, email } = makeAuthService();
    const dto = validSignup();
    await service.signup(dto as never);
    const code = extractCode(email);

    await expect(
      service.verifyEmail(dto.email, "000000" === code ? "111111" : "000000"),
    ).rejects.toThrow();

    const res = (await service.verifyEmail(dto.email, code)) as {
      token?: string;
      company?: unknown;
    };
    expect(res.token).toBeTruthy();
    expect(res.company).toBeDefined();
    const user = await prisma.companyUser.findUniqueOrThrow({
      where: { email: dto.email },
    });
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it("çok fazla hatalı deneme → kilit", async () => {
    const { service, email } = makeAuthService();
    const dto = validSignup();
    await service.signup(dto as never);
    void email;
    for (let i = 0; i < 5; i++) {
      await expect(service.verifyEmail(dto.email, "999999")).rejects.toThrow();
    }
    // 6. deneme artık "çok fazla deneme" (doğru kod bile olsa kilitli)
    await expect(service.verifyEmail(dto.email, "999999")).rejects.toThrow(
      /çok fazla|deneme/i,
    );
  });
});

describe("login gate", () => {
  it("e-posta doğrulanmadan login engelli", async () => {
    const { service } = makeAuthService();
    const dto = validSignup();
    await service.signup(dto as never);
    await expect(
      service.login({ email: dto.email, password: dto.password } as never),
    ).rejects.toThrow();
  });

  it("doğrulama sonrası login açılır", async () => {
    const { service, email } = makeAuthService();
    const dto = validSignup();
    await service.signup(dto as never);
    await service.verifyEmail(dto.email, extractCode(email));
    const res = (await service.login({
      email: dto.email,
      password: dto.password,
    } as never)) as { token?: string };
    expect(res.token).toBeTruthy();
  });
});
