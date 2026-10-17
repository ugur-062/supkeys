/**
 * ÜCRETSİZ DÖNEM SÖZLEŞMESİ (sahip kararı 2026-10-07) — tek anahtar
 * `FREE_PERIOD.VERIFIED_HAS_FULL_ACCESS` (`effective-tier.ts`).
 *
 *  1) DOĞRULANMIŞ firma saklı kademesi STANDART olsa da eskiden paket isteyen
 *     kapılardan geçer; /me ve JWT kimliği EFEKTİF kademeyi taşır.
 *  2) UNVERIFIED / PENDING / REJECTED firma (saklı STANDART) aynı kapılarda
 *     reddedilir; metin DOĞRULAMA ister, paket sözcüğü geçmez.
 *  3) Doğrulanmamış ama süresi dolmamış saklı GOLD'u olan firma erişimini korur.
 *  4) Paket satın alma giriş noktası 410 döner, hiçbir şey yazmaz.
 *  5) Anahtar kapatılınca saklı kademe davranışı geri gelir.
 *
 * Kimlik nesnesi elle kurulmaz: gerçek `CompanyJwtStrategy.validate` üretir
 * (efektif kademe kapılara istekte olduğu gibi ulaşsın).
 */
import { PRODUCT_LIMITS } from "@rothern/shared";
import { FREE_PERIOD } from "../../src/common/company/effective-tier";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyBlocksService } from "../../src/modules/company-blocks/company-blocks.service";
import {
  CompanyJwtStrategy,
  type AuthenticatedCompanyUser,
} from "../../src/modules/company-auth/strategies/company-jwt.strategy";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { CompanyItemsService } from "../../src/modules/company-items/company-items.service";
import { makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { makeAuthService } from "./make-auth-service";
import { makeService } from "./make-service";
import { prisma, truncateAll } from "./test-db";

type Status = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
type Tier = "STANDART" | "SILVER" | "GOLD";

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);
const LIMIT = PRODUCT_LIMITS.STANDART as number;
/** Kullanıcıya dönen hiçbir ret metni paket/üyelik anmaz. */
const PACKAGE_WORDS = /silver|gold|paket|premium|üyelik|standart/i;
/** Duruma özel doğrulama metni (UNVERIFIED'da kapının bağlam metni). */
const WORDING: Record<Exclude<Status, "VERIFIED">, RegExp> = {
  UNVERIFIED: /doğrula/i,
  PENDING: /doğrulamanız inceleniyor/i,
  REJECTED: /yeniden başvurun/i,
};

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

const strategy = new CompanyJwtStrategy(
  { getOrThrow: () => "test-secret" } as never,
  prisma as never,
  { isRevoked: async () => false } as never,
);

/** Firma + gerçek JWT strategy'den geçmiş kimlik (efektif kademe + doğrulama durumu). */
async function company(tier: Tier, status: Status, membershipEndAt: Date | null = null) {
  const co = await makeCompanyWithUser(prisma, { country: "TR", tier, companyVerificationStatus: status });
  if (membershipEndAt) {
    await prisma.company.update({ where: { id: co.company.id }, data: { membershipEndAt } });
  }
  const auth: AuthenticatedCompanyUser = await strategy.validate({
    sub: co.user.id,
    email: co.user.email,
    type: "company",
    userId: co.user.id,
    companyId: co.company.id,
    tv: 0,
  });
  return { ...co, auth };
}

function connections() {
  const audit = new AuditService(prisma as never);
  return new CompanyConnectionsService(
    prisma as never,
    prisma as never,
    new CompanyBlocksService(prisma as never, audit),
    { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) } as never,
    { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
    { pushToCompany: jest.fn().mockResolvedValue(1), pushToUser: jest.fn().mockResolvedValue(1) } as never,
    audit,
  );
}
const items = () =>
  new CompanyItemsService(prisma as never, { log: jest.fn() } as never, {} as never);

