/**
 * DIŞ TALEP DAVETİ — kuyruk sözleşmesi (2026-09-27, teslim edilebilirlik Faz 0b).
 *
 * Kuyruğa alma (`inviteExternalForListing`): sahiplik, firma günlük tavanı (60),
 * aynı talebe aynı adres bir kez, AYNI alıcı aynı adresi YENİ talebine davet
 * edebilir (eskiden ömür boyu tekti), opt-out/kayıtlı atlanır, elle yazılan adres
 * hemen, AI'ın bulduğu adres alıcının mesai saatinde.
 *
 * Gönderim (`ExternalInviteDispatcher`): talep yayında değilse bekler/düşer,
 * içerik beyaz listesi + alıcının dili, gönderen "Firma (Rothern üzerinden)",
 * adres başına 7 gün freni (AI) + ilgi gevşetir, bekleyenler tek özet e-postada,
 * çıkmış/kayıtlı adrese gitmez, platform günlük tavanı, kapanıştan önce tek
 * hatırlatma. Kayıt: adrese gelmiş TÜM talep davetleri yeni firmaya bağlanır.
 */
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { ReferralOptOutController } from "../../src/modules/company-connections/controllers/referral-optout.controller";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA } from "@nestjs/common/constants";
import { ExternalInviteDispatcher } from "../../src/modules/company-connections/services/external-invite-dispatcher.service";
import { Prisma } from "@rothern/db";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeItem, makeListing } from "./factories";

type SendArg = {
  to: { email: string };
  locale: string;
  fromName?: string;
  templateData: { template: string; data: Record<string, unknown> };
  context: { type: string; id: string };
};

/** Gerçek EmailService gibi EmailLog satırı yazar (sıklık freni geçmişi okur). */
function makeEmail(sent = true) {
  return {
    send: jest.fn(async (a: SendArg) => {
      await prisma.emailLog.create({
        data: {
          template: a.templateData.template,
          toEmail: a.to.email,
          subject: "s",
          provider: "test",
          status: sent ? "SENT" : "FAILED",
          contextType: a.context.type,
          contextId: a.context.id,
        },
      });
      return { emailLogId: "t", sent };
    }),
  };
}

function makeConfig(extra: Record<string, string> = {}) {
  return { get: jest.fn((k: string) => extra[k] ?? (k === "WEB_URL" ? "http://localhost:3000" : undefined)) };
}

function makeService() {
  const blocks = { blockedCompanyIds: jest.fn().mockResolvedValue([]) } as never;
  const notifications = {
    notify: jest.fn().mockResolvedValue(1),
    pushToCompany: jest.fn().mockResolvedValue(1),
    pushToUser: jest.fn().mockResolvedValue(1),
  } as never;
  return new CompanyConnectionsService(
    prisma as never,
    prisma as never,
    blocks,
    makeEmail() as never,
    makeConfig() as never,
    notifications,
    new AuditService(prisma as never),
  );
}

function makeDispatcher(opts: { translations?: unknown; config?: Record<string, string>; sent?: boolean } = {}) {
  const email = makeEmail(opts.sent ?? true);
  const d = new ExternalInviteDispatcher(
    prisma as never,
    email as never,
    makeConfig(opts.config) as never,
    opts.translations as never,
  );
  return { d, email };
}

async function openListing(companyId: string, userId: string, extra: Partial<Prisma.ListingUncheckedCreateInput> = {}) {
  return makeListing(prisma, {
    companyId,
    createdById: userId,
    type: "ALIM",
    status: "OPEN",
    closesAt: new Date(Date.now() + 10 * 24 * 3_600_000),
    ...extra,
  });
}

/** Kuyruktaki davetleri hemen gönderilebilir yap (mesai penceresini test dışı bırakır). */
async function makeDue() {
  await prisma.externalListingInvite.updateMany({ data: { sendAfter: new Date(Date.now() - 60_000) } });
}

