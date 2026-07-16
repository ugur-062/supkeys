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

  it("GÜVENLİK: zaten doğrulanmış e-postada token DÖNMEZ (hesap ele geçirme engeli)", async () => {
    const { service, email } = makeAuthService();
    const dto = validSignup();
    await service.signup(dto as never);
    const code = extractCode(email);
    // İlk doğrulama token verir.
    const first = (await service.verifyEmail(dto.email, code)) as {
      token?: string;
    };
    expect(first.token).toBeTruthy();
    // Aynı uçtan ikinci çağrı (kimlik doğrulamasız) → token YOK, sadece bilgi.
    const second = (await service.verifyEmail(dto.email, "000000")) as {
      token?: string;
      alreadyVerified?: boolean;
    };
    expect(second.token).toBeUndefined();
    expect(second.alreadyVerified).toBe(true);
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

describe("failure-aware kritik gönderim (1b)", () => {
  it("signup: kod e-postası giderse emailSent:true", async () => {
    const { service } = makeAuthService();
    const res = (await service.signup(validSignup() as never)) as {
      emailSent?: boolean;
    };
    expect(res.emailSent).toBe(true);
  });

  it("signup: kod e-postası GİTMEZSE emailSent:false ama hesap+kod YİNE oluşur", async () => {
    const { service, email } = makeAuthService();
    email.send.mockRejectedValueOnce(new Error("resend down"));
    const dto = validSignup();
    const res = (await service.signup(dto as never)) as {
      emailSent?: boolean;
      verificationRequired?: boolean;
    };
    expect(res.verificationRequired).toBe(true);
    expect(res.emailSent).toBe(false); // dürüst sinyal → frontend "tekrar gönder"
    const user = await prisma.companyUser.findUniqueOrThrow({
      where: { email: dto.email },
    });
    expect(
      await prisma.emailVerificationCode.count({
        where: { companyUserId: user.id },
      }),
    ).toBe(1); // kod satırı var → kurtarılabilir
  });

  it("resendEmailCode: e-posta gitmese bile generic {success:true} (enumeration-safe)", async () => {
    const { service, email } = makeAuthService();
    const dto = validSignup();
    await service.signup(dto as never);
    email.send.mockRejectedValueOnce(new Error("resend down"));
    const res = (await service.resendEmailCode(dto.email)) as {
      success?: boolean;
    };
    expect(res.success).toBe(true);
  });

  it("2FA (EMAIL): kod gönderilemezse login 503 (post-auth, sessizce ilerlemez)", async () => {
    const { service, email } = makeAuthService();
    const dto = validSignup();
    await service.signup(dto as never);
    await service.verifyEmail(dto.email, extractCode(email));
    const user = await prisma.companyUser.findUniqueOrThrow({
      where: { email: dto.email },
    });
    await prisma.companyUser.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true, twoFactorMethod: "EMAIL" },
    });
    email.send.mockRejectedValueOnce(new Error("resend down"));
    await expect(
      service.login({ email: dto.email, password: dto.password } as never),
    ).rejects.toThrow(/gönderilemedi|tekrar deneyin/i);
  });
});
