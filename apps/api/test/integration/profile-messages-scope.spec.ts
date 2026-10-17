/**
 * Profil KVKK veri-minimizasyonu (hassas alanlar yalnız company:manage) +
 * mesaj blok zorlaması okuma/inbox tarafında (karşılıklı-görünmezlik).
 */
import { CompanyProfileService } from "../../src/modules/company-profile/company-profile.service";
import { CompanyMessagesService } from "../../src/modules/company-messages/company-messages.service";
import { CompanyBlocksService } from "../../src/modules/company-blocks/company-blocks.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { FREE_PERIOD, effectiveTierOf } from "../../src/common/company/effective-tier";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("profil KVKK gate", () => {
  it("company:manage yoksa TCKN gizli + IBAN maskeli döner; varsa tam", async () => {
    const svc = new CompanyProfileService(
      prisma as never,
      {} as never,
      {} as never,
      new AuditService(prisma as never),
    );
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await prisma.company.update({
      where: { id: co.company.id },
      data: { authorizedTckn: "12345678901", iban: "TR120001", ibanHolder: "X" },
    });
    const full = await svc.get(co.company.id, true);
    expect(full.authorizedTckn).toBe("12345678901");
    expect(full.iban).toBe("TR120001");
    const limited = await svc.get(co.company.id, false);
    expect(limited.authorizedTckn).toBeNull();
    // Fix(security): null yerine maskeli — banka listesiyle aynı maskIban kuralı.
    expect(limited.iban).toBe("TR**0001");
    expect(limited.ibanHolder).toBeNull();
    // Hassas olmayan alan etkilenmez.
    expect(limited.name).toBe(full.name);
  });
});

describe("mesaj blok zorlaması (okuma + inbox)", () => {
  it("engellenince karşı taraf konuşmayı okuyamaz (404) ve inbox'ta görünmez", async () => {
    const blocks = new CompanyBlocksService(
      prisma as never,
      new AuditService(prisma as never),
    );
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
    const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
    const svc = new CompanyMessagesService(
      prisma as never,
      blocks,
      email as never,
      config as never,
    );
    const a = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const b = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const aCode = "AAAA-0001";
    await prisma.company.update({
      where: { id: a.company.id },
      data: { rothernId: aCode },
    });

    // A (satınalma=alıcı) → B'ye mesaj; başlangıçta konuşma okunur + inbox'ta var.
    await svc.send(a.auth, "satinalma", b.company.id, "merhaba");
    expect(
      (await svc.getThread(a.auth, "satinalma", b.company.id)).thread,
    ).not.toBeNull();

    // B, A'yı engeller → karşılıklı görünmezlik.
    await blocks.block(b.auth, aCode);

    await expect(
      svc.getThread(a.auth, "satinalma", b.company.id),
    ).rejects.toThrow(/bulunamadı/i);
    const threads = await svc.listThreads(a.auth, "satinalma");
    expect(threads.find((t) => t.otherPartyId === b.company.id)).toBeUndefined();
  });
});