const lastSend = (email: { send: jest.Mock }) => email.send.mock.calls.at(-1)?.[0] as SendArg;

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("inviteExternalForListing — kuyruğa alma", () => {
  it("elle yazılan adres QUEUED ve hemen gönderilebilir; talep daveti + bağlantı jetonu yazılır", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await openListing(owner.company.id, owner.user.id);
    const before = Date.now();
    const res = await service.inviteExternalForListing(owner.auth, listing.id, ["dis@firma.com"]);
    expect(res.results).toEqual([expect.objectContaining({ email: "dis@firma.com", status: "QUEUED" })]);
    expect(new Date(res.results[0]!.sendAfter!).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(res.results[0]!.sendAfter!).getTime()).toBeGreaterThanOrEqual(before - 1000);
    const inv = await prisma.externalListingInvite.findFirstOrThrow({ where: { email: "dis@firma.com" } });
    expect(inv).toMatchObject({ listingId: listing.id, state: "QUEUED", source: "MANUAL" });
    expect(await prisma.companyReferralInvite.count({ where: { email: "dis@firma.com" } })).toBe(1);
  });

  it("AYNI alıcı aynı adresi YENİ talebine de davet edebilir; aynı talebe ikinci kez ALREADY_INVITED", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const l1 = await openListing(owner.company.id, owner.user.id);
    const l2 = await openListing(owner.company.id, owner.user.id);
    await service.inviteExternalForListing(owner.auth, l1.id, ["tedarik@x.com"]);
    const again = await service.inviteExternalForListing(owner.auth, l1.id, ["tedarik@x.com"]);
    expect(again.results[0]!.status).toBe("ALREADY_INVITED");
    const second = await service.inviteExternalForListing(owner.auth, l2.id, ["tedarik@x.com"]);
    expect(second.results[0]!.status).toBe("QUEUED");
    // Bağlantı jetonu tek (davet eden × adres), talep daveti iki.
    expect(await prisma.companyReferralInvite.count({ where: { email: "tedarik@x.com" } })).toBe(1);
    expect(await prisma.externalListingInvite.count({ where: { email: "tedarik@x.com" } })).toBe(2);
  });

  it("opt-out OPTED_OUT; kayıtlı adres SKIPPED_REGISTERED; geçersiz INVALID", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const registered = await makeCompanyWithUser(prisma);
    // Kayıtlı = e-postası doğrulanmış hesap (fabrika doğrulama damgası yazmaz).
    await prisma.companyUser.update({ where: { id: registered.user.id }, data: { emailVerifiedAt: new Date() } });
    const listing = await openListing(owner.company.id, owner.user.id);
    await prisma.referralOptOut.create({ data: { email: "istemiyor@x.com" } });
    const res = await service.inviteExternalForListing(owner.auth, listing.id, [
      "istemiyor@x.com",
      registered.user.email.toLowerCase(),
      "bozuk-adres",
    ]);
    const byEmail = Object.fromEntries(res.results.map((r) => [r.email, r.status]));
    expect(byEmail["istemiyor@x.com"]).toBe("OPTED_OUT");
    expect(byEmail[registered.user.email.toLowerCase()]).toBe("SKIPPED_REGISTERED");
    expect(byEmail["bozuk-adres"]).toBe("INVALID");
  });

  /**
   * Arayüz testi 2026-10 code-auth-1 devamı: e-postası DOĞRULANMAMIŞ kayıt
   * adresin sahibini kanıtlamaz (başkasının adresiyle açılmış olabilir).
   * Eskiden o adrese davet SKIPPED_REGISTERED ile atlanıyordu.
   */
  it("e-postası doğrulanmamış kayıt 'kayıtlı' sayılmaz: adres davet alır; doğrulanınca SKIPPED_REGISTERED", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const l1 = await openListing(owner.company.id, owner.user.id);
    const l2 = await openListing(owner.company.id, owner.user.id);
    const signup = await makeCompanyWithUser(prisma);
    await prisma.companyUser.update({
      where: { id: signup.user.id },
      data: { email: "dogrulanmamis@firma.com", emailVerifiedAt: null },
    });

    const before = await service.inviteExternalForListing(owner.auth, l1.id, ["Dogrulanmamis@Firma.com"]);
    expect(before.results).toEqual([
      expect.objectContaining({ email: "dogrulanmamis@firma.com", status: "QUEUED" }),
    ]);
    expect(await prisma.externalListingInvite.count({ where: { email: "dogrulanmamis@firma.com" } })).toBe(1);

    await prisma.companyUser.update({ where: { id: signup.user.id }, data: { emailVerifiedAt: new Date() } });
    const after = await service.inviteExternalForListing(owner.auth, l2.id, ["dogrulanmamis@firma.com"]);
    expect(after.results[0]!.status).toBe("SKIPPED_REGISTERED");
    expect(await prisma.externalListingInvite.count({ where: { email: "dogrulanmamis@firma.com" } })).toBe(1);
  });

  it("silinmiş (deletedAt) hesap doğrulanmış olsa da kayıtlı sayılmaz (değişmedi)", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await openListing(owner.company.id, owner.user.id);
    const gone = await makeCompanyWithUser(prisma);
    await prisma.companyUser.update({
      where: { id: gone.user.id },
      data: { email: "ayrildi@firma.com", emailVerifiedAt: new Date(), deletedAt: new Date() },
    });
    const res = await service.inviteExternalForListing(owner.auth, listing.id, ["ayrildi@firma.com"]);
    expect(res.results[0]!.status).toBe("QUEUED");
  });

  it("firma günlük tavanı 60: fazlası DAILY_LIMIT", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await openListing(owner.company.id, owner.user.id);
    const first = Array.from({ length: 60 }, (_, i) => `t${i}@cap.com`);
    const r1 = await service.inviteExternalForListing(owner.auth, listing.id, first);
    expect(r1.results.filter((r) => r.status === "QUEUED")).toHaveLength(60);
    const r2 = await service.inviteExternalForListing(owner.auth, listing.id, ["fazla@cap.com"]);
    expect(r2.results[0]!.status).toBe("DAILY_LIMIT");
  });

  it("günlük tavan AI üye davetiyle ORTAK (ters yön): 59 üye daveti + 2 adres → 1 QUEUED, 1 DAILY_LIMIT", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await openListing(owner.company.id, owner.user.id);
    for (let i = 0; i < 59; i++) {
      const member = await makeCompanyWithUser(prisma, { tier: "SILVER" });
      await prisma.listingInvitation.create({
        data: { listingId: listing.id, invitedCompanyId: member.company.id, invitedById: owner.user.id, origin: "AI" },
      });
    }
    const r = await service.inviteExternalForListing(owner.auth, listing.id, ["a@ortak.com", "b@ortak.com"]);
    expect(r.results.map((x) => x.status)).toEqual(["QUEUED", "DAILY_LIMIT"]);
  });

  it("AI'ın bulduğu adres alıcının ülkesinde mesai saatine planlanır (Fransa: hafta içi 09-16 Paris)", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await openListing(owner.company.id, owner.user.id);
    const res = await service.inviteExternalForListing(
      owner.auth,
      listing.id,
      [{ email: "achats@societe.fr", country: "FR" }],
      "AI_FORM",
    );
    const at = new Date(res.results[0]!.sendAfter!);
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      hour: "numeric",
      weekday: "short",
      hourCycle: "h23",
    }).formatToParts(at);
    const hour = Number(parts.find((p) => p.type === "hour")!.value);
    const wd = parts.find((p) => p.type === "weekday")!.value;
    expect(["Mon", "Tue", "Wed", "Thu", "Fri"]).toContain(wd);
    expect(hour).toBeGreaterThanOrEqual(9);
    expect(hour).toBeLessThan(16);
  });

  it("önceden onay isteyen ülke (DE, CA): AI'ın bulduğu adrese CONSENT_REQUIRED; elle yazılan gider", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await openListing(owner.company.id, owner.user.id);
    const ai = await service.inviteExternalForListing(
      owner.auth,
      listing.id,
      [{ email: "einkauf@firma.de", country: "DE" }, { email: "sales@firm.ca" }, { email: "vertrieb@rohr.de", country: "AT" }],
      "AI_FORM",
    );
    // Yanlış etiket ("AT") e-posta uzantısını ezmez (B5-12).
    expect(ai.results.map((r) => r.status)).toEqual(["CONSENT_REQUIRED", "CONSENT_REQUIRED", "CONSENT_REQUIRED"]);
    const manual = await service.inviteExternalForListing(owner.auth, listing.id, [{ email: "einkauf@firma.de", country: "DE" }]);
    expect(manual.results[0]!.status).toBe("QUEUED");
  });

  it("kayda kapalı ülke (ABD, İran…): HİÇBİR kaynaktan davet gitmez — elle yazılan dahil (X24)", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await openListing(owner.company.id, owner.user.id);
    const ai = await service.inviteExternalForListing(
      owner.auth,
      listing.id,
      [{ email: "sales@uspipe.com", country: "US" }, { email: "info@tehransteel.ir" }, { email: "info@tubi.it", country: "IT" }],
      "AI_AUTO",
    );
    expect(ai.results.map((r) => [r.email, r.status])).toEqual([
      ["sales@uspipe.com", "COUNTRY_BLOCKED"],
      ["info@tehransteel.ir", "COUNTRY_BLOCKED"],
      ["info@tubi.it", "QUEUED"],
    ]);
    const manual = await service.inviteExternalForListing(owner.auth, listing.id, [{ email: "ventas@tubos.cu" }]);
    expect(manual.results[0]!.status).toBe("COUNTRY_BLOCKED");
    const rows = await prisma.externalListingInvite.findMany({ where: { listingId: listing.id }, select: { email: true } });
    expect(rows.map((r) => r.email)).toEqual(["info@tubi.it"]);
  });

  it("başka firmanın talebi 404; kapalı talep 400", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const other = await makeCompanyWithUser(prisma);
    const foreign = await openListing(other.company.id, other.user.id);
    await expect(service.inviteExternalForListing(owner.auth, foreign.id, ["a@b.com"])).rejects.toThrow(/bulunamadı/i);
    const closed = await openListing(owner.company.id, owner.user.id, { status: "AWARDED" });
    await expect(service.inviteExternalForListing(owner.auth, closed.id, ["a@b.com"])).rejects.toThrow(/taslak|açık/i);
  });

  it("markReferralOptOut: jetondaki adres çıkar; geçersiz jeton 404", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await openListing(owner.company.id, owner.user.id);
    await service.inviteExternalForListing(owner.auth, listing.id, ["opt@x.com"]);
    const inv = await prisma.companyReferralInvite.findFirstOrThrow({ where: { email: "opt@x.com" } });
    // Sayfa açılışı (GET) SALT OKUR: maskeli adres döner, hiçbir şey yazmaz
    // (güvenlik tarayıcıları bağlantıyı açar — derin denetim MU-17).
    expect(await service.describeReferralOptOut(inv.token)).toEqual({ email: "op•••@x.com", optedOut: false });
    expect(await prisma.referralOptOut.findUnique({ where: { email: "opt@x.com" } })).toBeNull();
    expect((await service.markReferralOptOut(inv.token)).ok).toBe(true);
    expect(await prisma.referralOptOut.findUnique({ where: { email: "opt@x.com" } })).not.toBeNull();
    expect(await service.describeReferralOptOut(inv.token)).toEqual({ email: "op•••@x.com", optedOut: true });
    await expect(service.markReferralOptOut("yok-token")).rejects.toThrow();
    await expect(service.describeReferralOptOut("yok-token")).rejects.toThrow();
  });

  it("opt-out ucu: GET okur, yazma yalnız POST (düğme) — derin denetim MU-17", () => {
    const proto = ReferralOptOutController.prototype;
    expect(Reflect.getMetadata(METHOD_METADATA, proto.describe)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(METHOD_METADATA, proto.optOut)).toBe(RequestMethod.POST);
  });
});

