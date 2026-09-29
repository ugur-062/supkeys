import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";
import { UpdateCompanyProfileDto } from "../../src/modules/admin-companies/admin-companies.controller";
import { SeoIndexService } from "../../src/modules/seo-index/seo-index.service";

/**
 * Derin denetim 2026-09-29 MU-02 — admin firma islemleri:
 *  - billingEmail bicimi (tum firma e-postalari bu adrese gider)
 *  - IBAN'siz ulkede gecerli IBAN ile onay kapisi (`bankDetailsErrors` tek kaynak)
 *  - sikayet uzerine askida ic `adminNote` firmaya gerekce olarak gitmez + SEO tazelemesi
 *  - KVKK dokumunde sikayetci kimligi / ic not yok
 *  - KVKK silme/anonimlestirmede SEO tazelemesi
 */

type Svc = AdminCompaniesService & Record<string, unknown>;

function makeSvc(prisma: Record<string, unknown>, seo?: { companyChanged: jest.Mock }) {
  const audit = { log: jest.fn(async () => undefined) };
  const svc = new AdminCompaniesService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    audit as never,
    {} as never,
    seo as never,
  ) as unknown as Svc;
  return { svc, audit };
}

describe("UpdateCompanyProfileDto.billingEmail", () => {
  const errs = (billingEmail: unknown) =>
    validateSync(plainToInstance(UpdateCompanyProfileDto, { billingEmail }) as object).filter(
      (e) => e.property === "billingEmail",
    );

  it("gecersiz bicim reddedilir", () => {
    expect(errs("muhasebe@firma,com")).not.toHaveLength(0);
    expect(errs("muhasebe firma.com")).not.toHaveLength(0);
    expect(errs("muhasebe@acme")).not.toHaveLength(0);
  });

  it("gecerli adres kabul, kirpilir + kucuk harfe cevrilir", () => {
    expect(errs(" Muhasebe@Firma.com ")).toHaveLength(0);
    const dto = plainToInstance(UpdateCompanyProfileDto, { billingEmail: " Muhasebe@Firma.com " });
    expect(dto.billingEmail).toBe("muhasebe@firma.com");
  });

  it("bos string (alani temizle) ve null kabul", () => {
    expect(errs("")).toHaveLength(0);
    expect(errs("   ")).toHaveLength(0);
    expect(errs(null)).toHaveLength(0);
  });
});

describe("updateProfile billingEmail normalizasyonu", () => {
  it("kucuk harfle saklanir", async () => {
    const prisma = {
      company: {
        findUnique: jest.fn(async () => ({ name: "Acme", country: "TR", billingEmail: null })),
        update: jest.fn(async () => ({})),
      },
    };
    const { svc } = makeSvc(prisma);
    await svc.updateProfile("c1", { billingEmail: "Muhasebe@Firma.COM" }, "a1");
    expect(prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ billingEmail: "muhasebe@firma.com" }) }),
    );
  });
});

describe("assertKycIdentityComplete — banka kurali bankDetailsErrors ile ayni", () => {
  const { svc } = makeSvc({});
  const gate = (c: Record<string, unknown>) => () =>
    (svc.assertKycIdentityComplete as (x: unknown) => void).call(svc, {
      country: "BR",
      mersisNo: null,
      tradeRegistryNo: "123",
      iban: null,
      ibanHolder: "Holder",
      bankSwiftBic: "BRASBRRJ",
      bankName: null,
      ...c,
    });

  it("IBAN'siz ulkede (BR) gecerli IBAN + SWIFT varsa banka adi ISTENMEZ", () => {
    expect(gate({ iban: "BR1800360305000010009795493C1" })).not.toThrow();
  });

  it("IBAN'siz ulkede hesap numarasi ile banka adi hala zorunlu", () => {
    expect(gate({ iban: "50100123456789" })).toThrow(/banka ad/);
    expect(gate({ iban: "50100123456789", bankName: "Banco" })).not.toThrow();
  });

  it("SWIFT ve hesap eksikligi hala yakalanir", () => {
    expect(gate({ iban: "BR1800360305000010009795493C1", bankSwiftBic: null })).toThrow(/SWIFT/);
    expect(gate({ country: "DE", iban: null })).toThrow(/IBAN/);
  });
});

