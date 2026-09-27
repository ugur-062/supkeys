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
  priorInvite?: { id: string; status: string } | null;
}) {
  let seq = 0;
  const prisma = {
    listing: {
      findFirst: jest.fn().mockResolvedValue({
        id: "l1",
        title: "Baret alımı",
        status: "OPEN",
        closesAt: new Date("2026-10-04T22:30:00Z"),
        categoryIds: [],
        type: "ALIM",
        createdById: "u1",
      }),
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
    category: { findMany: jest.fn().mockResolvedValue([]) },
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
