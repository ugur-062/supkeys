import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";

/**
 * Davet e-postaları denetimi (2026-09-27) — servis sözleşmesi, sahte
 * Prisma ile (DB'siz): gönderim BEKLENİR ve adres başına GERÇEK sonuç döner;
 * geçersiz adres sonuçta INVALID görünür; kesin başarısızlıkta dış davet
 * kaydı geri alınır (ömür boyu tek davet freni gitmemiş e-postayla adresi
 * kilitlemesin); referral yolunda 7 günlük tekrar freni ve günlük tavan.
 * Gerçek DB davranışı: integration `external-tender-invite.spec`,
 * `connections.spec`.
 */
const user = {
  userId: "u1",
  companyId: "c1",
  email: "alici@firma.com",
  tier: "GOLD",
  permissions: ["buy:listing:manage", "connections:manage"],
  roles: ["SAHIP"],
  isOwner: true,
} as never;

function rig(opts: {
  send: jest.Mock;
  emailLogFindFirst?: unknown;
  emailLogCount?: number;
  priorInvite?: { id: string; status: string; locale?: string | null } | null;
  /** Talep vitrinde mi (herkese açık sayfa bağlantısı). */
  inVitrine?: boolean;
}) {
  let seq = 0;
  const prisma = {
    listing: {
      findFirst: jest.fn().mockResolvedValue({
        id: "l1",
        title: "Baret alımı",
        number: "ROT-000042",
        status: "OPEN",
        closesAt: new Date("2026-10-04T22:30:00Z"),
        categoryIds: ["46181700"],
        type: "ALIM",
        createdById: "u1",
        deliveryAddressId: "a1",
        preferredActivities: ["MANUFACTURER"],
        items: [
          { name: "Baret", quantity: "1200.000", unit: "adet", unitCode: "PCE" },
          { name: "Eldiven", quantity: "300.000", unit: "çift", unitCode: "PAIR" },
        ],
        _count: { items: 9 },
      }),
      count: jest.fn().mockResolvedValue(opts.inVitrine ? 1 : 0),
    },
    companyAddress: {
      findFirst: jest.fn().mockResolvedValue({ city: "İstanbul", country: "TR" }),
    },
    companyReferralInvite: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(opts.priorInvite ?? null),
      create: jest.fn().mockImplementation(async () => ({ id: `inv${++seq}`, token: `tok${seq}` })),
      upsert: jest.fn().mockImplementation(async () => ({ id: `inv${++seq}`, token: `tok${seq}` })),
      delete: jest.fn().mockResolvedValue({}),
    },
    referralOptOut: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    // Talep × adres kuyruğu (2026-09-27, Faz 0b).
    externalListingInvite: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      // Referral 7 gün freni: bu kayda bağlı gönderilmiş talep daveti (derin denetim LU-07).
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: `eli${++seq}`, ...data })),
    },
    // Günlük tavan AI üye davetiyle ortak (yayın denetimi 2026-09-28).
    listingInvitation: {
      count: jest.fn().mockResolvedValue(0),
    },
    companyUser: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    company: { findUnique: jest.fn().mockResolvedValue({ name: "Alıcı A.Ş." }) },
    category: {
      findMany: jest.fn().mockResolvedValue([
        { nameTr: "Baş koruma", nameEn: "Head protection", nameRu: "Защита головы" },
      ]),
    },
    emailLog: {
      findFirst: jest.fn().mockResolvedValue(opts.emailLogFindFirst ?? null),
      count: jest.fn().mockResolvedValue(opts.emailLogCount ?? 0),
    },
  };
  const service = new CompanyConnectionsService(
    prisma as never,
    prisma as never,
    { blockedCompanyIds: jest.fn().mockResolvedValue([]) } as never,
    { send: opts.send } as never,
    { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
    {} as never,
    { log: jest.fn().mockResolvedValue(undefined) } as never,
  );
  return { service, prisma };
}