describe("resolveComplaint — askida ic not firmaya gitmez", () => {
  function rig() {
    const prisma = {
      companyComplaint: {
        findUnique: jest.fn(async () => ({ id: "k1", againstCompanyId: "c2", status: "OPEN" })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      company: { update: jest.fn(async () => ({})) },
    };
    const seo = { companyChanged: jest.fn() };
    const { svc } = makeSvc(prisma, seo);
    const notify = jest.fn(async () => undefined);
    svc.notifyCompany = notify;
    return { svc, prisma, seo, notify };
  }

  it("suspendReason yoksa adminNote DEGIL dile gore cozulen sabit gerekce anahtari gider; SEO tazelenir", async () => {
    const { svc, prisma, seo, notify } = rig();
    await svc.resolveComplaint(
      "k1",
      { status: "RESOLVED", adminNote: "ABC Ltd 3 kez sikayet etti", suspend: true },
      "a1",
      "SUPER_ADMIN",
    );
    const data = (prisma.company.update.mock.calls[0] as unknown as [{ data: { blockedReason: string } }])[0].data;
    expect(data.blockedReason).not.toContain("ABC Ltd");
    const msg = (notify.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    expect(JSON.stringify(msg)).not.toContain("ABC Ltd");
    // Gerekce yoksa TR sabit metin EN/RU sablona `{gerekce}` olarak girmez:
    // alicinin dilinde cozulen parametresiz katalog anahtari gider.
    expect(msg.params).toBeUndefined();
    expect(msg.bodyKey).toBe("api.notifications.adminCompanies.sikayetUzerineAskiyaAlindiGovde");
    expect(msg.paragraphKeys).toEqual([
      "api.notifications.adminCompanies.sikayetUzerineAskiyaAlindiGerekce",
      "api.notifications.adminCompanies.askiyaAlindiItiraz",
    ]);
    expect(seo.companyChanged).toHaveBeenCalledWith("c2");
  });

  it("suspendReason verilirse o gider", async () => {
    const { svc, prisma, notify } = rig();
    await svc.resolveComplaint(
      "k1",
      { status: "RESOLVED", adminNote: "ic not", suspend: true, suspendReason: "Tekrarlanan ihlal" },
      "a1",
      "SUPER_ADMIN",
    );
    expect(prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ blockedReason: "Tekrarlanan ihlal" }) }),
    );
    expect(notify).toHaveBeenCalledWith(
      "c2",
      expect.objectContaining({
        bodyKey: "api.notifications.adminCompanies.askiyaAlindiGovde",
        params: { gerekce: "Tekrarlanan ihlal" },
      }),
    );
  });
});

