/**
 * Faz C — dış ihale daveti sözleşmesi: sahiplik, günlük tavan (20), aynı
 * adrese tek davet, opt-out/kayıtlı-adres atlama, referral kaydına listingId,
 * opt-out endpoint'i.
 */
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { Prisma } from "@rothern/db";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeItem, makeListing } from "./factories";

function makeService(translations?: unknown) {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
  const blocks = { blockedCompanyIds: jest.fn().mockResolvedValue([]) } as never;
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") } as never;
  const notifications = {
    notify: jest.fn().mockResolvedValue(1),
    pushToCompany: jest.fn().mockResolvedValue(1),
    pushToUser: jest.fn().mockResolvedValue(1),
  } as never;
  const service = new CompanyConnectionsService(
    prisma as never,
    // P12 #3: bypass client (testte RLS kapalı → aynı client)
    prisma as never,
    blocks,
    email as never,
    config,
    notifications,
    new AuditService(prisma as never),
    undefined,
    translations as never,
  );
  return { service, email };
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("inviteExternalForListing", () => {
  it("gönderim: referral kaydı listingId'li oluşur, e-posta şablonu tender_external_invite", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      title: "Baret alımı",
    });
    const res = await service.inviteExternalForListing(owner.auth, listing.id, [
      "dis@firma.com",
    ]);
    expect(res.results).toEqual([{ email: "dis@firma.com", status: "SENT" }]);
    const inv = await prisma.companyReferralInvite.findFirst({
      where: { email: "dis@firma.com" },
    });
    expect(inv?.listingId).toBe(listing.id);
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        templateData: expect.objectContaining({
          template: "tender_external_invite",
          data: expect.objectContaining({ tenderTitle: "Baret alımı" }),
        }),
      }),
    );
  });

  it("aynı adrese ikinci davet ALREADY_INVITED; opt-out OPTED_OUT; kayıtlı adres SKIPPED_REGISTERED; geçersiz INVALID", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const registered = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
    });
    await prisma.referralOptOut.create({ data: { email: "istemiyor@x.com" } });

    await service.inviteExternalForListing(owner.auth, listing.id, ["bir@x.com"]);
    const res = await service.inviteExternalForListing(owner.auth, listing.id, [
      "bir@x.com",
      "istemiyor@x.com",
      registered.user.email.toLowerCase(),
      "bozuk-adres",
    ]);
    const byEmail = Object.fromEntries(res.results.map((r) => [r.email, r]));
    expect(byEmail["bir@x.com"]!.status).toBe("ALREADY_INVITED");
    expect(byEmail["istemiyor@x.com"]!.status).toBe("OPTED_OUT");
    expect(byEmail[registered.user.email.toLowerCase()]!.status).toBe("SKIPPED_REGISTERED");
    expect(byEmail["bozuk-adres"]!.status).toBe("INVALID");
  });

  it("günlük tavan 20: 20 gönderim sonrası yenisi DAILY_LIMIT", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
    });
    const first = Array.from({ length: 20 }, (_, i) => `t${i}@cap.com`);
    const r1 = await service.inviteExternalForListing(owner.auth, listing.id, first);
    expect(r1.results.filter((r) => r.status === "SENT")).toHaveLength(20);
    const r2 = await service.inviteExternalForListing(owner.auth, listing.id, [
      "fazla@cap.com",
    ]);
    expect(r2.results[0]!.status).toBe("DAILY_LIMIT");
    expect(r2.results[0]!.reason).toMatch(/limit/i);
  });

  it("gönderim BEKLENİR: suppress → SUPPRESSED, hata → FAILED; kayıt geri alınır, adres yeniden denenebilir", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
    });
    email.send
      .mockResolvedValueOnce({ emailLogId: "t", sent: false })
      .mockRejectedValueOnce(new Error("resend down"));
    const res = await service.inviteExternalForListing(owner.auth, listing.id, [
      "bounce@x.com",
      "down@x.com",
    ]);
    expect(res.results.map((r) => r.status)).toEqual(["SUPPRESSED", "FAILED"]);
    expect(await prisma.companyReferralInvite.count({ where: { inviterCompanyId: owner.company.id } })).toBe(0);
    const retry = await service.inviteExternalForListing(owner.auth, listing.id, ["down@x.com"]);
    expect(retry.results[0]!.status).toBe("SENT");
  });

  it("son teklif tarihi İstanbul saatiyle (UTC 22:30 → ertesi gün)", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
    });
    await prisma.listing.update({
      where: { id: listing.id },
      data: { closesAt: new Date("2030-10-04T22:30:00Z") },
    });
    await service.inviteExternalForListing(owner.auth, listing.id, ["saat@x.com"]);
    const data = (email.send.mock.calls.at(-1)?.[0] as { templateData: { data: { closesAt: string } } })
      .templateData.data;
    expect(data.closesAt).toContain("5 Ekim 2030");
  });

  it("başka firmanın ihalesi için 404; kapalı ihale için 400", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const other = await makeCompanyWithUser(prisma);
    const foreign = await makeListing(prisma, {
      companyId: other.company.id,
      createdById: other.user.id,
      type: "ALIM",
      status: "OPEN",
    });
    await expect(
      service.inviteExternalForListing(owner.auth, foreign.id, ["a@b.com"]),
    ).rejects.toThrow(/bulunamadı/i);
    const closed = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "AWARDED",
    });
    await expect(
      service.inviteExternalForListing(owner.auth, closed.id, ["a@b.com"]),
    ).rejects.toThrow(/taslak|açık/i);
  });

  it("markReferralOptOut: token'daki adres opt-out olur; geçersiz token 404", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
    });
    await service.inviteExternalForListing(owner.auth, listing.id, ["opt@x.com"]);
    const inv = await prisma.companyReferralInvite.findFirst({
      where: { email: "opt@x.com" },
    });
    const res = await service.markReferralOptOut(inv!.token);
    expect(res.ok).toBe(true);
    expect(await prisma.referralOptOut.findUnique({ where: { email: "opt@x.com" } })).not.toBeNull();
    await expect(service.markReferralOptOut("yok-token")).rejects.toThrow();
  });

  it("ALICININ DİLİ + zengin içerik: DE alıcı İngilizce; çeviri BEKLENİR; kayıt dili saklanır (2026-09-27)", async () => {
    // Çeviri servisi sahtesi: bekleme çağrılır, İngilizce başlık/kalem döner.
    const translations = {
      ensureTranslated: jest.fn().mockResolvedValue(true),
      localizeListings: jest.fn().mockImplementation(
        async (items: Array<{ title: string; items: Array<{ name: string }> }>, _ids: string[], locale: string) =>
          locale === "en"
            ? items.map((i) => ({ ...i, title: "Hard hat purchase", items: i.items.map(() => ({ name: "Hard hat" })) }))
            : items,
      ),
    };
    const { service, email } = makeService(translations);
    const owner = await makeCompanyWithUser(prisma);
    const address = await prisma.companyAddress.create({
      data: {
        companyId: owner.company.id,
        type: "TESLIMAT",
        title: "Depo",
        country: "TR",
        city: "İzmir",
        district: "Çiğli",
        addressLine: "Atatürk OSB 10001 Sk. No:5",
        postalCode: "35620",
      },
    });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      title: "Baret alımı",
      deliveryAddressId: address.id,
      closesAt: new Date("2030-10-04T22:30:00Z"),
    });
    await makeItem(prisma, listing.id, {
      name: "Baret",
      quantity: new Prisma.Decimal(1200),
      unit: "adet",
      unitCode: "PCE",
      targetPrice: new Prisma.Decimal(99),
      specification: "EN 397 GİZLİ ŞARTNAME",
    });

    const res = await service.inviteExternalForListing(owner.auth, listing.id, [
      { email: "einkauf@firma.de", country: "DE" },
      { email: "yerli@firma.com" },
    ]);
    expect(res.results.map((r) => r.status)).toEqual(["SENT", "SENT"]);
    // Gönderimden ÖNCE alıcıların dillerindeki çeviri beklendi (tek çağrı).
    expect(translations.ensureTranslated).toHaveBeenCalledWith("LISTING", listing.id, ["en", "tr"], 60_000);

    const byTo = new Map(
      email.send.mock.calls.map((c) => {
        const a = c[0] as { to: { email: string }; locale: string; templateData: { data: Record<string, unknown> } };
        return [a.to.email, a];
      }),
    );
    const de = byTo.get("einkauf@firma.de")!;
    expect(de.locale).toBe("en");
    expect(de.templateData.data).toMatchObject({
      tenderTitle: "Hard hat purchase",
      items: [{ name: "Hard hat", quantity: 1200, unitCode: "PCE", unit: "adet" }],
      itemCount: 1,
      deliveryPlace: expect.stringMatching(/^Izmir, /),
      closesAt: expect.stringContaining("October 5, 2030"),
    });
    expect(de.templateData.data.registerUrl).toMatch(
      new RegExp(`/en/company/signup\\?ref=[^&]+&redirect=%2Fcompany%2Filan%2F${listing.id}$`),
    );
    // Kapalı zarf + anonimlik: hedef fiyat, şartname, adres satırı yükte yok.
    const payload = JSON.stringify(de.templateData.data);
    expect(payload).not.toContain("GİZLİ ŞARTNAME");
    expect(payload).not.toContain("targetPrice");
    expect(payload).not.toContain("10001");
    expect(payload).not.toContain("Çiğli");

    const tr = byTo.get("yerli@firma.com")!;
    expect(tr.locale).toBe("tr");
    expect(tr.templateData.data.tenderTitle).toBe("Baret alımı");
    expect(tr.templateData.data.deliveryPlace).toBe("İzmir, Türkiye");

    const rows = await prisma.companyReferralInvite.findMany({
      where: { listingId: listing.id },
      select: { email: true, locale: true },
      orderBy: { email: "asc" },
    });
    expect(rows).toEqual([
      { email: "einkauf@firma.de", locale: "en" },
      { email: "yerli@firma.com", locale: "tr" },
    ]);
  });
});
