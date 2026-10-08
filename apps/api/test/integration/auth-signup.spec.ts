/**
 * Kayıt + e-posta doğrulama akışı (Faz 1): signup → 6 haneli kod → verify →
 * token; doğrulanmadan login engelli; sözleşme kayıtları; enumeration.
 */
import { HttpException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaClient } from "@rothern/db";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { UpdateMeDto } from "../../src/modules/company-auth/dto/account.dto";
import { CompanySignupDto } from "../../src/modules/company-auth/dto/company-signup.dto";
import { CompanyAuthService } from "../../src/modules/company-auth/services/company-auth.service";
import { TEST_DB_URL } from "./env";
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

/**
 * Sahip kararı 2026-10-08: kayıt formu telefonu SORMAZ (numara doğrulanmıyordu,
 * başka firmaya gösterilmiyordu). API alanı isteğe bağlı kabul eder; eski web
 * paketinin gönderdiği numara eskisi gibi doğrulanır ve saklanır.
 *
 * Gövde, HTTP yolundaki global ValidationPipe ile AYNI seçeneklerle DTO'dan
 * geçirilir (whitelist + transform + forbidNonWhitelisted) ve servise o örnek
 * verilir — "istek kabul edilir" ile "null saklanır" tek testte kanıtlanır.
 */
describe("telefon isteğe bağlı — kayıt ve hesap bilgileri", () => {
  const throughPipe = (body: Record<string, unknown>) => {
    const dto = plainToInstance(CompanySignupDto, body);
    const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
    return { dto, errors };
  };
  const bodyWithoutPhone = () => {
    const { phone: _phone, ...rest } = validSignup();
    return rest as Record<string, unknown>;
  };

  it("telefonsuz gövde kabul edilir; kullanıcı phone=null ile oluşur, /me null döner", async () => {
    const { service } = makeAuthService();
    const body = bodyWithoutPhone();
    expect(body).not.toHaveProperty("phone");
    const { dto, errors } = throughPipe(body);
    expect(errors).toEqual([]);

    const res = (await service.signup(dto)) as { verificationRequired?: boolean };
    expect(res.verificationRequired).toBe(true);
    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: dto.email } });
    expect(user.phone).toBeNull();
    // Hesap ekranı "null" yazısı değil boş değer alır.
    const me = await service.getMe(user.id);
    expect(me.user.phone).toBeNull();
  });

  it.each([null, "", "   "])("telefon %p = numara verilmedi → null saklanır", async (phone) => {
    const { service } = makeAuthService();
    const { dto, errors } = throughPipe({ ...bodyWithoutPhone(), phone });
    expect(errors).toEqual([]);
    await service.signup(dto);
    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: dto.email } });
    expect(user.phone).toBeNull();
  });

  it("eski web paketi: gönderilen telefon doğrulanır ve normalize edilerek saklanır", async () => {
    const { service } = makeAuthService();
    const { dto, errors } = throughPipe({ ...bodyWithoutPhone(), phone: " +90 555 111 22 33 " });
    expect(errors).toEqual([]);
    await service.signup(dto);
    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: dto.email } });
    expect(user.phone).toBe("+90 555 111 22 33");
  });

  it("eski web paketi: bozuk telefon hâlâ reddedilir (alan hatası phone)", () => {
    for (const phone of ["+90 89161234567", "+90 532", "abc"]) {
      const { errors } = throughPipe({ ...bodyWithoutPhone(), phone });
      expect(errors.map((e) => e.property)).toEqual(["phone"]);
    }
  });

  // Ayarlar › Hesap Bilgileri: telefon İSTEĞE BAĞLI kalır — telefonsuz hesap
  // öteki alanlarını kaydeder, numara ekler ve eklediği numarayı siler.
  it("telefonsuz hesap: ad güncellenir (telefon null kalır) → numara eklenir → silinir", async () => {
    const { service } = makeAuthService();
    const { dto } = throughPipe(bodyWithoutPhone());
    await service.signup(dto);
    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: dto.email } });
    const phoneOf = async () =>
      (await prisma.companyUser.findUniqueOrThrow({ where: { id: user.id } })).phone;
    const patch = (body: Record<string, unknown>) => {
      const patchDto = plainToInstance(UpdateMeDto, body);
      expect(validateSync(patchDto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
      return service.updateMe(user.id, patchDto);
    };

    // Web formu boş telefonu "" olarak gönderir.
    const renamed = await patch({ firstName: "Adile", lastName: "Yılmaz", phone: "" });
    expect(renamed.user).toMatchObject({ firstName: "Adile", phone: null });
    expect(await phoneOf()).toBeNull();

    const added = await patch({ phone: "+90 532 123 45 67" });
    expect(added.user.phone).toBe("+90 532 123 45 67");

    const cleared = await patch({ phone: "" });
    expect(cleared.user.phone).toBeNull();
    expect(await phoneOf()).toBeNull();

    // Yazılan numara eskisi gibi doğrulanır.
    const bad = plainToInstance(UpdateMeDto, { phone: "+90 532" });
    expect(validateSync(bad).map((e) => e.property)).toEqual(["phone"]);
  });
});

