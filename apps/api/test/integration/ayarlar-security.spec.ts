/**
 * Ayarlar güvenlik denetimi: 2FA yaşam döngüsü (kurulum → etkinleştirme +
 * kurtarma kodları → giriş → kapatma, secret şifreleme), parola değişimi +
 * tokenVersion oturum geçersizleştirme, bildirim tercihi whitelist/merge,
 * adres defteri (varsayılan tekilliği, IDOR, aktif ilanda silme kilidi).
 */
import { authenticator } from "otplib";
import * as crypto from "node:crypto";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyAddressesService } from "../../src/modules/company-addresses/company-addresses.service";
import { CompanyJwtStrategy } from "../../src/modules/company-auth/strategies/company-jwt.strategy";
import { makeCompanyWithUser, makeListing } from "./factories";
import { extractCode, makeAuthService } from "./make-auth-service";
import { prisma, truncateAll } from "./test-db";

const validSignup = (over: Record<string, unknown> = {}) => ({
  firstName: "Ada",
  lastName: "Yılmaz",
  email: `u-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
  phone: "+90 555 111 22 33",
  password: "Guclu!Parola9",
  termsAccepted: true,
  mediationAccepted: true,
  kvkkAccepted: true,
  marketingConsent: false,
  ...over,
});

/** signup + e-posta doğrulama → login'e hazır kullanıcı. */
async function signupVerified() {
  const rig = makeAuthService();
  const dto = validSignup();
  await rig.service.signup(dto as never);
  const code = extractCode(rig.email);
  await rig.service.verifyEmail(dto.email, code);
  const user = await prisma.companyUser.findUniqueOrThrow({
    where: { email: dto.email },
  });
  return { ...rig, dto, user };
}

/**
 * Kurulum kodunun adımı saklanır (tekrar kullanım engeli, derin denetim
 * LU-33) → aynı 30 sn'lik adımda giriş kodu reddedilir. Girişi sınayan
 * testler kurulumu bir önceki adımda yapılmış sayar.
 */
async function ageTotpStep(userId: string) {
  await prisma.companyUser.update({
    where: { id: userId },
    data: { twoFactorLastTotpStep: { decrement: 1 } },
  });
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

// ============================================================
// 2FA yaşam döngüsü
// ============================================================
describe("2FA yaşam döngüsü", () => {
  it("setup secret'ı ŞİFRELİ saklar (enc:v1:), düz metin DB'de görünmez", async () => {
    const { service, user } = await signupVerified();
    const res = await service.setupTwoFactor(user.id);
    expect(res.secret).toBeTruthy();
    expect(res.otpauthUrl).toContain("otpauth://");
    expect(res.qrDataUrl).toMatch(/^data:image/);

    const db = await prisma.companyUser.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });
    expect(db.twoFactorEnabled).toBe(false); // henüz aktif değil
    expect(db.twoFactorSecret).toMatch(/^enc:v1:/);
    expect(db.twoFactorSecret).not.toContain(res.secret);
  });

  it("enable: doğru TOTP → 8 kurtarma kodu (XXXX-XXXX); DB'de yalnız hash durur", async () => {
    const { service, user, audit } = await signupVerified();
    const { secret } = await service.setupTwoFactor(user.id);

    // yanlış kod reddedilir
    await expect(service.enableTwoFactor(user.id, "000000")).rejects.toThrow(
      /kodu hatalı/i,
    );

    const res = await service.enableTwoFactor(
      user.id,
      authenticator.generate(secret),
    );
    expect(res.ok).toBe(true);
    expect(res.recoveryCodes).toHaveLength(8);
    for (const c of res.recoveryCodes) {
      expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }

    const db = await prisma.companyUser.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorEnabled: true, twoFactorRecoveryCodes: true },
    });
    expect(db.twoFactorEnabled).toBe(true);
    expect(db.twoFactorRecoveryCodes).toHaveLength(8);
    // hash saklanır — düz kod DB'de yok
    for (const c of res.recoveryCodes) {
      expect(db.twoFactorRecoveryCodes).not.toContain(c);
    }
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.2fa_enabled" }),
    );
  });

  it("login: 2FA açıkken kodsuz → twoFactorRequired; TOTP ile token", async () => {
    const { service, user, dto } = await signupVerified();
    const { secret } = await service.setupTwoFactor(user.id);
    await service.enableTwoFactor(user.id, authenticator.generate(secret));
    await ageTotpStep(user.id);

    const noCode = (await service.login({
      email: dto.email,
      password: dto.password,
    } as never)) as { twoFactorRequired?: boolean; token?: string };
    expect(noCode.twoFactorRequired).toBe(true);
    expect(noCode.token).toBeUndefined();

    await expect(
      service.login({
        email: dto.email,
        password: dto.password,
        code: "000000",
      } as never),
    ).rejects.toThrow(/kodu hatalı/i);

    const ok = (await service.login({
      email: dto.email,
      password: dto.password,
      code: authenticator.generate(secret),
    } as never)) as { token?: string };
    expect(ok.token).toBeTruthy();
  });

  it("login: kurtarma kodu TEK kullanımlık — tüketilir, tekrarı reddedilir, audit iz bırakır", async () => {
    const { service, user, dto, audit } = await signupVerified();
    const { secret } = await service.setupTwoFactor(user.id);
    const { recoveryCodes } = await service.enableTwoFactor(
      user.id,
      authenticator.generate(secret),
    );
    const rc = recoveryCodes[0]!;

    const ok = (await service.login({
      email: dto.email,
      password: dto.password,
      code: rc,
    } as never)) as { token?: string };
    expect(ok.token).toBeTruthy();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.2fa_recovery_used" }),
    );

    const db = await prisma.companyUser.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorRecoveryCodes: true },
    });
    expect(db.twoFactorRecoveryCodes).toHaveLength(7);

    // aynı kod ikinci kez → reddedilir (replay engeli)
    await expect(
      service.login({
        email: dto.email,
        password: dto.password,
        code: rc,
      } as never),
    ).rejects.toThrow(/kodu hatalı/i);
  });

  it("kurtarma kodu normalize edilir — küçük harf/tiresiz giriş de kabul", async () => {
    const { service, user, dto } = await signupVerified();
    const { secret } = await service.setupTwoFactor(user.id);
    const { recoveryCodes } = await service.enableTwoFactor(
      user.id,
      authenticator.generate(secret),
    );
    const sloppy = recoveryCodes[1]!.toLowerCase().replace("-", " ");
    const ok = (await service.login({
      email: dto.email,
      password: dto.password,
      code: sloppy,
    } as never)) as { token?: string };
    expect(ok.token).toBeTruthy();
  });

  it("disable: kurtarma koduyla da kapatılır; secret + kodlar temizlenir", async () => {
    const { service, user, audit } = await signupVerified();
    const { secret } = await service.setupTwoFactor(user.id);
    const { recoveryCodes } = await service.enableTwoFactor(
      user.id,
      authenticator.generate(secret),
    );

    const res = await service.disableTwoFactor(user.id, recoveryCodes[0]!);
    expect(res.ok).toBe(true);

    const db = await prisma.companyUser.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorRecoveryCodes: true,
      },
    });
    expect(db.twoFactorEnabled).toBe(false);
    expect(db.twoFactorSecret).toBeNull();
    expect(db.twoFactorRecoveryCodes).toHaveLength(0);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.2fa_disabled" }),
    );

    // tekrar kurulabilir
    await expect(service.setupTwoFactor(user.id)).resolves.toBeTruthy();
  });

  it("legacy DÜZ METİN secret şeffaf okunur (lazy migration)", async () => {
    const { service, user, dto } = await signupVerified();
    const plainSecret = authenticator.generateSecret();
    await prisma.companyUser.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true, twoFactorSecret: plainSecret },
    });
    const ok = (await service.login({
      email: dto.email,
      password: dto.password,
      code: authenticator.generate(plainSecret),
    } as never)) as { token?: string };
    expect(ok.token).toBeTruthy();
  });

  it("2FA zaten açıkken setup reddedilir", async () => {
    const { service, user } = await signupVerified();
    const { secret } = await service.setupTwoFactor(user.id);
    await service.enableTwoFactor(user.id, authenticator.generate(secret));
    await expect(service.setupTwoFactor(user.id)).rejects.toThrow(/zaten açık/i);
  });
});

// ============================================================
// Parola değişimi + tokenVersion oturum geçersizleştirme
// ============================================================
describe("changePassword + tokenVersion", () => {
  const makeStrategy = () =>
    new CompanyJwtStrategy(
      { getOrThrow: () => "test-secret" } as never,
      prisma as never,
    );

  it("yanlış mevcut parola → Forbidden, tokenVersion değişmez", async () => {
    const { service, user, supabaseAuth } = await signupVerified();
    supabaseAuth.verifyPassword.mockRejectedValueOnce(new Error("bad"));
    await expect(
      service.changePassword(user.id, "yanlis", "Yeni!Parola9"),
    ).rejects.toThrow(/mevcut şifre/i);
    const db = await prisma.companyUser.findUniqueOrThrow({
      where: { id: user.id },
      select: { tokenVersion: true },
    });
    expect(db.tokenVersion).toBe(0);
  });

  it("başarılı değişim: tokenVersion artar, TAZE token döner, eski token strategy'de ölür", async () => {
    const { service, user, dto, jwt, audit } = await signupVerified();

    // parola değişiminden ÖNCE kesilmiş token (tv=0)
    const before = (await service.login({
      email: dto.email,
      password: dto.password,
    } as never)) as { token: string };
    const beforePayload = jwt.verify(before.token) as { tv?: number };
    expect(beforePayload.tv ?? 0).toBe(0);

    const res = await service.changePassword(
      user.id,
      dto.password,
      "Yeni!Parola9",
    );
    expect(res.ok).toBe(true);
    expect(res.token).toBeTruthy();

    const db = await prisma.companyUser.findUniqueOrThrow({
      where: { id: user.id },
      select: { tokenVersion: true },
    });
    expect(db.tokenVersion).toBe(1);
    // dönen taze token yeni sürümü taşır
    const freshPayload = jwt.verify(res.token) as { tv?: number };
    expect(freshPayload.tv).toBe(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.password_changed" }),
    );

    // strategy: eski token (tv=0) reddedilir, taze token (tv=1) geçer
    const strategy = makeStrategy();
    await expect(
      strategy.validate(beforePayload as never),
    ).rejects.toThrow(/oturum geçersiz/i);
    const authed = await strategy.validate(freshPayload as never);
    expect(authed.userId).toBe(user.id);
  });

  it("tv'siz eski token yalnız sürüm hiç artmadıysa geçerli (geriye uyum)", async () => {
    const { user } = await signupVerified();
    const strategy = makeStrategy();
    const payload = {
      sub: user.id,
      email: user.email,
      type: "company",
      userId: user.id,
      companyId: user.companyId,
      // tv yok — eski format
    };
    const authed = await strategy.validate(payload as never);
    expect(authed.userId).toBe(user.id);

    await prisma.companyUser.update({
      where: { id: user.id },
      data: { tokenVersion: 1 },
    });
    await expect(strategy.validate(payload as never)).rejects.toThrow(
      /oturum geçersiz/i,
    );
  });
});

// ============================================================
// Bildirim tercihleri — whitelist + merge
// ============================================================
describe("bildirim tercihleri", () => {
  it("whitelist dışı anahtar reddedilir", async () => {
    const { service, user } = await signupVerified();
    await expect(
      service.updateNotificationPrefs(user.id, { hacked: true }),
    ).rejects.toThrow(/geçersiz bildirim tercihi/i);
  });

  it("kısmi gönderim MEVCUTLA birleşir — önceki tercihler sıfırlanmaz", async () => {
    const { service, user } = await signupVerified();
    await service.updateNotificationPrefs(user.id, { invitation: false });
    await service.updateNotificationPrefs(user.id, { reminder: false });

    const db = await prisma.companyUser.findUniqueOrThrow({
      where: { id: user.id },
      select: { notificationPrefs: true },
    });
    expect(db.notificationPrefs).toMatchObject({
      invitation: false,
      reminder: false,
    });
  });

  it("boolean olmayan değer true SAYILMAZ (yalnız === true açar)", async () => {
    const { service, user } = await signupVerified();
    await service.updateNotificationPrefs(user.id, {
      invitation: "true",
      reminder: 1,
    });
    const db = await prisma.companyUser.findUniqueOrThrow({
      where: { id: user.id },
      select: { notificationPrefs: true },
    });
    expect(db.notificationPrefs).toMatchObject({
      invitation: false,
      reminder: false,
    });
  });
});

// ============================================================
// Adres defteri
// ============================================================
describe("adres defteri", () => {
  const svc = () =>
    new CompanyAddressesService(prisma as never, new AuditService(prisma as never));

  it("aynı tipte tek varsayılan — yeni varsayılan eskisini düşürür", async () => {
    const { auth } = await makeCompanyWithUser(prisma);
    const s = svc();
    const a1 = await s.create(auth, {
      type: "FATURA",
      title: "Merkez",
      addressLine: "Adres 1",
      isDefault: true,
    } as never);
    const a2 = await s.create(auth, {
      type: "FATURA",
      title: "Şube",
      addressLine: "Adres 2",
      isDefault: true,
    } as never);
    const rows = await prisma.companyAddress.findMany({
      where: { companyId: auth.companyId, type: "FATURA" },
    });
    expect(rows.find((r) => r.id === a1.id)?.isDefault).toBe(false);
    expect(rows.find((r) => r.id === a2.id)?.isDefault).toBe(true);

    // farklı tipin varsayılanına dokunulmaz
    const t1 = await s.create(auth, {
      type: "TESLIMAT",
      title: "Depo",
      addressLine: "Adres 3",
      isDefault: true,
    } as never);
    const t1Db = await prisma.companyAddress.findUniqueOrThrow({
      where: { id: t1.id },
    });
    expect(t1Db.isDefault).toBe(true);
  });

  it("IDOR: başka firmanın adresi güncellenemez/silinemez", async () => {
    const { auth: a } = await makeCompanyWithUser(prisma);
    const { auth: b } = await makeCompanyWithUser(prisma);
    const s = svc();
    const addr = await s.create(a, {
      type: "TESLIMAT",
      title: "A Deposu",
      addressLine: "Adres",
    } as never);

    await expect(
      s.update(b, addr.id, {
        type: "TESLIMAT",
        title: "Ele geçirildi",
        addressLine: "X",
      } as never),
    ).rejects.toThrow(/bulunamadı/i);
    await expect(s.remove(b, addr.id)).rejects.toThrow(/bulunamadı/i);
  });

  it("AKTİF ilanda kullanılan adres silinemez", async () => {
    const { auth, company, user } = await makeCompanyWithUser(prisma);
    const s = svc();
    const addr = await s.create(auth, {
      type: "TESLIMAT",
      title: "Depo",
      addressLine: "Adres",
    } as never);
    await makeListing(prisma, {
      companyId: company.id,
      createdById: user.id,
      status: "OPEN",
      deliveryAddressId: addr.id,
    });
    await expect(s.remove(auth, addr.id)).rejects.toThrow(
      /aktif ilanda kullanılıyor/i,
    );
  });

  it("sonuçlanmış ilandaki referans temizlenir, adres silinir", async () => {
    const { auth, company, user } = await makeCompanyWithUser(prisma);
    const s = svc();
    const addr = await s.create(auth, {
      type: "TESLIMAT",
      title: "Depo",
      addressLine: "Adres",
    } as never);
    const listing = await makeListing(prisma, {
      companyId: company.id,
      createdById: user.id,
      status: "AWARDED",
      deliveryAddressId: addr.id,
    });

    await expect(s.remove(auth, addr.id)).resolves.toEqual({ ok: true });
    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { deliveryAddressId: true },
    });
    expect(after.deliveryAddressId).toBeNull();
    expect(
      await prisma.companyAddress.count({ where: { id: addr.id } }),
    ).toBe(0);
  });
});

describe("Denetim 2026-08-23 — kurtarma kodu sertleştirme (pepper + atomik tüketim)", () => {
  it("eski pepper'sız hash ŞEFFAF kabul edilir (mevcut kullanıcılar kilitlenmez)", async () => {
    const { service, user, dto } = await signupVerified();
    const { secret } = await service.setupTwoFactor(user.id);
    await service.enableTwoFactor(user.id, authenticator.generate(secret));
    const legacyCode = "LEGACY-CODE1";
    const legacyHash = crypto
      .createHash("sha256")
      .update(`rc:${legacyCode.toUpperCase().replace(/[^A-Z0-9]/g, "")}`)
      .digest("hex");
    await prisma.companyUser.update({
      where: { id: user.id },
      data: { twoFactorRecoveryCodes: { push: legacyHash } },
    });
    const ok = (await service.login({ email: dto.email, password: dto.password, code: legacyCode } as never)) as { token?: string };
    expect(ok.token).toBeTruthy();
    const db = await prisma.companyUser.findUniqueOrThrow({ where: { id: user.id }, select: { twoFactorRecoveryCodes: true } });
    expect(db.twoFactorRecoveryCodes).not.toContain(legacyHash);
  });

  it("aynı kurtarma koduyla EŞZAMANLI iki giriş → yalnız biri geçer (koşullu updateMany)", async () => {
    const { service, user, dto } = await signupVerified();
    const { secret } = await service.setupTwoFactor(user.id);
    const { recoveryCodes } = await service.enableTwoFactor(user.id, authenticator.generate(secret));
    const rc = recoveryCodes[0]!;
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () => service.login({ email: dto.email, password: dto.password, code: rc } as never)),
    );
    const okCount = attempts.filter((a) => a.status === "fulfilled" && (a.value as { token?: string }).token).length;
    expect(okCount).toBe(1);
    const db = await prisma.companyUser.findUniqueOrThrow({ where: { id: user.id }, select: { twoFactorRecoveryCodes: true } });
    expect(db.twoFactorRecoveryCodes).toHaveLength(7);
  });
});


describe("2FA hesap bazlı deneme freni + TOTP tekrar kullanım engeli (derin denetim MU-16)", () => {
  async function totpUser() {
    const rig = await signupVerified();
    const { secret } = await rig.service.setupTwoFactor(rig.user.id);
    await rig.service.enableTwoFactor(rig.user.id, authenticator.generate(secret));
    await ageTotpStep(rig.user.id);
    const login = (code: string) =>
      rig.service.login({ email: rig.dto.email, password: rig.dto.password, code } as never);
    return { ...rig, secret, login };
  }
  const wrong = (secret: string) => (authenticator.generate(secret) === "000000" ? "111111" : "000000");

  it("5 hatalı denemeden sonra doğru kod bile 429 alır, sahibine TEK e-posta gider; pencere bitince açılır", async () => {
    const { service, secret, login, email, user } = await totpUser();
    const mailsBefore = email.send.mock.calls.length;
    for (let i = 0; i < 5; i++) {
      await expect(login(wrong(secret))).rejects.toThrow(/kodu hatalı/i);
    }
    const locked = await login(authenticator.generate(secret)).catch((e: unknown) => e);
    expect((locked as { getStatus: () => number }).getStatus()).toBe(429);
    // Kilit bildirimi yalnız pencereyi dolduran denemede (fire-and-forget).
    await new Promise((r) => setImmediate(r));
    const lockMails = email.send.mock.calls
      .slice(mailsBefore)
      .filter((c) => (c[0] as { context?: { type?: string } }).context?.type === "two_factor_locked");
    expect(lockMails).toHaveLength(1);
    // Kapatma yolu da aynı freni kullanır.
    await expect(service.disableTwoFactor(user.id, authenticator.generate(secret))).rejects.toThrow(
      /çok fazla hatalı/i,
    );

    // Pencere (15 dk) geçti → yeniden denenebilir.
    await prisma.companyUser.update({
      where: { id: user.id },
      data: { twoFactorWindowStartedAt: new Date(Date.now() - 16 * 60_000) },
    });
    const ok = (await login(authenticator.generate(secret))) as { token?: string };
    expect(ok.token).toBeTruthy();
    const db = await prisma.companyUser.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorFailedAttempts: true },
    });
    expect(db.twoFactorFailedAttempts).toBe(0); // başarı sayacı sıfırlar
  });

  it("eşzamanlı burst pencere tavanını AŞAMAZ (deneme doğrulamadan önce ayrılır)", async () => {
    const { secret, login, user } = await totpUser();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => login(wrong(secret)).catch((e: unknown) => e)),
    );
    const lockedCount = results.filter(
      (e) => (e as { getStatus?: () => number }).getStatus?.() === 429,
    ).length;
    expect(lockedCount).toBeGreaterThanOrEqual(7);
    const db = await prisma.companyUser.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorFailedAttempts: true },
    });
    expect(db.twoFactorFailedAttempts).toBe(5);
  });

  it("aynı TOTP kodu ikinci kez kabul edilmez (son adım saklanır)", async () => {
    const { secret, login } = await totpUser();
    const code = authenticator.generate(secret);
    const ok = (await login(code)) as { token?: string };
    expect(ok.token).toBeTruthy();
    await expect(login(code)).rejects.toThrow(/kodu hatalı/i);
  });

  it("kurulumda girilen TOTP kodu girişte tekrar kabul edilmez; yeniden açınca da (derin denetim LU-33)", async () => {
    const { service, user, dto } = await signupVerified();
    const login = (code: string) =>
      service.login({ email: dto.email, password: dto.password, code } as never);
    const first = await service.setupTwoFactor(user.id);
    const setupCode = authenticator.generate(first.secret);
    const { recoveryCodes } = await service.enableTwoFactor(user.id, setupCode);
    await expect(login(setupCode)).rejects.toThrow(/kodu hatalı/i);

    // Kapat (adım null'a çekilir) → yeniden kur: kurulum kodu yine saklanır.
    await service.disableTwoFactor(user.id, recoveryCodes[0]!);
    const second = await service.setupTwoFactor(user.id);
    const secondCode = authenticator.generate(second.secret);
    await service.enableTwoFactor(user.id, secondCode);
    const db = await prisma.companyUser.findUniqueOrThrow({
      where: { id: user.id },
      select: { twoFactorLastTotpStep: true },
    });
    expect(db.twoFactorLastTotpStep).not.toBeNull();
    await expect(login(secondCode)).rejects.toThrow(/kodu hatalı/i);
  });
});
