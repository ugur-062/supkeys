/**
 * Banka hesabı defteri (Ayarlar → Banka Hesapları) — CRUD + tek varsayılan +
 * IBAN doğrulama + firma izolasyonu (IDOR) + sipariş kabulünde hesap seçimi
 * (IBAN elle girilmez, kayıtlı hesaptan SNAPSHOT yazılır).
 */
import { CompanyRole } from "@rothern/db";
import { CompanyBankAccountsService } from "../../src/modules/company-bank-accounts/company-bank-accounts.service";
import { CompanyOrdersService } from "../../src/modules/company-orders/services/company-orders.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { hasCompanyPermission } from "../../src/modules/company-auth/permissions/company-permissions.constants";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

const VALID_TR_IBAN = "TR330006100519786457841326";

function makeBankService(audit?: AuditService) {
  return new CompanyBankAccountsService(
    prisma as never,
    audit ?? new AuditService(prisma as never),
  );
}

function makeOrdersService() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "test" }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const notifications = new NotificationService(prisma as never);
  return new CompanyOrdersService(
    prisma as never,
    email as never,
    config as never,
    notifications,
    new AuditService(prisma as never),
    prisma as never, // RLS bypass client (testte RLS kapali -> prisma ile ayni owner)
  );
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("banka hesabı defteri — CRUD", () => {
  it("ekle/güncelle/sil; varsayılan tekildir", async () => {
    const svc = makeBankService();
    const c = await makeCompanyWithUser(prisma, { country: "TR" });

    const a1 = await svc.create(c.auth, {
      title: "TL Vadesiz",
      accountHolder: "Firma A.Ş.",
      iban: VALID_TR_IBAN,
      isDefault: true,
    });
    const a2 = await svc.create(c.auth, {
      title: "USD Hesabı",
      accountHolder: "Firma A.Ş.",
      iban: "DE89370400440532013000",
      bankName: "Deutsche Bank",
      isDefault: true, // yeni varsayılan → eskisinin bayrağı düşer
    });
    const list = await svc.list(c.company.id);
    expect(list).toHaveLength(2);
    expect(list.find((x) => x.id === a1.id)!.isDefault).toBe(false);
    expect(list.find((x) => x.id === a2.id)!.isDefault).toBe(true);

    await svc.update(c.auth, a1.id, {
      title: "TL Vadesiz — İş Bankası",
      accountHolder: "Firma A.Ş.",
      iban: VALID_TR_IBAN,
    });
    await svc.remove(c.auth, a2.id);
    const after = await svc.list(c.company.id);
    expect(after).toHaveLength(1);
    expect(after[0]!.title).toBe("TL Vadesiz — İş Bankası");
  });

  it("geçersiz TR IBAN reddedilir; başka firmanın hesabı 404 (IDOR)", async () => {
    const svc = makeBankService();
    const a = await makeCompanyWithUser(prisma, { country: "TR" });
    const b = await makeCompanyWithUser(prisma, { country: "TR" });

    await expect(
      svc.create(a.auth, {
        title: "Bozuk",
        accountHolder: "X",
        iban: "TR1234567890",
      }),
    ).rejects.toThrow(/TR IBAN/);

    const acct = await svc.create(a.auth, {
      title: "TL",
      accountHolder: "A",
      iban: VALID_TR_IBAN,
    });
    await expect(
      svc.update(b.auth, acct.id, {
        title: "Ele geçirilmiş",
        accountHolder: "B",
        iban: VALID_TR_IBAN,
      }),
    ).rejects.toThrow(/bulunamadı/);
    await expect(svc.remove(b.auth, acct.id)).rejects.toThrow(/bulunamadı/);
  });
});