describe("mesaj gönderme rol kapısı (salt-okunur garanti #4)", () => {
  function makeMsgService() {
    const blocks = new CompanyBlocksService(
      prisma as never,
      new AuditService(prisma as never),
    );
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
    const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
    return new CompanyMessagesService(
      prisma as never,
      blocks,
      email as never,
      config as never,
    );
  }

  it("etiket-only/onaylayıcı/rolsüz üye gönderemez VE okuyamaz; portal-yönlü rol geçer", async () => {
    const svc = makeMsgService();
    const a = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const b = await makeCompanyWithUser(prisma, { tier: "GOLD" });

    const withRoles = (roles: string[], isOwner = false) =>
      ({ ...a.auth, roles, isOwner }) as typeof a.auth;

    for (const p of [
      withRoles(["SAHIP"], true),
      withRoles(["YONETICI"]),
      withRoles(["ONAYLAYICI"]),
      withRoles([]),
    ]) {
      await expect(
        svc.send(p, "satinalma", b.company.id, "merhaba"),
      ).rejects.toThrow(/'Talep açma ve yönetme' yetkisi gerekir/);
    }
    // Portal-yönlü: satinalma'da yalnız-Satışçı da gönderemez (yön uyuşmaz).
    await expect(
      svc.send(withRoles(["SATISCI"]), "satinalma", b.company.id, "m"),
    ).rejects.toThrow(/'Talep açma ve yönetme' yetkisi gerekir/);
    await expect(
      svc.send(withRoles(["SATIN_ALMACI"]), "satis", b.company.id, "m"),
    ).rejects.toThrow(/'Teklif verme' yetkisi gerekir/);

    // Doğru yön geçer.
    await svc.send(withRoles(["SATIN_ALMACI"]), "satinalma", b.company.id, "merhaba");

    // Yetki tablosu (2026-09-05): OKUMA = portalı görüntüleme izni. Kurucu
    // (örtük görüntüleme) konuşmayı OKUR ama gönderemez; görüntüleme izni
    // olmayan (rolsüz) üye listeleyemez; yön uyuşmayan rol de okuyamaz.
    await expect(
      svc.getThread(withRoles(["SAHIP"], true), "satinalma", b.company.id),
    ).resolves.toBeDefined();
    await expect(
      svc.listThreads(withRoles([]), "satinalma"),
    ).rejects.toThrow(/görüntülemek için 'Satınalma görüntüleme' yetkisi gerekir/);
    await expect(
      svc.listThreads(withRoles(["SATISCI"]), "satinalma"),
    ).rejects.toThrow(/görüntülemek için 'Satınalma görüntüleme' yetkisi gerekir/);

    // Rozet ucu hata üretmez: rolsüz portal 0 sayılır, rollü portal sayar.
    const bAuth = { ...b.auth, roles: ["SATISCI"] } as typeof b.auth;
    expect((await svc.unreadCount(bAuth, "satis")).count).toBe(1);
    expect(
      (await svc.unreadCount(withRoles(["SAHIP"], true), "satinalma")).count,
    ).toBe(0);
    // Portal'sız toplam yalnız görebildiği tarafları sayar (rolsüz, sahip değil → 0).
    expect(
      (await svc.unreadCount({ ...b.auth, roles: [], isOwner: false } as typeof b.auth)).count,
    ).toBe(0);
    const read = await svc.getThread(
      withRoles(["SATIN_ALMACI"]),
      "satinalma",
      b.company.id,
    );
    expect(read.thread).not.toBeNull();

    // BİRLEŞİK kutu ("all", 2026-08-02): yalnız ROLÜ OLAN tarafların
    // konuşmaları döner, satırlar portal etiketi taşır; rolsüz kullanıcıda boş.
    const allRows = await svc.listThreads(withRoles(["SATIN_ALMACI"]), "all");
    expect(allRows).toHaveLength(1);
    expect(allRows[0]).toMatchObject({
      portal: "satinalma",
      otherPartyId: b.company.id,
    });
    // Yalnız Satışçı rolüyle "all": satınalma konuşması SIZMAZ.
    expect(await svc.listThreads(withRoles(["SATISCI"]), "all")).toHaveLength(0);
    expect(await svc.listThreads(withRoles([]), "all")).toHaveLength(0);
  });
});