describe("ExternalInviteDispatcher — gönderim", () => {
  it("içerik beyaz listesi + ALICININ DİLİ + gönderen 'Firma via Rothern'; durum SENT", async () => {
    const translations = {
      ensureTranslated: jest.fn().mockResolvedValue(true),
      localizeListings: jest.fn(async (items: Array<{ title: string; items: Array<{ name: string }> }>, _ids: string[], locale: string) =>
        locale === "en"
          ? items.map((i) => ({ ...i, title: "Hard hat purchase", items: i.items.map(() => ({ name: "Hard hat" })) }))
          : items,
      ),
    };
    const service = makeService();
    const { d, email } = makeDispatcher({ translations });
    const owner = await makeCompanyWithUser(prisma);
    await prisma.company.update({ where: { id: owner.company.id }, data: { name: "ABC İnşaat" } });
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
    const listing = await openListing(owner.company.id, owner.user.id, {
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
    await service.inviteExternalForListing(owner.auth, listing.id, [{ email: "einkauf@firma.de", country: "DE" }]);

    const r = await d.dispatch();
    expect(r.sent).toBe(1);
    const a = lastSend(email);
    expect(a.locale).toBe("en");
    expect(a.fromName).toBe("ABC İnşaat via Rothern");
    expect(a.templateData.template).toBe("tender_external_invite");
    expect(a.templateData.data).toMatchObject({
      inviterName: "ABC İnşaat",
      tenderTitle: "Hard hat purchase",
      items: [{ name: "Hard hat", quantity: 1200, unitCode: "PCE", unit: "adet" }],
      deliveryPlace: expect.stringMatching(/^Izmir, /),
      closesAt: expect.stringContaining("October 5, 2030"),
    });
    expect(a.templateData.data.registerUrl).toMatch(
      new RegExp(`/en/company/signup\\?ref=[^&]+&redirect=%2Fcompany%2Filan%2F${listing.id}$`),
    );
    const payload = JSON.stringify(a.templateData.data);
    expect(payload).not.toContain("GİZLİ ŞARTNAME");
    expect(payload).not.toContain("targetPrice");
    expect(payload).not.toContain("10001");
    expect(payload).not.toContain("Çiğli");
    expect(await prisma.externalListingInvite.findFirstOrThrow({ where: { email: "einkauf@firma.de" } })).toMatchObject({
      state: "SENT",
    });
  });

  it("EMBARGOLU talebin ve ASKIYA alınmış sahibin daveti beklenir (iptal edilmez); kalkınca gider", async () => {
    const service = makeService();
    const { d, email } = makeDispatcher();
    const owner = await makeCompanyWithUser(prisma);
    const embargoed = await openListing(owner.company.id, owner.user.id, {
      bidsOpenAt: new Date(Date.now() + 2 * 24 * 3_600_000),
    });
    const suspended = await makeCompanyWithUser(prisma);
    const theirs = await openListing(suspended.company.id, suspended.user.id);
    await service.inviteExternalForListing(owner.auth, embargoed.id, ["embargo@x.com"]);
    await service.inviteExternalForListing(suspended.auth, theirs.id, ["askida@x.com"]);
    await prisma.company.update({ where: { id: suspended.company.id }, data: { isBlocked: true } });
    await makeDue();

    await d.dispatch();
    expect(email.send).not.toHaveBeenCalled();
    const states = await prisma.externalListingInvite.findMany({ select: { state: true } });
    expect(states.every((s) => s.state === "QUEUED")).toBe(true);

    await prisma.listing.update({ where: { id: embargoed.id }, data: { bidsOpenAt: new Date(Date.now() - 60_000) } });
    await prisma.company.update({ where: { id: suspended.company.id }, data: { isBlocked: false } });
    await d.dispatch();
    expect(email.send).toHaveBeenCalledTimes(2);
  });

  it("TASLAK talebin daveti beklenir, yayınlanınca gider; kapanan talebinki düşer", async () => {
    const service = makeService();
    const { d, email } = makeDispatcher();
    const owner = await makeCompanyWithUser(prisma);
    const draft = await openListing(owner.company.id, owner.user.id, { status: "DRAFT" });
    const doomed = await openListing(owner.company.id, owner.user.id);
    await service.inviteExternalForListing(owner.auth, draft.id, ["taslak@x.com"]);
    await service.inviteExternalForListing(owner.auth, doomed.id, ["kapanacak@x.com"]);
    await prisma.listing.update({ where: { id: doomed.id }, data: { status: "CANCELLED" } });

    await d.dispatch();
    expect(email.send).not.toHaveBeenCalled();
    expect((await prisma.externalListingInvite.findFirstOrThrow({ where: { email: "kapanacak@x.com" } })).cancelReason).toBe(
      "LISTING_CLOSED",
    );

    await prisma.listing.update({ where: { id: draft.id }, data: { status: "OPEN" } });
    await d.dispatch();
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(lastSend(email).to.email).toBe("taslak@x.com");
  });

  it("aynı adrese iki alıcıdan bekleyen davetler TEK özet e-postada; her kartın bağlantısı kendi jetonu", async () => {
    const service = makeService();
    const { d, email } = makeDispatcher();
    const a = await makeCompanyWithUser(prisma);
    const b = await makeCompanyWithUser(prisma);
    const la = await openListing(a.company.id, a.user.id);
    const lb = await openListing(b.company.id, b.user.id);
    await service.inviteExternalForListing(a.auth, la.id, ["ortak@x.com"], "AI_FORM");
    await service.inviteExternalForListing(b.auth, lb.id, ["ortak@x.com"], "AI_FORM");
    await makeDue();

    await d.dispatch();
    expect(email.send).toHaveBeenCalledTimes(1);
    const sent = lastSend(email);
    expect(sent.templateData.template).toBe("tender_invite_digest");
    const invites = sent.templateData.data.invites as Array<{ ctaUrl: string }>;
    expect(invites).toHaveLength(2);
    const tokens = invites.map((i) => new URL(i.ctaUrl).searchParams.get("ref"));
    expect(new Set(tokens).size).toBe(2);
    expect(await prisma.externalListingInvite.count({ where: { state: "SENT" } })).toBe(2);
  });

  it("7 gün freni: yakın zamanda davet almış adrese AI daveti ERTELENİR; elle yazılan gider; ilgi göstereni fren beklemez", async () => {
    const service = makeService();
    const { d, email } = makeDispatcher();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await openListing(owner.company.id, owner.user.id);
    const recent = new Date(Date.now() - 2 * 24 * 3_600_000);
    for (const addr of ["ai@x.com", "elle@x.com", "ilgili@x.com"]) {
      await prisma.emailLog.create({
        data: { template: "tender_external_invite", toEmail: addr, subject: "s", provider: "test", status: "SENT", contextType: "tender_external_invite", contextId: "eski", queuedAt: recent },
      });
    }
    await service.inviteExternalForListing(owner.auth, listing.id, ["ai@x.com", "ilgili@x.com"], "AI_FORM");
    await service.inviteExternalForListing(owner.auth, listing.id, ["elle@x.com"], "MANUAL");
    await prisma.companyReferralInvite.updateMany({ where: { email: "ilgili@x.com" }, data: { lastClickedAt: new Date() } });
    await makeDue();

    const r = await d.dispatch();
    const to = email.send.mock.calls.map((c) => (c[0] as SendArg).to.email).sort();
    expect(to).toEqual(["elle@x.com", "ilgili@x.com"]);
    expect(r.deferred).toBe(1);
    const held = await prisma.externalListingInvite.findFirstOrThrow({ where: { email: "ai@x.com" } });
    expect(held.state).toBe("QUEUED");
    expect(held.sendAfter.getTime()).toBeGreaterThan(Date.now() + 4 * 24 * 3_600_000);
  });

  it("çıkmış ya da sonradan kayıt olmuş adrese gitmez", async () => {
    const service = makeService();
    const { d, email } = makeDispatcher();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await openListing(owner.company.id, owner.user.id);
    await service.inviteExternalForListing(owner.auth, listing.id, ["cikti@x.com", "katildi@x.com"]);
    await prisma.referralOptOut.create({ data: { email: "cikti@x.com" } });
    const joined = await makeCompanyWithUser(prisma);
    await prisma.companyUser.update({
      where: { id: joined.user.id },
      data: { email: "katildi@x.com", emailVerifiedAt: new Date() },
    });

    await d.dispatch();
    expect(email.send).not.toHaveBeenCalled();
    const reasons = (await prisma.externalListingInvite.findMany({ orderBy: { email: "asc" } })).map((i) => i.cancelReason);
    expect(reasons).toEqual(["OPTED_OUT", "REGISTERED"]);
  });

  /**
   * Arayüz testi 2026-10 code-auth-1 devamı: adresle açılmış ama e-postası
   * DOĞRULANMAMIŞ kayıt (adresin sahibi olmayabilir) kuyruktaki daveti
   * REGISTERED diye iptal ettiriyor, adrese e-posta gitmiyordu.
   */
  it("e-postası doğrulanmamış kayıt daveti DURDURMAZ; doğrulandıktan sonra gelen davet REGISTERED ile düşer", async () => {
    const service = makeService();
    const { d, email } = makeDispatcher();
    const owner = await makeCompanyWithUser(prisma);
    const l1 = await openListing(owner.company.id, owner.user.id);
    const l2 = await openListing(owner.company.id, owner.user.id);
    await service.inviteExternalForListing(owner.auth, l1.id, ["bekleyen@x.com"]);
    const signup = await makeCompanyWithUser(prisma);
    await prisma.companyUser.update({
      where: { id: signup.user.id },
      data: { email: "bekleyen@x.com", emailVerifiedAt: null },
    });

    const first = await d.dispatch();
    expect(first.sent).toBe(1);
    expect(lastSend(email).to.email).toBe("bekleyen@x.com");
    expect(
      await prisma.externalListingInvite.findFirstOrThrow({ where: { listingId: l1.id } }),
    ).toMatchObject({ state: "SENT", cancelReason: null });

    // Yeni davet kuyruğa girdikten SONRA adres doğrulanır → gönderim anında düşer.
    await service.inviteExternalForListing(owner.auth, l2.id, ["bekleyen@x.com"]);
    await prisma.companyUser.update({ where: { id: signup.user.id }, data: { emailVerifiedAt: new Date() } });
    await makeDue();
    email.send.mockClear();
    await d.dispatch();
    expect(email.send).not.toHaveBeenCalled();
    expect(
      await prisma.externalListingInvite.findFirstOrThrow({ where: { listingId: l2.id } }),
    ).toMatchObject({ state: "CANCELLED", cancelReason: "REGISTERED" });
  });

  it("kapıdan önce kuyruğa girmiş kayda kapalı ülke daveti gönderim anında düşer (MU-09)", async () => {
    const service = makeService();
    const { d, email } = makeDispatcher();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await openListing(owner.company.id, owner.user.id);
    await service.inviteExternalForListing(owner.auth, listing.id, ["ok@x.com", "a@x.com", "b@x.com"]);
    // Eski (düzeltme öncesi) satırlar: e-posta uzantısı ya da etiket kapalı ülke.
    await prisma.externalListingInvite.updateMany({ where: { email: "a@x.com" }, data: { email: "sales@pipes.us" } });
    await prisma.externalListingInvite.updateMany({ where: { email: "b@x.com" }, data: { country: "IR" } });
    await makeDue();

    await d.dispatch();
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(lastSend(email).to.email).toBe("ok@x.com");
    const rows = await prisma.externalListingInvite.findMany({ orderBy: { email: "asc" }, select: { email: true, state: true, cancelReason: true } });
    expect(rows).toEqual([
      { email: "b@x.com", state: "CANCELLED", cancelReason: "COUNTRY_BLOCKED" },
      { email: "ok@x.com", state: "SENT", cancelReason: null },
      { email: "sales@pipes.us", state: "CANCELLED", cancelReason: "COUNTRY_BLOCKED" },
    ]);
  });

  it("platform günlük tavanı: taban 1 iken turda tek e-posta", async () => {
    const service = makeService();
    const { d, email } = makeDispatcher({ config: { COLD_INVITE_BASE_DAILY: "1" } });
    const owner = await makeCompanyWithUser(prisma);
    const listing = await openListing(owner.company.id, owner.user.id);
    await service.inviteExternalForListing(owner.auth, listing.id, ["a@x.com", "b@x.com", "c@x.com"]);
    const r = await d.dispatch();
    expect(r.cap.cap).toBe(1);
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(await prisma.externalListingInvite.count({ where: { state: "QUEUED" } })).toBe(2);
  });

  it("kapanıştan önce TEK hatırlatma", async () => {
    const service = makeService();
    const { d, email } = makeDispatcher();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await openListing(owner.company.id, owner.user.id, {
      closesAt: new Date(Date.now() + 30 * 3_600_000),
    });
    await service.inviteExternalForListing(owner.auth, listing.id, ["hatirla@x.com"]);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3_600_000);
    await prisma.externalListingInvite.updateMany({ data: { state: "SENT", sentAt: threeDaysAgo } });
    await prisma.emailLog.create({
      data: { template: "tender_external_invite", toEmail: "hatirla@x.com", subject: "s", provider: "test", status: "SENT", contextType: "tender_external_invite", contextId: "ilk", queuedAt: threeDaysAgo },
    });

    const r = await d.dispatch();
    expect(r.reminders).toBe(1);
    expect(lastSend(email).templateData.data.reminder).toBe(true);
    await d.dispatch();
    expect(email.send).toHaveBeenCalledTimes(1);
  });
});

describe("ExternalInviteDispatcher — üst üste binen tur ve iptal (derin denetim MU-14)", () => {
  it("aynı anda koşan iki tur aynı daveti İKİ kez göndermez (atomik sahiplenme)", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const listing = await openListing(owner.company.id, owner.user.id);
    await service.inviteExternalForListing(owner.auth, listing.id, ["cift@firma.com"]);
    await makeDue();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let entered!: () => void;
    const inside = new Promise<void>((r) => (entered = r));
    const passthrough = { localizeListings: jest.fn(async (items: unknown[]) => items) };
    const slow = makeDispatcher({
      translations: {
        ...passthrough,
        ensureTranslated: jest.fn(async () => {
          entered();
          await gate;
          return true;
        }),
      },
    });
    const fast = makeDispatcher({ translations: { ...passthrough, ensureTranslated: jest.fn().mockResolvedValue(true) } });
    const first = slow.d.dispatch();
    await inside; // ilk tur adresi aldı, çeviri bekliyor
    await fast.d.dispatch();
    release();
    await first;
    expect(slow.email.send.mock.calls.length + fast.email.send.mock.calls.length).toBe(1);
    expect((await prisma.externalListingInvite.findFirstOrThrow({ where: { email: "cift@firma.com" } })).state).toBe("SENT");
  });

  it("aynı anda koşan iki tur bir adresin satırlarını BÖLÜŞMEZ: adrese tek e-posta, iki kart (derin denetim LU-33)", async () => {
    const service = makeService();
    const a = await makeCompanyWithUser(prisma);
    const b = await makeCompanyWithUser(prisma);
    const la = await openListing(a.company.id, a.user.id);
    const lb = await openListing(b.company.id, b.user.id);
    await service.inviteExternalForListing(a.auth, la.id, ["bolunmez@x.com"], "AI_FORM");
    await service.inviteExternalForListing(b.auth, lb.id, ["bolunmez@x.com"], "AI_FORM");
    await makeDue();
    const one = makeDispatcher();
    const two = makeDispatcher();
    await Promise.all([one.d.dispatch(), two.d.dispatch()]);
    const sends = [...one.email.send.mock.calls, ...two.email.send.mock.calls];
    expect(sends).toHaveLength(1);
    expect(((sends[0]![0] as SendArg).templateData.data.invites as unknown[]).length).toBe(2);
    expect(await prisma.externalListingInvite.count({ where: { state: "SENT" } })).toBe(2);
  });

  it("iptal edilmiş referral davetinin kapanış hatırlatması GİTMEZ", async () => {
    const service = makeService();
    const { d, email } = makeDispatcher();
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await openListing(owner.company.id, owner.user.id, {
      closesAt: new Date(Date.now() + 30 * 3_600_000),
    });
    await service.inviteExternalForListing(owner.auth, listing.id, ["vazgecildi@x.com"]);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3_600_000);
    await prisma.externalListingInvite.updateMany({ data: { state: "SENT", sentAt: threeDaysAgo } });
    await prisma.emailLog.create({
      data: { template: "tender_external_invite", toEmail: "vazgecildi@x.com", subject: "s", provider: "test", status: "SENT", contextType: "tender_external_invite", contextId: "ilk", queuedAt: threeDaysAgo },
    });
    const ref = await prisma.companyReferralInvite.findFirstOrThrow({ where: { email: "vazgecildi@x.com" } });
    await service.cancelReferralInvite(owner.auth, ref.id);

    const r = await d.dispatch();
    expect(r.reminders).toBe(0);
    expect(email.send).not.toHaveBeenCalled();
  });
});