describe("sipariş kabulünde banka hesabı seçimi", () => {
  async function pendingOrder() {
    const seller = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 1000,
        status: "PENDING",
      },
    });
    return { seller, buyer, order };
  }

  it("kayıtlı hesap seçilir → siparişe SNAPSHOT işlenir", async () => {
    const bank = makeBankService();
    const orders = makeOrdersService();
    const { seller, order } = await pendingOrder();
    const acct = await bank.create(seller.auth, {
      title: "TL Vadesiz",
      accountHolder: "Satıcı A.Ş.",
      iban: VALID_TR_IBAN,
      isDefault: true,
    });

    await orders.accept(seller.auth, order.id, {
      expectedDeliveryDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      bankAccountId: acct.id,
    } as never);

    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("ACCEPTED");
    expect(db.bankIban).toBe(VALID_TR_IBAN);
    expect(db.bankAccountHolder).toBe("Satıcı A.Ş.");

    // Hesap silinse de sipariş kaydı değişmez (snapshot).
    await bank.remove(seller.auth, acct.id);
    const still = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(still.bankIban).toBe(VALID_TR_IBAN);
  });

  it("başka firmanın hesabıyla kabul reddedilir; hesapsız kabul da reddedilir", async () => {
    const bank = makeBankService();
    const orders = makeOrdersService();
    const { seller, buyer, order } = await pendingOrder();
    // Alıcının (başka firmanın) hesabı — satıcı bunu kullanamaz.
    const foreign = await bank.create(buyer.auth, {
      title: "Alıcının hesabı",
      accountHolder: "Alıcı A.Ş.",
      iban: VALID_TR_IBAN,
    });

    await expect(
      orders.accept(seller.auth, order.id, {
        expectedDeliveryDate: new Date(
          Date.now() + 7 * 86_400_000,
        ).toISOString(),
        bankAccountId: foreign.id,
      } as never),
    ).rejects.toThrow(/Geçersiz banka hesabı/);

    // Banka hesabı ZORUNLU — hesap seçmeden kabul edilemez (ödeme alınamaz).
    await expect(
      orders.accept(seller.auth, order.id, {
        expectedDeliveryDate: new Date(
          Date.now() + 7 * 86_400_000,
        ).toISOString(),
      } as never),
    ).rejects.toThrow(/banka hesabı seç/i);
    const db = await prisma.companyOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(db.status).toBe("PENDING"); // onaylanmadı
  });
});

describe("IBAN maskeleme — liste yalnız yetkiliye tam döner", () => {
  const MASKED_TR_IBAN = "TR" + "*".repeat(20) + "1326";

  it("canSeeFullIban=false → maskeli (son 4 açık), ham IBAN response'ta YOK", async () => {
    const svc = makeBankService();
    const c = await makeCompanyWithUser(prisma, { country: "TR" });
    await svc.create(c.auth, {
      title: "TL Vadesiz",
      accountHolder: "Firma A.Ş.",
      iban: VALID_TR_IBAN,
    });

    const masked = await svc.list(c.company.id, false);
    expect(masked).toHaveLength(1);
    expect(masked[0]!.iban).toBe(MASKED_TR_IBAN);
    expect(JSON.stringify(masked)).not.toContain(VALID_TR_IBAN);

    // Yetkili (Kurucu) tam görür — settings ekranı + düzenleme formu.
    const full = await svc.list(c.company.id, true);
    expect(full[0]!.iban).toBe(VALID_TR_IBAN);
  });

  it("controller kapısı: tam görüm billing:manage'e (OWNER_ONLY) bağlıdır", () => {
    // list() handler'ı canSeeFullIban'ı bu izinden türetir — CRUD ile aynı eşik.
    expect(
      hasCompanyPermission([CompanyRole.SAHIP], true, "billing:manage"),
    ).toBe(true);
    expect(
      hasCompanyPermission([CompanyRole.YONETICI], false, "billing:manage"),
    ).toBe(false);
  });
});

