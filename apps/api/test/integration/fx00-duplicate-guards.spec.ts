/**
 * Arayüz testi FX-00 — sunucu tarafı mükerrer kayıt korumaları (çift tık /
 * eşzamanlı istek). İstemci kilidi (web/admin `useSubmitLock`) ilk savunma;
 * buradaki her test aynı isteğin İKİNCİ kez (çoğu eşzamanlı) gelmesinde
 * zararlı mükerrerin oluşmadığını sınar.
 *
 * Eşzamanlılık testleri paylaşılan test istemcisini (connection_limit=1,
 * transaction'lar zaten seri) DEĞİL, çok bağlantılı ayrı bir istemci kullanır
 * (CLAUDE.md "Yarış testi ayrı istemci ister").
 */
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaClient } from "@rothern/db";
import { PRODUCT_LIMITS } from "@rothern/shared";
import { authenticator } from "otplib";
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyAuthService } from "../../src/modules/company-auth/services/company-auth.service";
import { CompanyBlocksService } from "../../src/modules/company-blocks/company-blocks.service";
import { CompanyComplaintsService } from "../../src/modules/company-complaints/company-complaints.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { CompanyItemsService } from "../../src/modules/company-items/company-items.service";
import { CompanyOrdersService } from "../../src/modules/company-orders/services/company-orders.service";
import { CompanyUsersService } from "../../src/modules/company-users/company-users.service";
import { EmailSuppressionService } from "../../src/modules/email/email-suppression.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { PublicInquiryService } from "../../src/modules/public-inquiry/public-inquiry.service";
import { TEST_DB_URL } from "./env";
import { connect, makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { extractCode, makeAuthService } from "./make-auth-service";
import { makeService } from "./make-service";
import { prisma, truncateAll } from "./test-db";

let multi: PrismaClient;

beforeAll(() => {
  const base = TEST_DB_URL.replace(/[?&]connection_limit=\d+/, "");
  multi = new PrismaClient({
    datasources: {
      db: { url: `${base}${base.includes("?") ? "&" : "?"}connection_limit=6` },
    },
  });
});
afterAll(async () => {
  await multi.$disconnect();
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

const fulfilled = <T>(rs: PromiseSettledResult<T>[]) =>
  rs.filter((r): r is PromiseFulfilledResult<T> => r.status === "fulfilled");
const rejected = (rs: PromiseSettledResult<unknown>[]) =>
  rs.filter((r): r is PromiseRejectedResult => r.status === "rejected");

const authConfig = {
  get: jest.fn((k: string) => (k === "JWT_SECRET" ? "test-secret" : undefined)),
  getOrThrow: jest.fn((k: string) => {
    if (k === "JWT_SECRET") return "test-secret";
    throw new Error(`config eksik: ${k}`);
  }),
};

/** Aynı mock'larla, çok bağlantılı istemci üzerinde ikinci bir auth servisi. */
function multiAuthService(rig: ReturnType<typeof makeAuthService>) {
  return new CompanyAuthService(
    multi as never,
    new JwtService({ secret: "test-secret", signOptions: { expiresIn: "1h" } }),
    rig.supabaseAuth as never,
    rig.audit as never,
    rig.email as never,
    authConfig as never,
    multi as never,
  );
}

const signupDto = () => ({
  firstName: "Ada",
  lastName: "Yılmaz",
  email: `fx00-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
  phone: "+90 555 111 22 33",
  password: "Guclu!Parola9",
  termsAccepted: true,
  mediationAccepted: true,
  kvkkAccepted: true,
  marketingConsent: false,
});

describe("FX-00 Y-12 — 2FA açma koşullu yazılır, gösterilen kurtarma kodları geçerli kalır", () => {
  it("eşzamanlı iki 'Doğrula & Aç'tan yalnız biri geçer; dönen kodla 2FA kapatılabilir", async () => {
    const rig = makeAuthService();
    const dto = signupDto();
    await rig.service.signup(dto as never);
    await rig.service.verifyEmail(dto.email, extractCode(rig.email));
    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: dto.email } });
    const { secret } = await rig.service.setupTwoFactor(user.id);
    const code = authenticator.generate(secret);

    const svc = multiAuthService(rig);
    const results = await Promise.allSettled([
      svc.enableTwoFactor(user.id, code),
      svc.enableTwoFactor(user.id, code),
    ]);
    const ok = fulfilled(results);
    expect(ok).toHaveLength(1);
    expect(String(rejected(results)[0]?.reason?.message)).toMatch(/zaten açık/i);

    // Kullanıcıya gösterilen set veritabanındaki settir: kurtarma koduyla kapanır.
    const shown = ok[0]!.value.recoveryCodes[0]!;
    await expect(rig.service.disableTwoFactor(user.id, shown)).resolves.toEqual({ ok: true });
  });

  it("ardışık ikinci açma isteği kodları YENİDEN YAZMAZ", async () => {
    const rig = makeAuthService();
    const dto = signupDto();
    await rig.service.signup(dto as never);
    await rig.service.verifyEmail(dto.email, extractCode(rig.email));
    const user = await prisma.companyUser.findUniqueOrThrow({ where: { email: dto.email } });
    const { secret } = await rig.service.setupTwoFactor(user.id);
    const first = await rig.service.enableTwoFactor(user.id, authenticator.generate(secret));
    await expect(
      rig.service.enableTwoFactor(user.id, authenticator.generate(secret)),
    ).rejects.toThrow(/zaten açık/i);
    await expect(
      rig.service.disableTwoFactor(user.id, first.recoveryCodes[1]!),
    ).resolves.toEqual({ ok: true });
  });
});

describe("FX-00 D-064 — tek kullanımlık doğrulama kodu atomik tüketilir", () => {
  it("aynı kodla eşzamanlı iki doğrulama yalnız BİR oturum açar", async () => {
    const rig = makeAuthService();
    const dto = signupDto();
    await rig.service.signup(dto as never);
    const code = extractCode(rig.email);
    const svc = multiAuthService(rig);
    const results = await Promise.allSettled([
      svc.verifyEmail(dto.email, code),
      svc.verifyEmail(dto.email, code),
      svc.verifyEmail(dto.email, code),
    ]);
    const sessions = fulfilled(results).filter(
      (r) => !("alreadyVerified" in (r.value as object)),
    );
    expect(sessions).toHaveLength(1);
  });
});

describe("FX-00 O-001 — aynı adrese eşzamanlı ekip daveti tek kayıt", () => {
  it("üç paralel davetten biri geçer, tek bekleyen davet + tek e-posta", async () => {
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
    const svc = new CompanyUsersService(
      multi as never,
      { createUser: jest.fn(), deleteUser: jest.fn() } as never,
      { createSession: jest.fn() } as never,
      email as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      new AuditService(multi as never),
    );
    const dto = { email: "yeni.uye@test.local", permissions: ["sell:view"] };
    const results = await Promise.allSettled([
      svc.invite(owner.auth, dto as never),
      svc.invite(owner.auth, dto as never),
      svc.invite(owner.auth, dto as never),
    ]);
    expect(fulfilled(results)).toHaveLength(1);
    expect(rejected(results).every((r) => r.reason instanceof ConflictException)).toBe(true);
    expect(
      await prisma.companyUserInvitation.count({
        where: { companyId: owner.company.id, email: dto.email, status: "PENDING" },
      }),
    ).toBe(1);
    expect(email.send).toHaveBeenCalledTimes(1);
  });
});

describe("FX-00 O-002 — ödeme bildiriminin tekrarı mükerrer kayıt açmaz", () => {
  function orders() {
    return new CompanyOrdersService(
      prisma as never,
      { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) } as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      new NotificationService(prisma as never),
      new AuditService(prisma as never),
      prisma as never,
    );
  }

  it("aynı tutar + notla ikinci bildirim 409; farklı notla kayıt açılır", async () => {
    const svc = orders();
    const seller = await makeCompanyWithUser(prisma);
    const buyer = await makeCompanyWithUser(prisma);
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 5000,
        status: "DELIVERED",
        paymentTiming: "AFTER_DELIVERY",
        deliveredAt: new Date(),
      },
    });
    const input = { amount: 1000.5, note: "Dekont 42" };
    await svc.recordPayment(buyer.auth, order.id, input as never);
    await expect(svc.recordPayment(buyer.auth, order.id, input as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await svc.recordPayment(buyer.auth, order.id, { amount: 1000.5, note: "Dekont 43" } as never);
    expect(
      await prisma.companyOrderPayment.count({
        where: { orderId: order.id, status: "AWAITING_CONFIRMATION" },
      }),
    ).toBe(2);
  });

  it("aynı tutarlı vadeli çek serisi (farklı çek no / vade) mükerrer sayılmaz; birebir aynı çek 409", async () => {
    const svc = orders();
    const seller = await makeCompanyWithUser(prisma);
    const buyer = await makeCompanyWithUser(prisma);
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 9000,
        status: "DELIVERED",
        paymentTiming: "AFTER_DELIVERY",
        deliveredAt: new Date(),
      },
    });
    const cheque = (no: string, due: string) => ({
      amount: 1000,
      method: "Çek",
      chequeNo: no,
      chequeBank: "Banka",
      chequeDueDate: due,
    });
    await svc.recordPayment(buyer.auth, order.id, cheque("C-1", "2026-11-01") as never);
    await svc.recordPayment(buyer.auth, order.id, cheque("C-2", "2026-12-01") as never);
    await svc.recordPayment(buyer.auth, order.id, cheque("C-3", "2027-01-01") as never);
    await expect(
      svc.recordPayment(buyer.auth, order.id, cheque("C-3", "2027-01-01") as never),
    ).rejects.toBeInstanceOf(ConflictException);
    // Aynı tutar ama başka yöntem (havale) de ayrı bildirimdir.
    await svc.recordPayment(buyer.auth, order.id, { amount: 1000, method: "Havale" } as never);
    expect(
      await prisma.companyOrderPayment.count({
        where: { orderId: order.id, status: "AWAITING_CONFIRMATION" },
      }),
    ).toBe(4);
  });
});

describe("FX-00 O-006/O-061/O-070 — ürün ve katalog yazımları firma kilidinde", () => {
  const items = (db: unknown) =>
    new CompanyItemsService(db as never, { log: jest.fn() } as never, {} as never);
  let seq = 0;
  const draft = (companyId: string, userId: string, over: Record<string, unknown> = {}) => {
    seq += 1;
    return prisma.companyItem.create({
      data: {
        companyId,
        createdById: userId,
        name: `Ürün ${seq}`,
        unit: "adet",
        categoryId: "39121000",
        description: "y".repeat(120),
        images: ["a.webp"],
        keywords: ["pano"],
        isPublic: false,
        ...over,
      },
    });
  };

  it("O-006: aynı adla ikinci 'yeni ürün' 409 alır (tek taslak)", async () => {
    const { company, auth } = await makeCompanyWithUser(prisma);
    const svc = items(prisma);
    await svc.createProduct(auth, { name: "Dağıtım panosu" });
    await expect(svc.createProduct(auth, { name: "Dağıtım panosu" })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await prisma.companyItem.count({ where: { companyId: company.id } })).toBe(1);
  });

  it("O-006: aynı adlı iki ürün eşzamanlı onaya gönderilince slug çakışmaz", async () => {
    const { company, user, auth } = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const a = await draft(company.id, user.id, { name: "Kablo kanalı" });
    const b = await draft(company.id, user.id, { name: "Kablo kanalı" });
    const svc = items(multi);
    const results = await Promise.allSettled([svc.publish(auth, a.id), svc.publish(auth, b.id)]);
    expect(fulfilled(results)).toHaveLength(2);
    const rows = await prisma.companyItem.findMany({
      where: { companyId: company.id },
      select: { slug: true, reviewStatus: true },
    });
    expect(new Set(rows.map((r) => r.slug)).size).toBe(2);
    expect(rows.every((r) => r.reviewStatus === "PENDING")).toBe(true);
  });

  it("O-061: talepten kataloğa eşzamanlı iki içe aktarma kalemleri iki kez yazmaz", async () => {
    const { company, user, auth } = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, { companyId: company.id, createdById: user.id });
    for (let i = 1; i <= 5; i += 1) {
      await makeItem(prisma, listing.id, { name: `Kalem ${i}`, unit: "adet", lineNo: i });
    }
    const svc = items(multi);
    const results = await Promise.allSettled([
      svc.importFromListing(auth, listing.id),
      svc.importFromListing(auth, listing.id),
    ]);
    expect(fulfilled(results)).toHaveLength(2);
    expect(await prisma.companyItem.count({ where: { companyId: company.id } })).toBe(5);
  });

  it("O-070: tavana 3 kala 5 eşzamanlı arşivden geri alma → 3 geçer, 2 reddedilir", async () => {
    const limit = PRODUCT_LIMITS.STANDART!;
    const std = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    for (let i = 0; i < limit - 3; i += 1) {
      await draft(std.company.id, std.user.id, { isPublic: true, publishedAt: new Date(), slug: `p-${i}` });
    }
    const archived = [];
    for (let i = 0; i < 5; i += 1) {
      archived.push(
        await draft(std.company.id, std.user.id, {
          isPublic: true,
          publishedAt: new Date(),
          slug: `a-${i}`,
          isActive: false,
        }),
      );
    }
    const svc = items(multi);
    const results = await Promise.allSettled(archived.map((a) => svc.setActive(std.auth, a.id, true)));
    expect(fulfilled(results)).toHaveLength(3);
    expect(rejected(results).every((r) => r.reason instanceof ForbiddenException)).toBe(true);
    expect(
      await prisma.companyItem.count({
        where: { companyId: std.company.id, isActive: true, isPublic: true },
      }),
    ).toBe(limit);
  });
});

describe("FX-00 O-115 / O-031 — şikayet ve bilgi talebi eşzamanlı tekrarda tek kayıt", () => {
  it("O-115: aynı firmaya eşzamanlı iki şikayetten biri geçer", async () => {
    const me = await makeCompanyWithUser(prisma);
    const other = await makeCompanyWithUser(prisma);
    await prisma.company.update({ where: { id: other.company.id }, data: { rothernId: "TEST-0777" } });
    const svc = new CompanyComplaintsService(multi as never);
    const input = { rothernId: "TEST-0777", reason: "Sahte teklif" };
    const results = await Promise.allSettled([svc.file(me.auth, input), svc.file(me.auth, input)]);
    expect(fulfilled(results)).toHaveLength(1);
    expect(rejected(results)[0]?.reason).toBeInstanceOf(ConflictException);
    expect(await prisma.companyComplaint.count({ where: { againstCompanyId: other.company.id } })).toBe(1);
  });

  it("O-031: aynı ürüne eşzamanlı iki kayıtlı bilgi talebinden biri geçer", async () => {
    const seller = await makeCompanyWithUser(prisma);
    await prisma.company.update({
      where: { id: seller.company.id },
      data: { slug: "fx00-satici", publicEnabled: true },
    });
    await prisma.companyItem.create({
      data: {
        companyId: seller.company.id,
        createdById: seller.user.id,
        name: "Dağıtım panosu",
        unit: "adet",
        slug: "fx00-pano",
        isPublic: true,
        publishedAt: new Date(),
        description: "x".repeat(120),
        images: ["a.webp"],
        keywords: ["pano"],
      },
    });
    const buyer = await makeCompanyWithUser(prisma);
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "x", sent: true }) };
    const svc = new PublicInquiryService(multi as never, email as never);
    const payload = {
      companyId: buyer.company.id,
      email: buyer.user.email,
      fullName: "Ayşe Demir",
      companySlug: "fx00-satici",
      productSlug: "fx00-pano",
      message: "Bu ürün için fiyat ve teslim süresi bilgisi rica ederim.",
    };
    const results = await Promise.allSettled([svc.createAsCompany(payload), svc.createAsCompany(payload)]);
    expect(fulfilled(results)).toHaveLength(1);
    expect(await prisma.publicInquiry.count({ where: { claimedCompanyId: buyer.company.id } })).toBe(1);
  });
});

describe("FX-00 O-093 — kayıtsız adrese eşzamanlı bağlantı daveti tek e-posta", () => {
  it("iki paralel davetten biri geçer, davet e-postası bir kez gider", async () => {
    const me = await makeCompanyWithUser(prisma, { tier: "SILVER" });
    const audit = new AuditService(multi as never);
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
    const svc = new CompanyConnectionsService(
      multi as never,
      multi as never,
      new CompanyBlocksService(multi as never, audit),
      email as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      { pushToCompany: jest.fn().mockResolvedValue(1), pushToUser: jest.fn().mockResolvedValue(1) } as never,
      audit,
    );
    const results = await Promise.allSettled([
      svc.inviteByEmail(me.auth, "kayitsiz@firma.test"),
      svc.inviteByEmail(me.auth, "kayitsiz@firma.test"),
    ]);
    expect(fulfilled(results)).toHaveLength(1);
    expect(String(rejected(results)[0]?.reason?.response?.code ?? rejected(results)[0]?.reason?.code ?? "")).toBe(
      "ALREADY_INVITED",
    );
    expect(email.send).toHaveBeenCalledTimes(1);
  });
});

describe("FX-00 O-007 — aynı duyurunun tekrarı reddedilir", () => {
  it("ikinci 'Evet, Gönder' 409 alır, firmalara ikinci bildirim gitmez", async () => {
    const notifications = { pushToCompany: jest.fn().mockResolvedValue(1) };
    const service = new AdminCompaniesService(
      prisma as never,
      {} as never,
      { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) } as never,
      notifications as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      new AuditService(prisma as never),
      new EmailSuppressionService(prisma as never),
    );
    await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const input = { subject: "Bakım", message: "Planlı bakım bildirimi", tier: "GOLD" as const };
    const results = await Promise.allSettled([
      service.announce(input, "admin-1"),
      service.announce(input, "admin-1"),
    ]);
    expect(fulfilled(results)).toHaveLength(1);
    expect(rejected(results)[0]?.reason).toBeInstanceOf(ConflictException);
    expect(notifications.pushToCompany).toHaveBeenCalledTimes(2);
    // Sıralı tekrar da (süreç içi hak düşse bile denetim kaydından) reddedilir.
    const fresh = new AdminCompaniesService(
      prisma as never,
      {} as never,
      { send: jest.fn() } as never,
      notifications as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      new AuditService(prisma as never),
      new EmailSuppressionService(prisma as never),
    );
    await expect(fresh.announce(input, "admin-1")).rejects.toBeInstanceOf(ConflictException);
    // Farklı içerik serbest.
    await expect(
      fresh.announce({ ...input, subject: "Başka konu" }, "admin-1"),
    ).resolves.toMatchObject({ delivered: 2 });
  });

  it("aynı konulu duyuru başka segmente / e-postalı gönderilebilir; hedef sorgusu hata verirse yeniden deneme 409 almaz", async () => {
    const notifications = { pushToCompany: jest.fn().mockResolvedValue(1) };
    const make = () =>
      new AdminCompaniesService(
        prisma as never,
        {} as never,
        { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) } as never,
        notifications as never,
        { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
        new AuditService(prisma as never),
        new EmailSuppressionService(prisma as never),
      );
    await makeCompanyWithUser(prisma, { tier: "GOLD", country: "TR" });
    await makeCompanyWithUser(prisma, { tier: "GOLD", country: "DE" });
    const base = { subject: "Kampanya", message: "Yeni dönem", tier: "GOLD" as const };
    const service = make();
    await expect(service.announce({ ...base, country: "TR" }, "admin-2")).resolves.toMatchObject({
      delivered: 1,
    });
    // Aynı konu, farklı ülke → gerçek mükerrer değil (yeni örnek: süreç içi hak yok, yalnız denetim kaydı).
    await expect(make().announce({ ...base, country: "DE" }, "admin-2")).resolves.toMatchObject({
      delivered: 1,
    });
    // Aynı segment, bu kez e-postalı → ayrı duyuru.
    await expect(
      make().announce({ ...base, country: "TR", sendEmail: true }, "admin-2"),
    ).resolves.toMatchObject({ delivered: 1 });
    // Birebir tekrar hâlâ reddedilir.
    await expect(make().announce({ ...base, country: "DE" }, "admin-2")).rejects.toBeInstanceOf(
      ConflictException,
    );

    // Gönderim hiçbir firmaya ulaşmadan hata verirse hak bırakılır.
    const flaky = make();
    const realFindMany = prisma.company.findMany.bind(prisma.company);
    const spy = jest
      .spyOn(prisma.company, "findMany")
      .mockRejectedValueOnce(new Error("db down") as never);
    const retryInput = { ...base, subject: "Yeniden deneme" };
    await expect(flaky.announce(retryInput, "admin-2")).rejects.toThrow("db down");
    spy.mockImplementation(realFindMany as never);
    await expect(flaky.announce(retryInput, "admin-2")).resolves.toMatchObject({ delivered: 2 });
    spy.mockRestore();
  });
});

describe("FX-00 D-177 — davet bildirimi davet başına tek gönderim", () => {
  it("açılış duyurusunun bildirdiği bağlantıya elle davet yolu ikinci e-posta atmaz", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const conn = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    await prisma.company.update({ where: { id: conn.company.id }, data: { billingEmail: "bagli@fx00.test" } });
    await connect(prisma, owner.company.id, conn.company.id, owner.user.id);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      visibility: "PUBLIC",
      number: "ROT-000177",
      closesAt: new Date(Date.now() + 5 * 86_400_000),
    });
    await makeItem(prisma, listing.id, { name: "Boru", unit: "adet" });

    await service.announceListingOpen(listing.id, "invitation");
    const waitInvites = async () => {
      for (let i = 0; i < 60; i += 1) {
        const n = email.send.mock.calls.filter(
          (c) => (c[0] as { to: { email: string } }).to.email === "bagli@fx00.test",
        ).length;
        if (n > 0) return n;
        await new Promise((r) => setTimeout(r, 50));
      }
      return 0;
    };
    expect(await waitInvites()).toBe(1);
    const inv = await prisma.listingInvitation.findFirstOrThrow({
      where: { listingId: listing.id, invitedCompanyId: conn.company.id },
    });
    expect(inv.notifiedAt).not.toBeNull();

    // Yarışan elle davet yolu aynı davetliyi yeniden bildirmeye çalışır.
    await (
      service as unknown as {
        notifyAddedInvitees: (l: unknown, ids: string[]) => Promise<void>;
      }
    ).notifyAddedInvitees(listing, [conn.company.id]);
    await new Promise((r) => setTimeout(r, 200));
    expect(
      email.send.mock.calls.filter(
        (c) => (c[0] as { to: { email: string } }).to.email === "bagli@fx00.test",
      ),
    ).toHaveLength(1);
  });
});

describe("FX-00 D-272 — teklif geçerliliği uzatması koşullu yazılır", () => {
  it("okuma ile yazma arasında süre değiştiyse (eşzamanlı ikinci uzatma) 409, süre bir kez uzar", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const bidder = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      visibility: "PUBLIC",
      status: "OPEN",
      closesAt: new Date(Date.now() + 5 * 86_400_000),
    });
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: 500,
      status: "SUBMITTED",
      submittedAt: new Date(Date.now() - 86_400_000),
      validityDays: 30,
    });
    // Eşzamanlı ilk istek: bu istek teklifi okuduktan hemen sonra diğeri
    // süreyi 37'ye yazmış olsun.
    const realFind = prisma.listingBid.findUnique.bind(prisma.listingBid);
    const spy = jest
      .spyOn(prisma.listingBid, "findUnique")
      .mockImplementationOnce(((args: unknown) =>
        realFind(args as never).then(async (row: unknown) => {
          await prisma.listingBid.update({ where: { id: bid.id }, data: { validityDays: 37 } });
          return row;
        })) as never);
    try {
      await expect(service.extendBidValidity(bidder.auth, listing.id, 7)).rejects.toBeInstanceOf(
        ConflictException,
      );
    } finally {
      spy.mockRestore();
    }
    const after = await prisma.listingBid.findUniqueOrThrow({ where: { id: bid.id } });
    expect(after.validityDays).toBe(37);
    // Sıradaki (bayat olmayan) uzatma serbest.
    await expect(service.extendBidValidity(bidder.auth, listing.id, 7)).resolves.toBeDefined();
    const final = await prisma.listingBid.findUniqueOrThrow({ where: { id: bid.id } });
    expect(final.validityDays).toBe(44);
  });
});
