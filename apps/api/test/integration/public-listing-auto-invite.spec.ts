/**
 * HERKESE AÇIK TALEP — bağlantılar OTOMATİK DAVETLİ + kategori duyurusu
 * (2026-09-27, kullanıcı: "herkese açık paylaşılsa bile mutlaka bağlantılarına
 * davet gitsin; ek olarak kategori uyumu olanlara da gitsin").
 *
 * ÜCRETSİZ DÖNEM (2026-10-07): sınırlı firma = DOĞRULANMAMIŞ firma. Kilitli
 * duyuru paket değil firma doğrulaması ister; hiçbir e-posta paket anmaz.
 *
 * Sözleşme:
 *  - Yayın duyurusunda (announceListingOpen "invitation") alıcının GEÇERLİ
 *    bağlantılarının tamamı davetli olur — kategoriden bağımsız.
 *  - Davetliye kategori duyurusu GİTMEZ (tek e-posta: davet).
 *  - Kategorisi uyan bağlantısız DOĞRULANMAMIŞ firma doğrulama çağrılı e-posta
 *    alır (CTA doğrulama sayfası, talep bağlantısı YOK; incelemedeyse "onay
 *    bekleniyor"); doğrulanmış firma doğrudan talebe giden e-posta alır.
 *  - E-postalar talep önizlemesi taşır (kalemler + miktar, kapanış).
 *  - Görünürlük ülkesi dışındaki bağlantı ve PUBLIC olmayan talep: otomatik davet YOK.
 */
import { FREE_PERIOD } from "../../src/common/company/effective-tier";
import { prisma, truncateAll } from "./test-db";
import { connect, makeCompanyWithUser, makeItem, makeListing, proveAccounts } from "./factories";
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

async function seller(opts: {
  country?: string;
  tier?: "STANDART" | "SILVER";
  /** Varsayılan VERIFIED (ücretsiz dönemde tam erişim); sınırlı firma için UNVERIFIED / PENDING. */
  status?: "UNVERIFIED" | "PENDING" | "VERIFIED";
  cats?: string[];
  email: string;
}) {
  const c = await makeCompanyWithUser(prisma, {
    country: opts.country ?? "TR",
    tier: opts.tier ?? "STANDART",
    ...(opts.status ? { companyVerificationStatus: opts.status } : {}),
  });
  await prisma.company.update({
    where: { id: c.company.id },
    data: { sellerCategoryIds: opts.cats ?? [], billingEmail: opts.email },
  });
  // A real member (its e-mail address is proven); `status` above is the
  // company verification. The sign-up placeholder has its own test below.
  await proveAccounts(prisma, c.company.id);
  return c;
}