describe("Faz 3 — kayıtsız önizleme + önceden doldurma", () => {
  it("davet jetonuyla talebin TÜM kalemleri beyaz listeyle görünür; başka talep ve geçersiz jeton 404", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma);
    await prisma.company.update({ where: { id: owner.company.id }, data: { name: "ABC İnşaat" } });
    const listing = await openListing(owner.company.id, owner.user.id, { title: "Bağlantı elemanları" });
    for (let i = 0; i < 14; i++) {
      await makeItem(prisma, listing.id, {
        name: `Kalem ${i + 1}`,
        quantity: new Prisma.Decimal(10),
        unit: "adet",
        unitCode: "PCE",
        targetPrice: new Prisma.Decimal(5),
        specification: "GİZLİ ŞARTNAME",
      });
    }
    const other = await openListing(owner.company.id, owner.user.id);
    await service.inviteExternalForListing(owner.auth, listing.id, ["dis@firma.com"]);
    const token = (await prisma.companyReferralInvite.findFirstOrThrow({ where: { email: "dis@firma.com" } })).token;
    // Kuyruktaki (henüz gitmemiş) davetin talebi okunamaz.
    await expect(service.invitePreview(token)).rejects.toMatchObject({ status: 404 });
    await prisma.externalListingInvite.updateMany({ data: { state: "SENT", sentAt: new Date() } });

    const p = await service.invitePreview(token);
    expect(p).toMatchObject({ listingId: listing.id, inviterName: "ABC İnşaat", tenderTitle: "Bağlantı elemanları", itemCount: 14, closed: false, accepted: false });
    expect(p.items).toHaveLength(14);
    const json = JSON.stringify(p);
    expect(json).not.toContain("GİZLİ ŞARTNAME");
    expect(json).not.toContain("targetPrice");
    expect(json).not.toContain("showName");
    await expect(service.invitePreview(token, other.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.invitePreview("yok")).rejects.toMatchObject({ status: 404 });
  });

  it("GÜVENLİK: aynı jetonla kuyruktaki, embargolu ve moderasyonla kapatılmış talep okunamaz (yayın denetimi 2026-09-28)", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma);
    const sent = await openListing(owner.company.id, owner.user.id);
    const queued = await openListing(owner.company.id, owner.user.id);
    const embargoed = await openListing(owner.company.id, owner.user.id, { bidsOpenAt: new Date(Date.now() + 86_400_000) });
    const moderated = await openListing(owner.company.id, owner.user.id);
    for (const l of [sent, embargoed, moderated]) {
      await service.inviteExternalForListing(owner.auth, l.id, ["hedef@firma.com"]);
    }
    await prisma.externalListingInvite.updateMany({ data: { state: "SENT", sentAt: new Date() } });
    await service.inviteExternalForListing(owner.auth, queued.id, ["hedef@firma.com"]);
    await prisma.listing.update({ where: { id: moderated.id }, data: { status: "CLOSED" } });
    const token = (await prisma.companyReferralInvite.findFirstOrThrow({ where: { email: "hedef@firma.com" } })).token;

    expect((await service.invitePreview(token, sent.id)).listingId).toBe(sent.id);
    for (const l of [queued, embargoed, moderated]) {
      await expect(service.invitePreview(token, l.id)).rejects.toMatchObject({ status: 404 });
    }
    // `l` verilmezse en yeni GÖNDERİLMİŞ ve görünür talep döner.
    expect((await service.invitePreview(token)).listingId).toBe(sent.id);
  });

  it("ziyaret: ilgi damgası + adresin KENDİ firma bilgisi (AI keşfinden); geçersiz jetonda boş", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await openListing(owner.company.id, owner.user.id);
    await service.inviteExternalForListing(owner.auth, listing.id, [{ email: "info@viti.it", country: "IT" }]);
    const run = await prisma.supplierDiscoveryRun.create({ data: { companyId: owner.company.id, listingId: listing.id, trigger: "PUBLISH", state: "DONE" } });
    await prisma.supplierDiscoveryCandidate.create({
      data: { runId: run.id, name: "Viti Srl", email: "info@viti.it", website: "viti.it", country: "IT", city: "Milano" },
    });
    const token = (await prisma.companyReferralInvite.findFirstOrThrow({ where: { email: "info@viti.it" } })).token;
    expect(await service.markReferralVisited(token)).toEqual({
      email: "info@viti.it",
      companyName: "Viti Srl",
      website: "viti.it",
      country: "IT",
      city: "Milano",
    });
    expect((await prisma.companyReferralInvite.findFirstOrThrow({ where: { token } })).lastClickedAt).not.toBeNull();
    expect(await service.markReferralVisited("yok")).toEqual({ email: null, companyName: null, website: null, country: null, city: null });
  });
});