let seq = 0;
/** Bağlantısız, davetsiz bir alıcının herkese açık talebi + davet edilecek firmanın Rothern ID'si. */
async function world() {
  const buyer = await makeCompanyWithUser(prisma, { country: "TR" });
  const listing = await makeListing(prisma, {
    companyId: buyer.company.id,
    createdById: buyer.user.id,
    type: "ALIM",
    status: "OPEN",
    visibility: "PUBLIC",
    closesAt: FUTURE,
    publishedAt: new Date(),
    number: `ROT-${String(700000 + ++seq)}`,
  });
  const item = await makeItem(prisma, listing.id);
  const rothernId = `FREE-${String(1000 + seq)}`;
  await prisma.company.update({ where: { id: buyer.company.id }, data: { rothernId } });
  return { buyer, listing, item, rothernId };
}

/** Ücretsiz tavan DOLU (tavan kadar yayında ürün) + arşivde bir yayın ürünü → geri alma tavanı aşar. */
async function fullShowcase(companyId: string, userId: string) {
  const base = {
    companyId,
    createdById: userId,
    unit: "adet",
    isPublic: true,
    publishedAt: new Date(),
  };
  await prisma.companyItem.createMany({
    data: Array.from({ length: LIMIT }, (_, i) => ({ ...base, name: `Ürün ${i}`, slug: `urun-${i}` })),
  });
  return prisma.companyItem.create({
    data: { ...base, name: "Arşivli", slug: "arsivli", isActive: false },
  });
}

const tenderDto = (over: Record<string, unknown> = {}) =>
  ({
    type: "ALIM",
    format: "RFQ",
    isInternational: false,
    visibility: "PUBLIC",
    title: "Ücretsiz dönem alım talebi",
    closesAt: FUTURE.toISOString(),
    items: [{ name: "Kalem", quantity: 1, unit: "adet" }],
    asDraft: false,
    ...over,
  }) as never;
const bidDto = (itemId: string) =>
  ({ items: [{ itemId, unitPrice: 100 }], deliveryDate: FUTURE.toISOString(), validityDays: 30 }) as never;

/** Dört temsilî kapı: talep yayınlama, bağlantısız PUBLIC'e teklif, bağlantı daveti, tavan üstü ürün. */
async function gates(co: Awaited<ReturnType<typeof company>>) {
  const { service: listings } = makeService();
  const w = await world();
  const archived = await fullShowcase(co.company.id, co.user.id);
  return {
    w,
    publishTender: () => listings.create(co.auth, tenderDto()),
    viewPublic: () => listings.getOne(co.auth, w.listing.id),
    quote: () => listings.placeBid(co.auth, w.listing.id, bidDto(w.item.id)),
    invite: () => connections().invite(co.auth, w.rothernId),
    overCap: () => items().setActive(co.auth, archived.id, true),
  };
}

const refusal = (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error("beklenen 403 gelmedi");
    },
    (e: { status?: number; message: string; getResponse?: () => unknown }) => e,
  );