describe("herkese açık talep — bağlantılar otomatik davetli + kategori duyurusu", () => {
  it("bağlantılar davet alır (kategoriden bağımsız), davetliye duyuru gitmez; doğrulanmamış firmaya doğrulama çağrısı, doğrulanmışa talep bağlantısı", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD" });
    // Bağlantılı firmalardan biri sınırlı (doğrulanmamış): davet doğrulama gerektirmez.
    const connNoCat = await seller({ cats: ["20000000"], status: "UNVERIFIED", email: "bagli@a.com" });
    const connCat = await seller({ cats: [SEG], email: "bagli-kat@b.com" });
    await seller({ cats: [SEG], status: "UNVERIFIED", email: "dogrulanmamis@c.com" });
    await seller({ cats: [SEG], status: "PENDING", email: "incelemede@e.com" });
    // Saklı kademe STANDART: erişimi yalnız doğrulama veriyor.
    await seller({ cats: [SEG], email: "dogrulanmis@d.com" });
    // Bağlantıları tam erişimli alıcı başlatır (geçerlilik davet edenin erişiminden).
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
    const sends = await waitForSends(email, 5);

    // Otomatik davet: iki bağlantı davetli, bağlantısızlar değil.
    const invited = await prisma.listingInvitation.findMany({
      where: { listingId: listing.id },
      select: { invitedCompanyId: true, invitedById: true },
    });
    expect(invited.map((i) => i.invitedCompanyId).sort()).toEqual(
      [connNoCat.company.id, connCat.company.id].sort(),
    );
    expect(invited.every((i) => i.invitedById === owner.user.id)).toBe(true);

    // Tam beş e-posta; kategorisi de uyan bağlantı YALNIZ davet alır.
    const to = sends.map((s) => s.to.email).sort();
    expect(to).toEqual(
      ["bagli-kat@b.com", "bagli@a.com", "dogrulanmis@d.com", "dogrulanmamis@c.com", "incelemede@e.com"].sort(),
    );
    const byTo = (e: string) => sends.find((s) => s.to.email === e)!;

    const inv = byTo("bagli@a.com");
    expect(inv.subject).toBe("Bir alım talebine davet edildiniz");
    const invRows = JSON.stringify(inv.templateData.data.infoRows);
    expect(invRows).toContain("Kalemler (1)");
    expect(invRows).toContain("Paslanmaz boru DN50 — 1.200 m");
    expect(invRows).toContain("Son teklif tarihi");
    expect(byTo("bagli-kat@b.com").subject).toBe("Bir alım talebine davet edildiniz");

    const free = byTo("dogrulanmamis@c.com");
    expect(free.subject).toBe("Kategorinizde yeni bir alıcı var — teklif vermek için doğrulanın");
    const freePayload = JSON.stringify(free.templateData);
    expect(freePayload).toContain("/company/ayarlar/dogrulama");
    expect(free.templateData.data.ctaLabel).toBe("Ücretsiz doğrulan");
    expect(freePayload).not.toContain("/company/ilan/");
    expect(JSON.stringify(free.templateData.data.infoRows)).toContain("Paslanmaz boru DN50");
    // Kategori duyurusu anonim: alıcı firmanın adı geçmez.
    expect(freePayload).not.toContain(owner.company.name);

    // İncelemedeki firma: "doğrulanın" denmez — onay bekleniyor + durum bağlantısı.
    const pending = byTo("incelemede@e.com");
    const pendingPayload = JSON.stringify(pending.templateData);
    expect(pendingPayload).toMatch(/doğrulamanız inceleniyor/);
    expect(pending.templateData.data.ctaLabel).toBe("Doğrulama durumunu gör");
    expect(pendingPayload).toContain("/company/ayarlar/dogrulama");
    expect(pendingPayload).not.toContain("/company/ilan/");

    const full = byTo("dogrulanmis@d.com");
    expect(full.subject).toBe("Size uygun yeni bir alım talebi yayınlandı");
    expect(JSON.stringify(full.templateData)).toContain(`/company/ilan/${listing.id}`);

    // Ücretsiz dönem: hiçbir e-posta paket adı ya da paket sayfası taşımaz.
    expect(JSON.stringify(sends)).not.toMatch(/silver|gold|\/company\/premium|\/plans/i);
  });

  describe("saklı paket (ücretsiz dönem anahtarı KAPALI)", () => {
    // Uyuyan paket kapısı: anahtar kapalıyken kategori duyurusunu saklı paket açar; paketsiz ∧ doğrulanmış firmaya paketsiz çağrı yok → duyuru gitmez.
    beforeEach(() => {
      jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("paketli firmaya talep bağlantısı; paketsiz doğrulanmışa duyuru gitmez; paketsiz doğrulanmamışa doğrulama çağrısı", async () => {
      const { service, email } = makeService();
      const owner = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD" });
      await seller({ cats: [SEG], tier: "SILVER", email: "silver@d.com" });
      await seller({ cats: [SEG], email: "paketsiz@c.com" });
      await seller({ cats: [SEG], status: "UNVERIFIED", email: "dogrulanmamis@c.com" });
      const listing = await makeListing(prisma, {
        companyId: owner.company.id,
        createdById: owner.user.id,
        visibility: "PUBLIC",
        categoryIds: [CLASS],
        number: "ROT-000078",
      });
      await service.announceListingOpen(listing.id, "invitation");
      const sends = await waitForSends(email, 2);
      expect(sends.map((s) => s.to.email).sort()).toEqual(["dogrulanmamis@c.com", "silver@d.com"]);
      const paid = sends.find((s) => s.to.email === "silver@d.com")!;
      expect(JSON.stringify(paid.templateData)).toContain(`/company/ilan/${listing.id}`);
      const unverified = sends.find((s) => s.to.email === "dogrulanmamis@c.com")!;
      expect(JSON.stringify(unverified.templateData)).toContain("/company/ayarlar/dogrulama");
      expect(JSON.stringify(unverified.templateData)).not.toContain("/company/ilan/");
      expect(JSON.stringify(sends)).not.toMatch(/silver'a|gold|\/company\/premium/i);
    });
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

  it("a connection without a proven account (sign-up placeholder) is not invited automatically; once its address is proven it is (review CLEAN-4)", async () => {
    const { service, email } = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD" });
    // What a sign-up through the buyer's referral link leaves before the code
    // is entered: an ACTIVE connection to a company whose only account is
    // unverified (the factory default). It is deleted after 7 days with its
    // rows, so no invitation may be written for it.
    const placeholder = await makeCompanyWithUser(prisma, { tier: "STANDART", companyVerificationStatus: "UNVERIFIED" });
    const member = await seller({ email: "uye@a.com" });
    await connect(prisma, owner.company.id, placeholder.company.id, owner.user.id);
    await connect(prisma, owner.company.id, member.company.id, owner.user.id);
    const publish = async () => {
      const listing = await makeListing(prisma, {
        companyId: owner.company.id,
        createdById: owner.user.id,
        visibility: "PUBLIC",
        categoryIds: [CLASS],
        closesAt: new Date(Date.now() + 5 * 86_400_000),
      });
      await service.announceListingOpen(listing.id, "invitation");
      await waitForSends(email, 1);
      return (
        await prisma.listingInvitation.findMany({ where: { listingId: listing.id }, select: { invitedCompanyId: true } })
      )
        .map((i) => i.invitedCompanyId)
        .sort();
    };

    expect(await publish()).toEqual([member.company.id]);
    // Nothing was mailed to the unproven address either.
    expect(email.send.mock.calls.map((c) => (c[0] as Sent).to.email)).not.toContain(placeholder.user.email);

    await proveAccounts(prisma, placeholder.company.id);
    expect(await publish()).toEqual([member.company.id, placeholder.company.id].sort());
  });
});
