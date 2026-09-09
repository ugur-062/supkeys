import { BadRequestException } from "@nestjs/common";
import { CompanyRequestDefaultsService, requestDefaultsSchema } from "../../src/modules/company-request-defaults/company-request-defaults.service";

function rig(opts: { saved?: unknown; last?: Record<string, unknown> | null; address?: boolean } = {}) {
  const prisma = {
    company: {
      findUnique: jest.fn().mockResolvedValue({ requestDefaults: opts.saved ?? null }),
      update: jest.fn().mockResolvedValue({}),
    },
    listing: { findFirst: jest.fn().mockResolvedValue(opts.last ?? null) },
    companyAddress: { findFirst: jest.fn().mockResolvedValue(opts.address === false ? null : { id: "addr1" }) },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  return { svc: new CompanyRequestDefaultsService(prisma as never, audit as never), prisma, audit };
}
const user = { companyId: "c1", userId: "u1", email: "a@b.c" } as never;
const VALID = {
  isInternational: false,
  visibility: "CONNECTIONS",
  deliveryTerm: "DOMESTIC_DELIVERED",
  paymentCategory: "DEFERRED",
  paymentDays: 30,
  advancePercent: null,
  lcType: null,
  primaryCurrency: "TRY",
  allowedCurrencies: ["TRY"],
  isSealedBid: true,
  bidVisibility: "OWN_RANK",
  requireAllItems: false,
  requireBidDocument: false,
  closeDays: 7,
  deliveryAddressId: "addr1",
  billingSameAsDelivery: true,
};

describe("CompanyRequestDefaultsService", () => {
  it("kayıtlı şart varsa 'saved'; silinmiş adres düşer", async () => {
    const { svc } = rig({ saved: VALID, address: false });
    const r = await svc.get("c1");
    expect(r.source).toBe("saved");
    expect(r.defaults?.deliveryAddressId).toBeNull();
  });

  it("kayıt yoksa son yayımlanan talepten türetir (closeDays yayın→kapanış)", async () => {
    const { svc, prisma } = rig({
      last: {
        isInternational: true,
        visibility: "PUBLIC",
        deliveryTerm: "FOB",
        paymentCategory: "LETTER_OF_CREDIT",
        paymentDays: 60,
        advancePercent: null,
        lcType: "USANCE",
        primaryCurrency: "USD",
        allowedCurrencies: [],
        isSealedBid: true,
        bidVisibility: "OWN_ONLY",
        requireAllItems: false,
        requireBidDocument: true,
        publishedAt: new Date("2026-09-01T00:00:00Z"),
        closesAt: new Date("2026-09-11T00:00:00Z"),
        deliveryAddressId: null,
        billingAddressId: null,
      },
    });
    const r = await svc.get("c1");
    expect(r.source).toBe("last_listing");
    expect(r.defaults).toMatchObject({ closeDays: 10, allowedCurrencies: ["USD"], billingSameAsDelivery: true, paymentCategory: "LETTER_OF_CREDIT" });
    expect(prisma.listing.findFirst.mock.calls[0][0].where).toMatchObject({ type: "ALIM", publishedAt: { not: null } });
  });

  it("hiçbiri yoksa none; tutarsız eski talep de none", async () => {
    expect((await rig().svc.get("c1")).source).toBe("none");
    const bad = rig({ last: { isInternational: false, visibility: "PUBLIC", deliveryTerm: null, paymentCategory: "LETTER_OF_CREDIT", paymentDays: null, advancePercent: null, lcType: null, primaryCurrency: "TRY", allowedCurrencies: ["TRY"], isSealedBid: true, bidVisibility: "OWN_RANK", requireAllItems: false, requireBidDocument: false, publishedAt: new Date(), closesAt: new Date(), deliveryAddressId: null, billingAddressId: null } });
    expect((await bad.svc.get("c1")).source).toBe("none");
  });

  it("save: şema doğrular (kapsam-ödeme tutarlılığı), audit yazar", async () => {
    const { svc, prisma, audit } = rig();
    const r = await svc.save(user, VALID);
    expect(r.source).toBe("saved");
    expect(prisma.company.update.mock.calls[0][0].data.requestDefaults).toMatchObject({ closeDays: 7 });
    expect(audit.log.mock.calls[0][0].action).toBe("company.request_defaults.updated");
    await expect(svc.save(user, { ...VALID, paymentCategory: "LETTER_OF_CREDIT" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.save(user, { ...VALID, allowedCurrencies: ["USD"] })).rejects.toThrow(/Ana para birimi/);
    expect(requestDefaultsSchema.safeParse({ ...VALID, closeDays: 0 }).success).toBe(false);
  });
});