describe("mesaj alıcı yönü paket kapısı (arayüz testi O-123)", () => {
  function makeMsgService() {
    const blocks = new CompanyBlocksService(
      prisma as never,
      new AuditService(prisma as never),
    );
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
    const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
    return new CompanyMessagesService(
      prisma as never,
      blocks,
      email as never,
      config as never,
    );
  }

  // Ücretsiz dönem: sınırlı firma = DOĞRULANMAMIŞ firma; ret metni paket değil doğrulama ister.
  it.each([
    { tier: "SILVER", status: "UNVERIFIED", text: /Alıcı olarak mesaj göndermek için firma doğrulaması gerekir/ },
    { tier: "STANDART", status: "UNVERIFIED", text: /Alıcı olarak mesaj göndermek için firma doğrulaması gerekir/ },
    { tier: "STANDART", status: "PENDING", text: /doğrulamanız inceleniyor/ },
    { tier: "STANDART", status: "REJECTED", text: /yeniden başvurun/ },
  ] as const)(
    "$status ($tier) firma ALICI yönünde yazamaz (403 TIER_REQUIRED, izni olsa da); satıcı yönü açık",
    async ({ tier, status, text }) => {
      const svc = makeMsgService();
      const a = await makeCompanyWithUser(prisma, { tier, companyVerificationStatus: status });
      const b = await makeCompanyWithUser(prisma, { tier: "GOLD" });
      // Kurucu SA+ST işlem rolleriyle kurulur → izin kapısı geçer; ret doğrulamadan.
      const err = await svc
        .send(a.auth, "satinalma", b.company.id, "merhaba")
        .catch((e: unknown) => e);
      expect(err).toMatchObject({ status: 403 });
      expect((err as { getResponse: () => unknown }).getResponse()).toMatchObject({
        code: "TIER_REQUIRED",
        minTier: "GOLD",
        verificationStatus: status,
        verifyPath: "/company/ayarlar/dogrulama",
      });
      expect(String((err as Error).message)).toMatch(text);
      expect(String((err as Error).message)).not.toMatch(/gold|silver|paket/i);
      expect(await prisma.messageThread.count()).toBe(0);
      // Satıcı yönü herkese açık (mesaj ücretsiz).
      await expect(
        svc.send(a.auth, "satis", b.company.id, "merhaba"),
      ).resolves.toMatchObject({ mine: true });
    },
  );

  it("doğrulanmış firma (saklı kademe STANDART olsa da) ALICI yönünde yazar — efektif kademe GOLD", async () => {
    const svc = makeMsgService();
    const a = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    const b = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    // JWT stratejisi auth.tier'ı efektif kademeden üretir (ücretsiz dönem: VERIFIED → GOLD).
    const auth = {
      ...a.auth,
      tier: effectiveTierOf(a.company),
    } as typeof a.auth;
    expect(auth.tier).toBe("GOLD");
    await expect(
      svc.send(auth, "satinalma", b.company.id, "merhaba"),
    ).resolves.toMatchObject({ mine: true });
  });

  describe("saklı paket (ücretsiz dönem anahtarı KAPALI)", () => {
    // Uyuyan paket kapısı: anahtar kapalıyken doğrulanmış ama Gold altı firma alıcı yönünde yazamaz.
    beforeEach(() => {
      jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it.each(["SILVER", "STANDART"] as const)(
      "doğrulanmış %s firma ALICI yönünde yazamaz (403 TIER_REQUIRED); satıcı yönü açık",
      async (tier) => {
        const svc = makeMsgService();
        const a = await makeCompanyWithUser(prisma, { tier });
        const b = await makeCompanyWithUser(prisma, { tier: "GOLD" });
        expect(effectiveTierOf(a.company)).toBe(tier);
        const err = await svc
          .send(a.auth, "satinalma", b.company.id, "merhaba")
          .catch((e: unknown) => e);
        expect(err).toMatchObject({ status: 403 });
        expect((err as { getResponse: () => unknown }).getResponse()).toMatchObject({
          code: "TIER_REQUIRED",
          minTier: "GOLD",
        });
        expect(await prisma.messageThread.count()).toBe(0);
        await expect(
          svc.send(a.auth, "satis", b.company.id, "merhaba"),
        ).resolves.toMatchObject({ mine: true });
      },
    );
  });

  it("paketi düşen firma eski ALICI konuşmasını okur ama yazamaz", async () => {
    const svc = makeMsgService();
    // Doğrulanmamış firma saklı paketiyle yaşar → paket düşüşü ücretsiz dönemde de gerçek bir durum.
    const a = await makeCompanyWithUser(prisma, { tier: "GOLD", companyVerificationStatus: "UNVERIFIED" });
    const b = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await svc.send(a.auth, "satinalma", b.company.id, "Gold iken yazdım");
    await svc.send(b.auth, "satis", a.company.id, "yanıt");

    // Paket düştü (efektif tier JWT stratejisinde hesaplanır → auth.tier).
    const downgraded = { ...a.auth, tier: "SILVER" } as typeof a.auth;
    const rows = await svc.listThreads(downgraded, "all");
    expect(rows.find((r) => r.portal === "satinalma")).toMatchObject({
      otherPartyId: b.company.id,
    });
    const thread = await svc.getThread(downgraded, "satinalma", b.company.id);
    expect(thread.messages.map((m) => m.body)).toEqual([
      "Gold iken yazdım",
      "yanıt",
    ]);
    await expect(
      svc.send(downgraded, "satinalma", b.company.id, "tekrar"),
    ).rejects.toMatchObject({ status: 403 });
    expect(thread.sendOpenByOrder).toBe(false);
  });

  // Gözden geçirme (webA-08): T-06 "mevcut siparişler erişilebilir kalır" —
  // paketi düşen alıcı SÜREN siparişin satıcısına yazabilmeli (teslimat /
  // ödeme yazışması). Sonuçlanan sipariş ya da başka firmanın siparişi
  // istisna açmaz.
  it("paketi düşen alıcı yalnız SÜREN siparişin satıcısına alıcı yönünde yazar", async () => {
    const svc = makeMsgService();
    const a = await makeCompanyWithUser(prisma, { tier: "SILVER", companyVerificationStatus: "UNVERIFIED" });
    const sup = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const done = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const order = (seller: string, status: "IN_DELIVERY" | "COMPLETED") =>
      prisma.companyOrder.create({
        data: {
          sellerCompanyId: seller,
          buyerCompanyId: a.company.id,
          amount: "100",
          status,
        },
      });
    await order(sup.company.id, "IN_DELIVERY");
    await order(done.company.id, "COMPLETED");
    // Ters yönlü sipariş (a SATICI) alıcı yönü istisnası açmaz.
    await prisma.companyOrder.create({
      data: {
        sellerCompanyId: a.company.id,
        buyerCompanyId: done.company.id,
        amount: "50",
        status: "ACCEPTED",
      },
    });

    expect(
      (await svc.getThread(a.auth, "satinalma", sup.company.id)).sendOpenByOrder,
    ).toBe(true);
    await expect(
      svc.send(a.auth, "satinalma", sup.company.id, "teslimat ne zaman?"),
    ).resolves.toMatchObject({ mine: true });

    expect(
      (await svc.getThread(a.auth, "satinalma", done.company.id)).sendOpenByOrder,
    ).toBe(false);
    await expect(
      svc.send(a.auth, "satinalma", done.company.id, "merhaba"),
    ).rejects.toMatchObject({ status: 403 });
  });
});