describe("exportData — sikayetlerde sikayetci kimligi ve ic not yok", () => {
  it("complaintsReceived yalniz konu/durum/tarih; complaintsMade ic notsuz", async () => {
    const relations: Record<string, jest.Mock> = {};
    const rel = (name: string) => {
      relations[name] = jest.fn(async () => []);
      return relations[name];
    };
    const names = [
      "users",
      "listings",
      "bidsPlaced",
      "ordersAsBuyer",
      "ordersAsSeller",
      "connectionsInitiated",
      "connectionsReceived",
      "referralInvitesSent",
      "complaintsMade",
      "complaintsReceived",
      "membershipEvents",
      "adminNotes",
      "addresses",
      "bankAccounts",
    ];
    const fluent = Object.fromEntries(names.map((n) => [n, rel(n)]));
    const prisma = {
      company: {
        findUnique: jest.fn(() => Object.assign(Promise.resolve({ id: "c1", rothernId: "R1" }), fluent)),
      },
    };
    const { svc } = makeSvc(prisma);
    await svc.exportData("c1");

    const recvArgs = (relations.complaintsReceived!.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(recvArgs.select).toEqual({ id: true, reason: true, status: true, createdAt: true, resolvedAt: true });
    const madeArgs = (relations.complaintsMade!.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(madeArgs.omit).toEqual({ adminNote: true, resolvedByAdminId: true });
  });
});

describe("deleteOrAnonymize — SEO tazelemesi", () => {
  function rig(counts: Record<string, number>) {
    const company = {
      id: "c1",
      name: "Acme",
      rothernId: "R1",
      slug: "acme",
      cityId: 5,
      country: "TR",
      users: [],
      _count: {
        ordersAsBuyer: 0,
        ordersAsSeller: 0,
        bidsPlaced: 0,
        listings: 0,
        messagesSent: 0,
        reviewsGiven: 0,
        reviewsReceived: 0,
        complaintsMade: 0,
        complaintsReceived: 0,
        membershipEvents: 0,
        threadsAsBuyer: 0,
        threadsAsSeller: 0,
        listingInvitations: 0,
        publicInquiries: 0,
        ...counts,
      },
      kycRevisions: [],
    };
    const prisma = {
      company: {
        findUnique: jest.fn(async () => company),
        delete: jest.fn(async () => ({})),
        update: jest.fn(async () => ({})),
      },
      companyKycRevision: { deleteMany: jest.fn(async () => ({})) },
      companyBankAccount: { deleteMany: jest.fn(async () => ({})) },
      companyUserInvitation: { deleteMany: jest.fn(async () => ({})) },
      contentTranslation: { deleteMany: jest.fn(async () => ({})) },
      companyAddress: { updateMany: jest.fn(async () => ({})) },
      companyUser: { update: jest.fn(async () => ({})) },
      aiChatSession: { deleteMany: jest.fn(async () => ({})) },
      $transaction: jest.fn(async () => []),
    };
    const seo = { companyChanged: jest.fn() };
    const { svc } = makeSvc(prisma, seo);
    svc.purgeCompanyObjects = jest.fn(async () => undefined);
    return { svc, seo };
  }

  it("sert silmede silmeden once okunan slug ile tazelenir", async () => {
    const { svc, seo } = rig({});
    await expect(svc.deleteOrAnonymize("c1", "a1", async () => undefined)).resolves.toMatchObject({
      mode: "deleted",
    });
    expect(seo.companyChanged).toHaveBeenCalledWith("c1", { slug: "acme", cityId: 5, country: "TR" });
  });

  it("anonimlestirmede slug null'lanir; eski slug anlik goruntusuyle tazelenir", async () => {
    const { svc, seo } = rig({ ordersAsBuyer: 1 });
    await expect(svc.deleteOrAnonymize("c1", "a1", async () => undefined)).resolves.toMatchObject({
      mode: "anonymized",
    });
    expect(seo.companyChanged).toHaveBeenCalledWith("c1", { slug: "acme", cityId: 5, country: "TR" });
  });
});

describe("SeoIndexService.companyChanged — silinmis firma anlik goruntusu", () => {
  it("removed verilince DB okumadan gorunmez olarak kuyruga alinir (IndexNow yok)", async () => {
    const prisma = { company: { findUnique: jest.fn(async () => null) } };
    const seo = new SeoIndexService(prisma as never, { get: () => undefined } as never) as unknown as Record<
      string,
      unknown
    > & { companyChanged: SeoIndexService["companyChanged"] };
    const enqueue = jest.fn();
    seo.enqueue = enqueue;
    seo.companyChanged("c1", { slug: "acme", cityId: null, country: "TR" });
    await new Promise((r) => setImmediate(r));
    expect(prisma.company.findUnique).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(1);
    const change = (enqueue.mock.calls[0] as unknown as [{ paths: string[]; indexNow: string[] }])[0];
    expect(change.paths.some((p) => p.includes("acme"))).toBe(true);
    expect(change.indexNow).toEqual([]);
  });
});