describe("banka hesabı CRUD — critical audit izi (INV-AUDIT-1)", () => {
  const MASKED_TR_IBAN = "TR" + "*".repeat(20) + "1326";

  it("create/update/delete audit satırı bırakır; ham IBAN metadata'da YOK", async () => {
    const svc = makeBankService();
    const c = await makeCompanyWithUser(prisma, { country: "TR" });

    const acct = await svc.create(c.auth, {
      title: "TL Vadesiz",
      accountHolder: "Firma A.Ş.",
      iban: VALID_TR_IBAN,
      isDefault: true,
    });
    const createdRow = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.bank_account.created", entityId: acct.id },
    });
    expect(createdRow.actorType).toBe("company");
    expect(createdRow.actorId).toBe(c.auth.userId);
    expect(createdRow.tenantId).toBe(c.company.id);
    expect(createdRow.entityType).toBe("company_bank_account");
    expect(createdRow.metadata).toMatchObject({
      title: "TL Vadesiz",
      isDefault: true,
      ibanMasked: MASKED_TR_IBAN,
    });
    expect(JSON.stringify(createdRow.metadata)).not.toContain(VALID_TR_IBAN);

    // IBAN değişimi → changedFields + eski/yeni maskeli referans.
    await svc.update(c.auth, acct.id, {
      title: "TL Vadesiz",
      accountHolder: "Firma A.Ş.",
      iban: "DE89370400440532013000",
    });
    const updatedRow = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.bank_account.updated", entityId: acct.id },
    });
    const meta = updatedRow.metadata as Record<string, unknown>;
    expect(meta.changedFields).toEqual(
      expect.arrayContaining(["iban", "isDefault"]),
    );
    expect(meta.ibanMaskedBefore).toBe(MASKED_TR_IBAN);
    expect(meta.ibanMaskedAfter).toBe("DE" + "*".repeat(16) + "3000");
    expect(JSON.stringify(meta)).not.toContain(VALID_TR_IBAN);

    await svc.remove(c.auth, acct.id);
    const deletedRow = await prisma.auditLog.findFirstOrThrow({
      where: { action: "company.bank_account.deleted", entityId: acct.id },
    });
    expect(deletedRow.metadata).toMatchObject({
      ibanMasked: "DE" + "*".repeat(16) + "3000",
    });
  });

  it("fail-safe: audit yazımı patlasa da işlem BAŞARILI (log asla throw etmez)", async () => {
    // Gerçek AuditService + bozuk prisma → log() içindeki catch devreye girer.
    const brokenAudit = new AuditService({
      auditLog: {
        create: () => {
          throw new Error("audit DB down");
        },
      },
    } as never);
    const svc = makeBankService(brokenAudit);
    const c = await makeCompanyWithUser(prisma, { country: "TR" });

    const acct = await svc.create(c.auth, {
      title: "TL Vadesiz",
      accountHolder: "Firma A.Ş.",
      iban: VALID_TR_IBAN,
    });
    expect(acct.id).toBeTruthy(); // işlem bloklanmadı
    await svc.remove(c.auth, acct.id);
    expect(await svc.list(c.company.id)).toHaveLength(0);
  });
});

describe("banka hesabı yönetimi — yalnız Kurucu (billing:manage)", () => {
  it("banka hesabı yönetimi owner-only izne bağlıdır; Yönetici/Satışçı erişemez", () => {
    // Controller create/update/delete = @RequireCompanyPermission("billing:manage").
    // billing:manage OWNER_ONLY → yalnız Kurucu (isOwner); rol yetmez.
    expect(
      hasCompanyPermission([CompanyRole.SAHIP], true, "billing:manage"),
    ).toBe(true);
    expect(
      hasCompanyPermission([CompanyRole.YONETICI], false, "billing:manage"),
    ).toBe(false);
    expect(
      hasCompanyPermission([CompanyRole.SATISCI], false, "billing:manage"),
    ).toBe(false);
    expect(
      hasCompanyPermission(
        [CompanyRole.YONETICI, CompanyRole.SATISCI],
        false,
        "billing:manage",
      ),
    ).toBe(false);
  });
});
