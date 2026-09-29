/**
 * HERKESE AÇIK TALEP — bağlantılar OTOMATİK DAVETLİ + kategori duyurusu
 * (2026-09-27, kullanıcı: "herkese açık paylaşılsa bile mutlaka bağlantılarına
 * davet gitsin; ek olarak kategori uyumu olanlara da gitsin; ücretsizse
 * Silver'a geçmeye teşvik edelim").
 *
 * Sözleşme:
 *  - Yayın duyurusunda (announceListingOpen "invitation") alıcının GEÇERLİ
 *    bağlantılarının tamamı davetli olur — kategoriden bağımsız.
 *  - Davetliye kategori duyurusu GİTMEZ (tek e-posta: davet).
 *  - Kategorisi uyan bağlantısız ücretsiz firma Silver teşvikli e-posta alır
 *    (CTA panelin Paketler sayfası, talep bağlantısı YOK); ücretli firma
 *    doğrudan talebe giden e-posta alır.
 *  - E-postalar talep önizlemesi taşır (kalemler + miktar, kapanış).
 *  - Görünürlük ülkesi dışındaki bağlantı ve PUBLIC olmayan talep: otomatik davet YOK.
 */
import { prisma, truncateAll } from "./test-db";
import { connect, makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { makeService } from "./make-service";

const SEG = "10000000";
const CLASS = "10101500";

type Sent = { to: { email: string }; subject: string; templateData: { data: Record<string, unknown> } };

async function waitForSends(email: { send: jest.Mock }, n: number): Promise<Sent[]> {
  // Duyurular arka planda (fire-and-forget + başlık çevirisi okuması) gider.
  for (let i = 0; i < 60 && email.send.mock.calls.length < n; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  // Fazladan (çift) gönderim olmadığını görmek için kısa bir süre daha bekle.
  await new Promise((r) => setTimeout(r, 150));
  return email.send.mock.calls.map((c) => c[0] as Sent);
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function seller(opts: { country?: string; tier?: "STANDART" | "SILVER"; cats?: string[]; email: string }) {
  const c = await makeCompanyWithUser(prisma, { country: opts.country ?? "TR", tier: opts.tier ?? "STANDART" });
  await prisma.company.update({
    where: { id: c.company.id },
    data: { sellerCategoryIds: opts.cats ?? [], billingEmail: opts.email },
  });
  return c;
}

describe("herkese açık talep — bağlantılar otomatik davetli + kategori duyurusu", () => {
  it("bağlantılar davet alır (kategoriden bağımsız), davetliye duyuru gitmez; ücretsiz firmaya Silver teşviki, ücretliye talep bağlantısı", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD" });
    const connNoCat = await seller({ cats: ["20000000"], email: "bagli@a.com" });
    const connCat = await seller({ cats: [SEG], email: "bagli-kat@b.com" });
    const freeCat = await seller({ cats: [SEG], email: "ucretsiz@c.com" });
    const paidCat = await seller({ cats: [SEG], tier: "SILVER", email: "silver@d.com" });
    // Bağlantıları Gold alıcı başlatır (geçerlilik davet edenin paketinden).
    await connect(prisma, owner.company.id, connNoCat.company.id, owner.user.id);
    await connect(prisma, owner.company.id, connCat.company.id, owner.user.id);

    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      visibility: "PUBLIC",
      categoryIds: [CLASS],
      number: "ROT-000077",
      closesAt: new Date(Date.now() + 5 * 86_400_000),
    });
    await makeItem(prisma, listing.id, { name: "Paslanmaz boru DN50", quantity: 1200 as never, unit: "metre", unitCode: "M" });

    await service.announceListingOpen(listing.id, "invitation");
    const sends = await waitForSends(email, 4);

    // Otomatik davet: iki bağlantı davetli, bağlantısızlar değil.
    const invited = await prisma.listingInvitation.findMany({
      where: { listingId: listing.id },
      select: { invitedCompanyId: true, invitedById: true },
    });
    expect(invited.map((i) => i.invitedCompanyId).sort()).toEqual(
      [connNoCat.company.id, connCat.company.id].sort(),
    );
    expect(invited.every((i) => i.invitedById === owner.user.id)).toBe(true);

    // Tam dört e-posta; kategorisi de uyan bağlantı YALNIZ davet alır.
    const to = sends.map((s) => s.to.email).sort();
    expect(to).toEqual(["bagli-kat@b.com", "bagli@a.com", "silver@d.com", "ucretsiz@c.com"].sort());
    const byTo = (e: string) => sends.find((s) => s.to.email === e)!;

    const inv = byTo("bagli@a.com");
    expect(inv.subject).toBe("Bir alım talebine davet edildiniz");
    const invRows = JSON.stringify(inv.templateData.data.infoRows);
    expect(invRows).toContain("Kalemler (1)");
    expect(invRows).toContain("Paslanmaz boru DN50 — 1.200 m");
    expect(invRows).toContain("Son teklif tarihi");
    expect(byTo("bagli-kat@b.com").subject).toBe("Bir alım talebine davet edildiniz");

    const free = byTo("ucretsiz@c.com");
    expect(free.subject).toMatch(/Silver'a geçin/);
    const freePayload = JSON.stringify(free.templateData);
    expect(freePayload).toContain("/company/premium");
    expect(freePayload).not.toContain("/company/ilan/");
    expect(JSON.stringify(free.templateData.data.infoRows)).toContain("Paslanmaz boru DN50");
    // Kategori duyurusu anonim: alıcı firmanın adı geçmez.
    expect(freePayload).not.toContain(owner.company.name);

    const paid = byTo("silver@d.com");
    expect(paid.subject).not.toMatch(/Silver/);
    expect(JSON.stringify(paid.templateData)).toContain(`/company/ilan/${listing.id}`);
  });

  it("görünürlük ülkesi dışındaki bağlantı otomatik davet EDİLMEZ", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD" });
    const trConn = await seller({ email: "tr@a.com" });
    const deConn = await seller({ country: "DE", email: "de@b.com" });
    await connect(prisma, owner.company.id, trConn.company.id, owner.user.id);
    await connect(prisma, owner.company.id, deConn.company.id, owner.user.id);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      visibility: "PUBLIC",
      categoryIds: [CLASS],
      targetCountries: ["TR"],
    });
    await service.announceListingOpen(listing.id, "invitation");
    const invited = await prisma.listingInvitation.findMany({
      where: { listingId: listing.id },
      select: { invitedCompanyId: true },
    });
    expect(invited.map((i) => i.invitedCompanyId)).toEqual([trConn.company.id]);
  });

  it("PUBLIC olmayan (Seçtiklerim) talepte otomatik davet YOK", async () => {
    const { service } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD" });
    const conn = await seller({ email: "c@a.com" });
    await connect(prisma, owner.company.id, conn.company.id, owner.user.id);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      visibility: "PRIVATE",
      categoryIds: [CLASS],
    });
    await service.announceListingOpen(listing.id, "invitation");
    expect(await prisma.listingInvitation.count({ where: { listingId: listing.id } })).toBe(0);
  });

  it("İngilizce alıcıya önizleme çoğul ve İngilizce (1,200 m · 2 line items)", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD" });
    const conn = await seller({ email: "en@a.com" });
    await prisma.companyUser.updateMany({ where: { companyId: conn.company.id }, data: { locale: "en" } });
    // billingEmail'in dili yok → kullanıcıya düşsün diye kaldır.
    await prisma.company.update({ where: { id: conn.company.id }, data: { billingEmail: null } });
    await connect(prisma, owner.company.id, conn.company.id, owner.user.id);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      visibility: "PUBLIC",
      categoryIds: [CLASS],
    });
    await makeItem(prisma, listing.id, { lineNo: 1, name: "Pipe DN50", quantity: 1200 as never, unit: "metre", unitCode: "M" });
    await makeItem(prisma, listing.id, { lineNo: 2, name: "Elbow", quantity: 3 as never, unit: "adet", unitCode: "PCE" });
    await service.announceListingOpen(listing.id, "invitation");
    const sends = await waitForSends(email, 1);
    const inv = sends.find((s) => s.to.email === conn.user.email)!;
    expect(inv.subject).toBe("You have been invited to a buying request");
    const rows = JSON.stringify(inv.templateData.data.infoRows);
    expect(rows).toContain("Line items (2)");
    expect(rows).toContain("Pipe DN50 — 1,200 m");
    expect(rows).toContain("Elbow — 3 pieces");
  });
});