describe("inviteExternalForListing — kuyruğa alma (2026-09-27, Faz 0b)", () => {
  it("geçerli adresler QUEUED (e-posta istekte GİTMEZ, kuyruk işi gönderir); geçersiz INVALID", async () => {
    const send = jest.fn();
    const { service, prisma } = rig({ send });
    const { results } = await service.inviteExternalForListing(user, "l1", ["ok@x.com", "bozuk-adres"]);
    expect(Object.fromEntries(results.map((r) => [r.email, r.status]))).toEqual({
      "ok@x.com": "QUEUED",
      "bozuk-adres": "INVALID",
    });
    expect(send).not.toHaveBeenCalled();
    expect(prisma.externalListingInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ listingId: "l1", email: "ok@x.com", source: "MANUAL" }) }),
    );
  });
});

describe("inviteByEmail (referral) — frenler + gerçek sonuç", () => {
  it("kayıtsız adres: e-posta beklenir, opt-out bağlantısı eklenir, delivery döner", async () => {
    const send = jest.fn().mockResolvedValue({ emailLogId: "e1", sent: false });
    const { service } = rig({ send });
    const res = await service.inviteByEmail(user, "Yeni@Firma.com");
    expect(res).toEqual({
      kind: "invited",
      email: "yeni@firma.com",
      delivery: "SUPPRESSED",
      emailSent: false,
    });
    const data = send.mock.calls[0][0].templateData.data as { optOutUrl?: string };
    expect(data.optOutUrl).toMatch(/\/davet-kapat\?token=/);
  });

  it("son 7 günde aynı adrese davet gitmişse ALREADY_INVITED (e-posta yok)", async () => {
    const send = jest.fn();
    const { service } = rig({
      send,
      priorInvite: { id: "old", status: "PENDING" },
      emailLogFindFirst: { id: "log1" },
    });
    await expect(service.inviteByEmail(user, "tekrar@firma.com")).rejects.toMatchObject({
      response: { code: "ALREADY_INVITED" },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("günlük tavan dolduysa DAILY_LIMIT (429); toplu uçta adres başına 'skipped'", async () => {
    const send = jest.fn();
    const { service, prisma } = rig({ send, emailLogCount: 50 });
    prisma.companyReferralInvite.findMany.mockResolvedValue([{ id: "a" }]);
    await expect(service.inviteByEmail(user, "fazla@firma.com")).rejects.toMatchObject({
      status: 429,
      response: { code: "DAILY_LIMIT" },
    });
    const batch = await service.inviteByEmailBatch(user, ["b1@x.com", "b2@x.com"]);
    expect(batch.results.map((r) => [r.status, r.code])).toEqual([
      ["skipped", "DAILY_LIMIT"],
      ["skipped", "DAILY_LIMIT"],
    ]);
    expect(send).not.toHaveBeenCalled();
  });

  it("toplu uç: gönderilemeyen adres 'failed' olarak ayrı sayılır", async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({ emailLogId: "e1", sent: true })
      .mockRejectedValueOnce(new Error("x"));
    const { service } = rig({ send });
    const batch = await service.inviteByEmailBatch(user, ["a@x.com", "b@x.com"]);
    expect(batch.summary).toEqual({ request: 0, invited: 1, skipped: 0, failed: 1 });
    expect(batch.results[1]).toMatchObject({ email: "b@x.com", status: "failed", code: "FAILED" });
  });

  it("teslim edilemez alan adı: tekil uçta undeliverable bayrağı, toplu uçta 'alan adına teslim edilemez' gerekçesi (code SUPPRESSED kalır)", async () => {
    const skipped = { emailLogId: "e1", sent: false, skipReason: "undeliverable" };
    const send = jest
      .fn()
      .mockResolvedValueOnce(skipped)
      .mockResolvedValueOnce(skipped)
      .mockResolvedValueOnce({ emailLogId: "e2", sent: false, skipReason: "suppressed" });
    const { service } = rig({ send });
    await expect(service.inviteByEmail(user, "a@firma.test")).resolves.toMatchObject({
      delivery: "SUPPRESSED",
      emailSent: false,
      undeliverable: true,
    });
    const batch = await service.inviteByEmailBatch(user, ["b@firma.test", "c@firma.com"]);
    expect(batch.results[0]).toMatchObject({ status: "failed", code: "SUPPRESSED" });
    expect(batch.results[0]!.reason).toContain("teslim edilemez");
    expect(batch.results[1]).toMatchObject({ status: "failed", code: "SUPPRESSED" });
    expect(batch.results[1]!.reason).toContain("geri çevirdi");
  });
});

describe("dış talep daveti — ALICININ dili kayda yazılır (2026-09-27)", () => {
  const stored = (prisma: ReturnType<typeof rig>["prisma"]) =>
    prisma.externalListingInvite.create.mock.calls.map(
      (c: unknown[]) => (c[0] as { data: { email: string; locale: string; country: string | null } }).data,
    );

  it("ülkesi DE olan alıcı İngilizce; ülke kayda yazılır (gönderim saati o ülkenin saatine göre)", async () => {
    const { service, prisma } = rig({ send: jest.fn() });
    await service.inviteExternalForListing(user, "l1", [{ email: "einkauf@firma.de", country: "DE" }]);
    expect(stored(prisma)).toEqual([expect.objectContaining({ email: "einkauf@firma.de", locale: "en", country: "DE" })]);
    expect(prisma.companyReferralInvite.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ locale: "en", listingId: "l1" }) }),
    );
  });

  it("satırda seçilen dil ülkeyi ezer; .kz uzantısı Rusça (ülke uzantıdan); genel uzantı davet edenin dili", async () => {
    const { service, prisma } = rig({ send: jest.fn() });
    await service.inviteExternalForListing(user, "l1", [
      { email: "a@firma.de", country: "DE", locale: "ru" },
      { email: "b@zavod.kz" },
      "c@firma.com",
    ]);
    expect(stored(prisma).map((d) => [d.locale, d.country])).toEqual([
      ["ru", "DE"],
      ["ru", "KZ"],
      ["tr", null],
    ]);
  });
});