describe("changeSignupEmail (derin denetim LU-22)", () => {
  it("doğrulanmamış hesabın adresi değişir; ikinci firma açılmaz, kod yeni adrese gider", async () => {
    const { service, email, supabaseAuth } = makeAuthService();
    const dto = validSignup();
    await service.signup(dto as never);
    const newEmail = `yeni-${Date.now()}@test.local`;
    const oldCode = extractCode(email);

    const res = await service.changeSignupEmail({
      email: dto.email,
      password: dto.password,
      newEmail: newEmail.toUpperCase(),
    });
    expect(res).toMatchObject({ email: newEmail, verificationRequired: true });
    expect(supabaseAuth.updateEmail).toHaveBeenCalledWith(expect.any(String), newEmail);
    expect(await prisma.company.count()).toBe(1);
    expect(await prisma.companyUser.findUnique({ where: { email: dto.email } })).toBeNull();
    const call = email.send.mock.calls.at(-1)?.[0] as { to: { email: string } };
    expect(call.to.email).toBe(newEmail);

    // Eski kod geçersiz; yeni adres yeni kodla doğrulanır.
    const newCode = extractCode(email);
    if (oldCode !== newCode) {
      await expect(service.verifyEmail(newEmail, oldCode)).rejects.toThrow();
    }
    const verified = (await service.verifyEmail(newEmail, newCode)) as { token?: string };
    expect(verified.token).toBeTruthy();
  });

  // Arayuz testi 2026-10 code-auth-1: a code proves the address it was MAILED
  // to. The codes mailed to the old address must die with that address, also
  // when no new code can be issued.
  it("saatlik tavanda adres değişince eski adrese giden kod yeni adresi DOĞRULAMAZ", async () => {
    const { service, email } = makeAuthService();
    const dto = validSignup();
    await service.signup(dto as never);
    for (let i = 0; i < 4; i++) await service.resendEmailCode(dto.email); // 5 codes = hourly cap
    const codeAtOldAddress = extractCode(email);
    const newEmail = `baskasi-${Date.now()}@test.local`;
    const sentBefore = email.send.mock.calls.length;

    const res = await service.changeSignupEmail({
      email: dto.email,
      password: dto.password,
      newEmail,
    });

    // No code could be issued for the new address...
    expect(res).toMatchObject({ email: newEmail, emailSent: false });
    expect(email.send.mock.calls.length).toBe(sentBefore);
    // ...and the one read in the old mailbox does not verify it.
    await expect(service.verifyEmail(newEmail, codeAtOldAddress)).rejects.toThrow();
    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: newEmail } });
    expect(user.emailVerifiedAt).toBeNull();
    expect(
      await prisma.emailVerificationCode.count({ where: { companyUserId: user.id, usedAt: null } }),
    ).toBe(0);
  });

  it("adres değişimiyle yarışan yeniden gönderim: ESKİ adres için üretilen kod atılır, e-posta gitmez", async () => {
    const { service, email } = makeAuthService();
    const dto = validSignup();
    await service.signup(dto as never);
    const newEmail = `yeni-${Date.now()}@test.local`;
    await service.changeSignupEmail({ email: dto.email, password: dto.password, newEmail });
    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: newEmail } });
    const sentBefore = email.send.mock.calls.length;

    // What resendEmailCode does when it read the address BEFORE the change.
    const stale = await (
      service as unknown as {
        issueEmailCode: (id: string, email: string, firstName: string) => Promise<{ sent: boolean }>;
      }
    ).issueEmailCode(user.id, dto.email, "Ada");

    expect(stale).toEqual({ sent: false });
    expect(email.send.mock.calls.length).toBe(sentBefore); // nothing mailed to the old address
    expect(
      await prisma.emailVerificationCode.count({ where: { companyUserId: user.id, usedAt: null } }),
    ).toBe(0); // no code that was not mailed to the current address stays usable

    // The account is not stuck: a resend for the current address works.
    await expect(service.resendEmailCode(newEmail)).resolves.toEqual({ success: true, sent: true });
    const verified = (await service.verifyEmail(newEmail, extractCode(email))) as { token?: string };
    expect(verified.token).toBeTruthy();
  });

  it("adres değişimi sürerken hesap ESKİ adresle doğrulanırsa adres değişmez, Supabase geri alınır", async () => {
    const { service, email, supabaseAuth } = makeAuthService();
    const dto = validSignup();
    await service.signup(dto as never);
    const code = extractCode(email);
    // The verification lands while change-email is still talking to Supabase.
    supabaseAuth.updateEmail.mockImplementationOnce(async () => {
      await service.verifyEmail(dto.email, code);
    });

    await expect(
      service.changeSignupEmail({ email: dto.email, password: dto.password, newEmail: "x@test.local" }),
    ).rejects.toThrow("E-posta veya şifre hatalı");

    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: dto.email } });
    expect(user.emailVerifiedAt).not.toBeNull(); // verified for the address the code was mailed to
    expect(await prisma.companyUser.findUnique({ where: { email: "x@test.local" } })).toBeNull();
    expect(supabaseAuth.updateEmail).toHaveBeenLastCalledWith(expect.any(String), dto.email);
  });

  it("yanlış parola → aynı generic hata, adres değişmez", async () => {
    const { service, supabaseAuth } = makeAuthService();
    const dto = validSignup();
    await service.signup(dto as never);
    supabaseAuth.verifyPassword.mockRejectedValueOnce(new Error("bad credentials"));
    await expect(
      service.changeSignupEmail({ email: dto.email, password: "Yanlis!Parola9", newEmail: "x@test.local" }),
    ).rejects.toThrow("E-posta veya şifre hatalı");
    expect(supabaseAuth.updateEmail).not.toHaveBeenCalled();
    expect(await prisma.companyUser.findUnique({ where: { email: dto.email } })).not.toBeNull();
  });

  it("GÜVENLİK: doğrulanmış hesabın adresi bu uçtan değişmez", async () => {
    const { service, email, supabaseAuth } = makeAuthService();
    const dto = validSignup();
    await service.signup(dto as never);
    await service.verifyEmail(dto.email, extractCode(email));
    await expect(
      service.changeSignupEmail({ email: dto.email, password: dto.password, newEmail: "x@test.local" }),
    ).rejects.toThrow("E-posta veya şifre hatalı");
    expect(supabaseAuth.updateEmail).not.toHaveBeenCalled();
  });

  it("yeni adres başka hesapta → çakışma, adres değişmez", async () => {
    const { service, supabaseAuth } = makeAuthService();
    const a = validSignup();
    const b = validSignup();
    await service.signup(a as never);
    await service.signup(b as never);
    await expect(
      service.changeSignupEmail({ email: a.email, password: a.password, newEmail: b.email }),
    ).rejects.toThrow("Bu e-posta ile zaten bir hesap var");
    expect(supabaseAuth.updateEmail).not.toHaveBeenCalled();
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

  // Arayuz testi 2026-10 code-auth-3: resend used to answer { success: true }
  // whatever happened, so the screen said "new code sent" with no mail sent.
  it("resendEmailCode: kod gittiyse sent:true", async () => {
    const { service, email } = makeAuthService();
    const dto = validSignup();
    await service.signup(dto as never);
    const sentBefore = email.send.mock.calls.length;
    await expect(service.resendEmailCode(dto.email.toUpperCase())).resolves.toEqual({
      success: true,
      sent: true,
    });
    expect(email.send.mock.calls.length).toBe(sentBefore + 1);
  });

  it("resendEmailCode: e-posta GİTMEZSE hata atmaz ama sent:false döner (sağlayıcı hatası)", async () => {
    const { service, email } = makeAuthService();
    const dto = validSignup();
    await service.signup(dto as never);
    email.send.mockRejectedValueOnce(new Error("resend down"));
    await expect(service.resendEmailCode(dto.email)).resolves.toEqual({
      success: true,
      sent: false,
    });
  });

  it("resendEmailCode: bastırılmış adreste (send sent:false) sent:false döner", async () => {
    const { service, email } = makeAuthService();
    const dto = validSignup();
    await service.signup(dto as never);
    email.send.mockResolvedValueOnce({ emailLogId: "x", sent: false });
    await expect(service.resendEmailCode(dto.email)).resolves.toEqual({
      success: true,
      sent: false,
    });
  });

  it("resendEmailCode: bilinmeyen ve doğrulanmış adres normal başarı gibi görünür, e-posta gitmez (enumeration-safe)", async () => {
    const { service, email } = makeAuthService();
    const dto = validSignup();
    await service.signup(dto as never);
    await service.verifyEmail(dto.email, extractCode(email));
    const sentBefore = email.send.mock.calls.length;
    const codesBefore = await prisma.emailVerificationCode.count();

    const unknown = await service.resendEmailCode("hic-yok@test.local");
    const verified = await service.resendEmailCode(dto.email);

    // Same shape as a real send: no `capped`, no `sent: false`.
    expect(unknown).toEqual({ success: true, sent: true });
    expect(verified).toEqual({ success: true, sent: true });
    expect(email.send.mock.calls.length).toBe(sentBefore);
    expect(await prisma.emailVerificationCode.count()).toBe(codesBefore);
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

/**
 * Arayuz testi 2026-10 code-auth-1, the same rule under real concurrency: a
 * separate multi-connection client (the shared test client has
 * connection_limit=1 and runs everything in series).
 */
describe("changeSignupEmail racing verification and resend", () => {
  let multi: PrismaClient;
  beforeAll(() => {
    const base = TEST_DB_URL.replace(/[?&]connection_limit=\d+/, "");
    multi = new PrismaClient({
      datasources: { db: { url: `${base}${base.includes("?") ? "&" : "?"}connection_limit=6` } },
    });
  });
  afterAll(async () => {
    await multi.$disconnect();
  });

  it("an account never ends up verified under an address no code was mailed to (and nothing deadlocks)", async () => {
    const rig = makeAuthService();
    const concurrent = new CompanyAuthService(
      multi as never,
      new JwtService({ secret: "test-secret", signOptions: { expiresIn: "1h" } }),
      rig.supabaseAuth as never,
      rig.audit as never,
      rig.email as never,
      {
        get: (key: string) => (key === "JWT_SECRET" ? "test-secret" : undefined),
        getOrThrow: () => "test-secret",
      } as never,
      multi as never,
    );
    const mailedTo = (address: string) =>
      (rig.email.send.mock.calls as unknown as Array<[{ to: { email: string }; templateData: { data: { code?: { value: string } } } }]>)
        .filter(([m]) => m.to.email === address)
        .map(([m]) => m.templateData.data.code?.value)
        .filter((c): c is string => !!c);

    for (let round = 0; round < 12; round++) {
      const dto = validSignup();
      const target = `hedef-${round}-${Date.now()}@test.local`;
      await rig.service.signup(dto as never);
      const ownCode = extractCode(rig.email);
      const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: dto.email } });

      const settled = await Promise.allSettled([
        concurrent.changeSignupEmail({ email: dto.email, password: dto.password, newEmail: target }),
        concurrent.verifyEmail(target, ownCode),
        concurrent.resendEmailCode(dto.email),
        concurrent.verifyEmail(dto.email, ownCode),
        concurrent.verifyEmail(target, ownCode),
      ]);
      // Every refusal is a deliberate HTTP error; a deadlock or a write conflict would be a raw driver error.
      for (const r of settled) {
        if (r.status === "rejected") expect(r.reason).toBeInstanceOf(HttpException);
      }
      // Whatever was mailed to the first address must not verify the second one.
      for (const code of mailedTo(dto.email)) {
        await concurrent.verifyEmail(target, code).catch(() => undefined);
      }

      const after = await prisma.companyUser.findUniqueOrThrow({ where: { id: user.id } });
      if (after.emailVerifiedAt) expect(after.email).toBe(dto.email);
      else expect([dto.email, target]).toContain(after.email);
    }
  });
});