/**
 * Yayın denetimi 2026-09-28 Bölüm 5: referral davet iptali satırı SİLİYORDU →
 * günlük dış davet tavanı (bugün açılan talep davetleri, cascade ile gidiyordu),
 * günlük referral tavanı ve 7 günlük fren sıfırlanıyordu. İptal artık CANCELLED.
 */
describe("referral davet iptali — satır silinmez, tavan ve fren korunur", () => {
  it("iptal: satır CANCELLED kalır, kuyruktaki talep davetleri düşer, dağıtıcı göndermez, jeton önizlemede geçersiz", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await openListing(owner.company.id, owner.user.id);
    await service.inviteExternalForListing(owner.auth, listing.id, ["iptal@firma.com", "gonderildi@firma.com"]);
    const [queued, sent] = await Promise.all(
      ["iptal@firma.com", "gonderildi@firma.com"].map((email) => prisma.companyReferralInvite.findFirstOrThrow({ where: { email } })),
    );
    await prisma.externalListingInvite.updateMany({ where: { email: "gonderildi@firma.com" }, data: { state: "SENT", sentAt: new Date() } });

    await service.cancelReferralInvite(owner.auth, queued!.id);
    await service.cancelReferralInvite(owner.auth, sent!.id);

    expect((await prisma.companyReferralInvite.findUniqueOrThrow({ where: { id: queued!.id } })).status).toBe("CANCELLED");
    expect(await prisma.externalListingInvite.findFirstOrThrow({ where: { email: "iptal@firma.com" } })).toMatchObject({
      state: "CANCELLED",
      cancelReason: "REFERRAL_CANCELLED",
    });
    // Gönderilmiş talep daveti SİLİNMEZ (günlük tavan onu sayar) ama jetonu artık önizleme açmaz.
    expect((await prisma.externalListingInvite.findFirstOrThrow({ where: { email: "gonderildi@firma.com" } })).state).toBe("SENT");
    await expect(service.invitePreview(sent!.token)).rejects.toMatchObject({ status: 404 });
    expect(await service.listReferralInvites(owner.company.id)).toHaveLength(0);

    // Dağıtıcı iptal edilmiş jetonun (yarışta kuyrukta kalmış) davetini göndermez.
    await prisma.externalListingInvite.updateMany({ where: { email: "iptal@firma.com" }, data: { state: "QUEUED" } });
    await makeDue();
    const { d, email } = makeDispatcher();
    await d.dispatch();
    expect(email.send).not.toHaveBeenCalled();
  });

  it("günlük 60 tavanı: 60 davet + hepsinin iptali sonrası yeni adres yine DAILY_LIMIT", async () => {
    const service = makeService();
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const listing = await openListing(owner.company.id, owner.user.id);
    const first = Array.from({ length: 60 }, (_, i) => `ilk${i}@firma.com`);
    await service.inviteExternalForListing(owner.auth, listing.id, first);
    for (const r of await prisma.companyReferralInvite.findMany({ where: { inviterCompanyId: owner.company.id } })) {
      await service.cancelReferralInvite(owner.auth, r.id);
    }

    const again = await service.inviteExternalForListing(owner.auth, listing.id, ["yeni@firma.com"]);
    expect(again.results[0]!.status).toBe("DAILY_LIMIT");
  });

  it("referral: iptal edilen adrese 7 gün içinde yeniden davet ALREADY_INVITED; süre geçince AYNI satırla PENDING'e döner", async () => {
    const { service } = (() => {
      const blocks = { blockedCompanyIds: jest.fn().mockResolvedValue([]) } as never;
      const notifications = { notify: jest.fn(), pushToCompany: jest.fn(), pushToUser: jest.fn() } as never;
      return {
        service: new CompanyConnectionsService(
          prisma as never,
          prisma as never,
          blocks,
          makeEmail() as never,
          makeConfig() as never,
          notifications,
          new AuditService(prisma as never),
        ),
      };
    })();
    const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await service.inviteByEmail(owner.auth, "tekrar@firma.com");
    const inv = await prisma.companyReferralInvite.findFirstOrThrow({ where: { email: "tekrar@firma.com" } });
    await prisma.emailLog.create({
      data: { template: "referral_invite", toEmail: inv.email, subject: "d", provider: "test", status: "SENT", contextType: "referral_invite", contextId: inv.id },
    });
    await service.cancelReferralInvite(owner.auth, inv.id);

    await expect(service.inviteByEmail(owner.auth, "tekrar@firma.com")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ALREADY_INVITED" }),
    });

    await prisma.emailLog.updateMany({ where: { contextId: inv.id }, data: { queuedAt: new Date(Date.now() - 8 * 24 * 3_600_000) } });
    await expect(service.inviteByEmail(owner.auth, "tekrar@firma.com")).resolves.toMatchObject({ kind: "invited" });
    const after = await prisma.companyReferralInvite.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.status).toBe("PENDING");
  });
});

