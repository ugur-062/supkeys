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

describe("inviteExternalForListing — adres başına gerçek sonuç", () => {
  it("SENT / SUPPRESSED / FAILED / INVALID ayrışır; başarısız kayıt geri alınır", async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({ emailLogId: "e1", sent: true })
      .mockResolvedValueOnce({ emailLogId: "e2", sent: false })
      .mockRejectedValueOnce(new Error("resend down"));
    const { service, prisma } = rig({ send });
    const { results } = await service.inviteExternalForListing(user, "l1", [
      "ok@x.com",
      "bounce@x.com",
      "down@x.com",
      "bozuk-adres",
    ]);
    const byEmail = Object.fromEntries(results.map((r) => [r.email, r.status]));
    expect(byEmail).toEqual({
      "ok@x.com": "SENT",
      "bounce@x.com": "SUPPRESSED",
      "down@x.com": "FAILED",
      "bozuk-adres": "INVALID",
    });
    // Gitmeyen iki davetin kaydı silindi (ömür boyu tek davet freni kilitlemesin).
    expect(prisma.companyReferralInvite.delete).toHaveBeenCalledTimes(2);
    // Son teklif tarihi İstanbul saatiyle (UTC 22:30 → 5 Ekim 01:30).
    const data = send.mock.calls[0][0].templateData.data as { closesAt: string };
    expect(data.closesAt).toContain("5 Ekim 2026");
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
});

describe("dış talep daveti — ALICININ dili ve zengin içerik (2026-09-27)", () => {
  type Sent = {
    locale: string;
    templateData: { data: Record<string, unknown> };
  };

  it("ülkesi DE olan alıcı İngilizce alır; bağlantılar /en/, kayıt sonrası talebe döner, dil kayda yazılır", async () => {
    const send = jest.fn().mockResolvedValue({ emailLogId: "e1", sent: true });
    const { service, prisma } = rig({ send, inVitrine: true });
    // Davet eden Türkçe arayüzde (istek bağlamı yok → tr).
    await service.inviteExternalForListing(user, "l1", [{ email: "einkauf@firma.de", country: "DE" }]);
    const call = send.mock.calls[0][0] as Sent;
    expect(call.locale).toBe("en");
    const data = call.templateData.data;
    expect(data.categories).toEqual(["Head protection"]);
    expect(data.closesAt).toContain("October 5, 2026");
    // Teslim yeri YALNIZ şehir + ülke, alıcının dilinde (tam adres yok).
    expect(data.deliveryPlace).toBe(`Istanbul, ${new Intl.DisplayNames(["en"], { type: "region" }).of("TR")}`);
    expect(data.tenderNumber).toBe("ROT-000042");
    expect(data.itemCount).toBe(9);
    expect(data.items).toEqual([
      { name: "Baret", quantity: 1200, unitCode: "PCE", unit: "adet" },
      { name: "Eldiven", quantity: 300, unitCode: "PAIR", unit: "çift" },
    ]);
    expect(data.supplierTypes).toEqual(["MANUFACTURER"]);
    expect(data.registerUrl).toBe(
      "http://localhost:3000/en/company/signup?ref=tok1&redirect=%2Fcompany%2Filan%2Fl1",
    );
    expect(data.optOutUrl).toMatch(/^http:\/\/localhost:3000\/en\//);
    // Vitrindeki talep: herkese açık sayfa alıcının dilindeki adresle, slug KAYNAK başlıktan.
    expect(data.publicUrl).toBe("http://localhost:3000/en/buying-requests/rot-000042-baret-alimi");
    expect(prisma.companyReferralInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ locale: "en", listingId: "l1" }) }),
    );
    // Kapalı zarf: hedef fiyat, şartname, marka, adres satırı yükte YOK.
    const json = JSON.stringify(data);
    for (const banned of ["targetPrice", "specification", "brand", "addressLine", "terms", "paymentNote"]) {
      expect(json).not.toContain(banned);
    }
  });

  it("satırda seçilen dil ülkeyi ezer; .kz uzantısı Rusça; genel uzantı davet edenin dili", async () => {
    const send = jest.fn().mockResolvedValue({ emailLogId: "e1", sent: true });
    const { service } = rig({ send });
    await service.inviteExternalForListing(user, "l1", [
      { email: "a@firma.de", country: "DE", locale: "ru" },
      { email: "b@zavod.kz" },
      "c@firma.com",
    ]);
    const locales = send.mock.calls.map((c) => (c[0] as Sent).locale);
    expect(locales).toEqual(["ru", "ru", "tr"]);
    // Vitrinde değil → herkese açık bağlantı yok.
    expect((send.mock.calls[0][0] as Sent).templateData.data.publicUrl).toBeNull();
    expect((send.mock.calls[0][0] as Sent).templateData.data.registerUrl).toMatch(
      /\/ru\/kompaniya\/registratsiya\?ref=/,
    );
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