describe("ücretsiz dönem — anahtar AÇIK (canlı davranış)", () => {
  it("anahtar açık gelir", () => {
    expect(FREE_PERIOD.VERIFIED_HAS_FULL_ACCESS).toBe(true);
  });

  it("(1) DOĞRULANMIŞ + saklı STANDART: dört kapıdan geçer; /me ve JWT kimliği efektif kademeyi taşır", async () => {
    const co = await company("STANDART", "VERIFIED");
    // Saklı kademe değişmedi; yüzeyler efektif kademeyi (en üst) gösterir.
    expect(co.company.tier).toBe("STANDART");
    expect(co.auth.tier).toBe("GOLD");
    const me = await makeAuthService().service.getMe(co.user.id);
    expect(me.company.tier).toBe("GOLD");

    const g = await gates(co);
    await expect(g.publishTender()).resolves.toMatchObject({ status: "OPEN" });
    await expect(g.viewPublic()).resolves.toMatchObject({ canBid: true });
    await expect(g.quote()).resolves.toBeDefined();
    await expect(g.invite()).resolves.toMatchObject({ status: "PENDING" });
    await expect(g.overCap()).resolves.toBeTruthy();
    expect(
      await prisma.companyItem.count({ where: { companyId: co.company.id, isActive: true, isPublic: true } }),
    ).toBe(LIMIT + 1);
    // Hiçbir şey saklı kademeyi yükseltmedi.
    expect((await prisma.company.findUniqueOrThrow({ where: { id: co.company.id } })).tier).toBe("STANDART");
  });

  it.each(["UNVERIFIED", "PENDING", "REJECTED"] as const)(
    "(2) %s + saklı STANDART: aynı kapılarda 403; metin doğrulama ister, paket sözcüğü yok; hiçbir şey yazılmaz",
    async (status) => {
      const co = await company("STANDART", status);
      expect(co.auth.tier).toBe("STANDART");
      expect(co.auth.companyVerificationStatus).toBe(status);
      expect((await makeAuthService().service.getMe(co.user.id)).company.tier).toBe("STANDART");

      const g = await gates(co);
      for (const [name, run] of [
        ["publishTender", g.publishTender],
        ["viewPublic", g.viewPublic],
        ["quote", g.quote],
        ["invite", g.invite],
        ["overCap", g.overCap],
      ] as const) {
        const err = await refusal(run());
        expect({ gate: name, status: err.status }).toEqual({ gate: name, status: 403 });
        expect(`${name}: ${err.message}`).toMatch(WORDING[status]);
        expect(`${name}: ${err.message}`).not.toMatch(PACKAGE_WORDS);
        expect(err.getResponse?.()).toMatchObject({
          verificationStatus: status,
          verifyPath: "/company/ayarlar/dogrulama",
        });
      }
      // UNVERIFIED kapının kendi bağlam metnini alır (her kapı ne için doğrulama gerektiğini söyler).
      if (status === "UNVERIFIED") {
        expect((await refusal(g.publishTender())).message).toMatch(/satın alma talebi açmak için firma doğrulaması gerekir/i);
        expect((await refusal(g.invite())).message).toMatch(/bağlantı daveti göndermek için firma doğrulaması gerekir/i);
        expect((await refusal(g.overCap())).message).toMatch(new RegExp(`en fazla ${LIMIT} ürün`));
      }
      // Kilit kartı sözleşmesi: görünürlük reddi TIER_REQUIRED kodunu korur.
      expect((await refusal(g.viewPublic())).getResponse?.()).toMatchObject({ code: "TIER_REQUIRED" });

      expect(await prisma.listing.count({ where: { companyId: co.company.id } })).toBe(0);
      expect(await prisma.listingBid.count()).toBe(0);
      expect(await prisma.companyConnection.count()).toBe(0);
      expect(
        await prisma.companyItem.count({ where: { companyId: co.company.id, isActive: true, isPublic: true } }),
      ).toBe(LIMIT);
    },
  );

  it("(3) DOĞRULANMAMIŞ + süresi dolmamış saklı GOLD: erişimini korur; süresi dolmuşsa sınırlıdır", async () => {
    const co = await company("GOLD", "UNVERIFIED", FUTURE);
    expect(co.auth.tier).toBe("GOLD");
    expect((await makeAuthService().service.getMe(co.user.id)).company.tier).toBe("GOLD");

    const g = await gates(co);
    await expect(g.viewPublic()).resolves.toMatchObject({ canBid: true });
    await expect(g.invite()).resolves.toMatchObject({ status: "PENDING" });
    await expect(g.overCap()).resolves.toBeTruthy();
    // Kademe kapısı açık: talep TASLAĞI açılır. Doğrudan yayın ve bağlantısız
    // alıcıya teklif ayrıca INV-KYC-1'e (para taahhüdü) tabidir — bu kural kademe
    // değil doğrulama kuralıdır, ücretsiz dönemden önce de vardı; metni paket anmaz.
    const { service: listings } = makeService();
    await expect(listings.create(co.auth, tenderDto({ asDraft: true }))).resolves.toMatchObject({ status: "DRAFT" });
    for (const run of [g.publishTender, g.quote]) {
      const kyc = await refusal(run());
      expect(kyc.status).toBe(403);
      expect(kyc.message).toMatch(/doğrulamanız tamamlanmadan/i);
      expect(kyc.message).not.toMatch(PACKAGE_WORDS);
    }

    // Saklı paketin süresi dolunca doğrulanmamış firma STANDART sınırlarına döner.
    const expired = await company("GOLD", "UNVERIFIED", new Date(Date.now() - 60_000));
    expect(expired.auth.tier).toBe("STANDART");
    await expect(connections().invite(expired.auth, g.w.rothernId)).rejects.toMatchObject({ status: 403 });
  });

  it.each(["VERIFIED", "UNVERIFIED"] as const)(
    "(4) paket satın alma giriş noktası (%s firma) 410 FREE_PERIOD döner ve hiçbir şey yazmaz",
    async (status) => {
      // Self-servis bayrağı açık olsa da: ücretsiz dönemde satın alınacak bir şey yok.
      const { service, audit, email } = makeAuthService({ PREMIUM_SELF_UPGRADE_ENABLED: "true" });
      const co = await company("STANDART", status);
      const before = await prisma.company.findUniqueOrThrow({ where: { id: co.company.id } });

      const err = await refusal(service.upgradeToPremium(co.user.id, co.company.id));
      expect(err.status).toBe(410);
      expect(err.getResponse?.()).toMatchObject({ code: "FREE_PERIOD", statusCode: 410 });
      expect(err.message).toMatch(/doğrulama/i);
      expect(err.message).not.toMatch(PACKAGE_WORDS);

      const after = await prisma.company.findUniqueOrThrow({ where: { id: co.company.id } });
      expect(after).toEqual(before); // kademe, üyelik bitişi, updatedAt dahil hiçbir kolon değişmedi
      expect(await prisma.companyMembershipEvent.count()).toBe(0);
      expect(audit.log).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    },
  );
});