describe("referral daveti — ALICININ dili (2026-09-27)", () => {
  it("seçilen dil e-postaya ve kayda yazılır; sonraki gönderim kayıttaki dili kullanır", async () => {
    const send = jest.fn().mockResolvedValue({ emailLogId: "e1", sent: true });
    const { service, prisma } = rig({ send });
    await service.inviteByEmail(user, "satin@firma.kz", "en");
    expect(send.mock.calls[0][0].locale).toBe("en");
    expect(send.mock.calls[0][0].templateData.data.registerUrl).toMatch(/\/en\/company\/signup\?ref=/);
    expect(prisma.companyReferralInvite.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ locale: "en" }),
        update: expect.objectContaining({ locale: "en" }),
      }),
    );

    // Yeniden gönderim (7 gün sonra, dil verilmeden) → kayıttaki dil.
    const again = rig({ send: jest.fn().mockResolvedValue({ emailLogId: "e2", sent: true }), priorInvite: { id: "old", status: "PENDING", locale: "ru" } });
    await again.service.inviteByEmail(user, "satin@firma.de");
    expect(again.prisma.companyReferralInvite.upsert.mock.calls[0][0].update.locale).toBe("ru");
  });

  it("dil verilmezse e-posta uzantısından (.kz → ru); toplu uçta adres başına dil", async () => {
    const send = jest.fn().mockResolvedValue({ emailLogId: "e1", sent: true });
    const { service } = rig({ send });
    await service.inviteByEmailBatch(user, [{ email: "x@zavod.kz" }, { email: "y@firma.com", locale: "en" }, "z@firma.com"]);
    expect(send.mock.calls.map((c) => c[0].locale)).toEqual(["ru", "en", "tr"]);
  });
});