// Yayın denetimi 2026-09-28 Bölüm 6 (yerel uçtan uca koşuda yakalandı): AI
// kapalıyken çeviri hiç gelmez; dağıtıcı yine de 10 dk boyunca 2'şer dk
// erteliyordu — kaynak dildeki (TR→TR) davet dahil.
describe("ExternalInviteDispatcher — AI kapalı", () => {
  it("çeviri servisi kapalıysa beklemez: davet ilk turda özgün metinle gider", async () => {
    const translations = {
      enabled: false,
      ensureTranslated: jest.fn().mockResolvedValue(false),
      localizeListings: jest.fn(async (items: unknown[]) => items),
    };
    const service = makeService();
    const { d, email } = makeDispatcher({ translations });
    const owner = await makeCompanyWithUser(prisma);
    const listing = await openListing(owner.company.id, owner.user.id, { title: "Somun alımı" });
    await makeItem(prisma, listing.id, { name: "M8 somun" });
    await service.inviteExternalForListing(owner.auth, listing.id, [{ email: "satinalma@ornek.com.tr", country: "TR" }]);
    await makeDue();

    await d.dispatch();

    expect(translations.ensureTranslated).not.toHaveBeenCalled();
    expect(email.send).toHaveBeenCalledTimes(1);
    expect((await prisma.externalListingInvite.findFirstOrThrow({ where: { email: "satinalma@ornek.com.tr" } })).state).toBe("SENT");
  });
});