describe("ücretsiz dönem — anahtar KAPALI (saklı kademe davranışı geri gelir)", () => {
  // Uykudaki ücretli paket makinesi: anahtarın kapatılacağı gün aynen çalışmalı.
  beforeEach(() => {
    jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("(5) doğrulanmış + saklı STANDART bağlantı daveti gönderemez; saklı GOLD gönderir; /me saklı kademeyi gösterir", async () => {
    const { rothernId } = await world();
    const std = await company("STANDART", "VERIFIED");
    expect(std.auth.tier).toBe("STANDART");
    expect((await makeAuthService().service.getMe(std.user.id)).company.tier).toBe("STANDART");
    const err = await refusal(connections().invite(std.auth, rothernId));
    expect(err.status).toBe(403);
    // Doğrulanmış firmaya "doğrulanın" denmez (nötr metin).
    expect(err.message).not.toMatch(/doğrula/i);
    expect(await prisma.companyConnection.count()).toBe(0);

    const gold = await company("GOLD", "VERIFIED", FUTURE);
    expect(gold.auth.tier).toBe("GOLD");
    await expect(connections().invite(gold.auth, rothernId)).resolves.toMatchObject({ status: "PENDING" });
    // Süresi dolmuş saklı GOLD artık doğrulamayla kurtulmaz.
    expect((await company("GOLD", "VERIFIED", new Date(Date.now() - 60_000))).auth.tier).toBe("STANDART");
  });

  it("(5) satın alma giriş noktası artık 410 dönmez (anahtarın kapısı kalkar)", async () => {
    const { service } = makeAuthService(); // self-servis bayrağı kapalı → eski 403
    const co = await company("STANDART", "VERIFIED");
    await expect(service.upgradeToPremium(co.user.id, co.company.id)).rejects.toMatchObject({ status: 403 });
  });
});
