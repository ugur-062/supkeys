/**
 * Faz AI-4 — asistan aksiyon çerçevesi sözleşmesi:
 *  - propose: doğrulanmış özet + oturuma pendingAction; sahiplik dışı/eksik
 *    girdi → ok:false problem (kart çıkmaz).
 *  - confirm: TEK kullanımlık (ikinci confirm reddedilir), süre dolunca
 *    reddedilir, yürütme MEVCUT servis kapılarından geçer (kullanıcı kimliği).
 *  - publish_tender: eksik zorunlulu taslak ÖNERİLEMEZ; tam taslak onayla
 *    gerçek ilana dönüşür ve oturum taslağı temizlenir.
 */
import { Prisma } from "@rothern/db";
import { AssistantActionsService } from "../../src/modules/ai/assistant/assistant-actions.service";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyRequestDefaultsService } from "../../src/modules/company-request-defaults/company-request-defaults.service";
import { DEFAULT_TIME_ZONE } from "../../src/common/time/country-time-zone";
import { CompanyOrdersService } from "../../src/modules/company-orders/services/company-orders.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { prisma, truncateAll } from "./test-db";
import { makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { makeService } from "./make-service";
import { runWithLocale } from "../../src/common/i18n/locale-context";

const auditStub = { log: jest.fn().mockResolvedValue(undefined) };

let codeSeq = 0;
/** Firma kısa kodu ata (factory üretmez) — SHORT_CODE formatında. */
async function giveCode(companyId: string): Promise<string> {
  const code = `TEST-${String(1000 + codeSeq++).slice(-4)}`;
  await prisma.company.update({ where: { id: companyId }, data: { rothernId: code } });
  return code;
}

function makeOrdersService() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "test", sent: true }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  return new CompanyOrdersService(
    prisma as never,
    email as never,
    config as never,
    new NotificationService(prisma as never),
    new AuditService(prisma as never),
    prisma as never,
  );
}

function makeActions() {
  const { service: listings } = makeService();
  return new AssistantActionsService(
    prisma as unknown as PrismaService,
    listings,
    makeOrdersService(),
    auditStub as unknown as AuditService,
    new CompanyRequestDefaultsService(prisma as never, auditStub as unknown as AuditService),
  );
}

async function makeSession(userId: string, companyId: string, draft?: object) {
  return prisma.aiChatSession.create({
    data: {
      userId,
      companyId,
      title: "test",
      ...(draft ? { tenderDraft: draft as Prisma.InputJsonValue } : {}),
    },
  });
}

/** Zorunluları tam bir konuşma taslağı (sanitizer'dan geçecek şekilde). */
function fullDraft(overrides: Record<string, unknown> = {}) {
  return {
    title: "500 adet baret alımı",
    description: "Şantiye için",
    primaryCurrency: "TRY",
    deliveryTerm: "DOMESTIC_DELIVERED",
    paymentCategory: "OPEN_ACCOUNT",
    bidsCloseAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    keywords: ["baret"],
    items: [{ name: "Baret", quantity: 500, unit: "adet" }],
    suggestedCategoryIds: ["30991900"],
    ...overrides,
  };
}

/** Aktif bağlantılı + kodlu davetli firma kurar (publish/invite akışları için). */
async function makeConnectedInvitee(ownerCompanyId: string, ownerUserId: string, name = "Davetli AŞ") {
  const invitee = await makeCompanyWithUser(prisma, { name });
  const code = await giveCode(invitee.company.id);
  await prisma.companyConnection.create({
    data: {
      inviterCompanyId: ownerCompanyId,
      inviteeCompanyId: invitee.company.id,
      invitedById: ownerUserId,
      status: "ACTIVE",
      origin: "PREMIUM",
    },
  });
  return { invitee, code };
}

async function seedCategory(code = "30991900") {
  await prisma.category.create({
    data: {
      id: code,
      code,
      nameTr: "Kişisel koruyucu donanım (KKD)",
      level: 3,
      isActive: true,
      sortOrder: 0,
    },
  });
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  jest.clearAllMocks();
  await truncateAll();
});

describe("proposeSendInvites", () => {
  it("sahip olunmayan ihale için ok:false döner (kart çıkmaz)", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const other = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: other.company.id,
      createdById: other.user.id,
      type: "ALIM",
    });
    const session = await makeSession(owner.user.id, owner.company.id);

    const otherCode = await giveCode(other.company.id);
    const out = await actions.proposeSendInvites(owner.auth, session.id, {
      listingId: listing.id,
      rothernIds: [otherCode],
    });
    expect(out.ok).toBe(false);
    const s = await prisma.aiChatSession.findUnique({ where: { id: session.id } });
    expect(s?.pendingAction).toBeNull();
  });

  it("geçerli öneri: pendingAction yazılır, özet firma adını içerir", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const invitee = await makeCompanyWithUser(prisma, { name: "Davetli AŞ" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
    });
    const session = await makeSession(owner.user.id, owner.company.id);

    const inviteeCode = await giveCode(invitee.company.id);
    const out = await actions.proposeSendInvites(owner.auth, session.id, {
      listingId: listing.id,
      rothernIds: [inviteeCode],
    });
    expect(out.ok).toBe(true);
    expect(out.pending!.severity).toBe("normal");
    expect(out.pending!.summary.join(" ")).toContain("Davetli AŞ");
  });

  it("confirm: bağlantılı firmaya davet oluşur; İKİNCİ confirm reddedilir", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const invitee = await makeCompanyWithUser(prisma);
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: owner.company.id,
        inviteeCompanyId: invitee.company.id,
        invitedById: owner.user.id,
        status: "ACTIVE",
        origin: "PREMIUM",
      },
    });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
    });
    const session = await makeSession(owner.user.id, owner.company.id);
    const inviteeCode = await giveCode(invitee.company.id);
    const out = await actions.proposeSendInvites(owner.auth, session.id, {
      listingId: listing.id,
      rothernIds: [inviteeCode],
    });
    expect(out.ok).toBe(true);

    const res = await actions.confirm(owner.auth, session.id, out.pending!.id);
    expect(res.status).toBe("executed");
    const inv = await prisma.listingInvitation.findFirst({
      where: { listingId: listing.id, invitedCompanyId: invitee.company.id },
    });
    expect(inv).not.toBeNull();
    expect(auditStub.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ai.action_executed" }),
    );

    // Tek kullanım: aynı onay tekrar yürütülemez.
    await expect(
      actions.confirm(owner.auth, session.id, out.pending!.id),
    ).rejects.toThrow();
  });

  it("süresi dolmuş onay reddedilir", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const invitee = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
    });
    const session = await makeSession(owner.user.id, owner.company.id);
    const inviteeCode = await giveCode(invitee.company.id);
    const out = await actions.proposeSendInvites(owner.auth, session.id, {
      listingId: listing.id,
      rothernIds: [inviteeCode],
    });
    // Süreyi geçmişe çek (kayıt üstünde).
    const s = await prisma.aiChatSession.findUnique({ where: { id: session.id } });
    const action = s!.pendingAction as Record<string, unknown>;
    await prisma.aiChatSession.update({
      where: { id: session.id },
      data: {
        pendingAction: {
          ...action,
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
    await expect(
      actions.confirm(owner.auth, session.id, out.pending!.id),
    ).rejects.toThrow(/süresi doldu/i);
  });

  it("başka kullanıcının oturumundaki onayı confirm EDEMEZ", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const attacker = await makeCompanyWithUser(prisma);
    const invitee = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
    });
    const session = await makeSession(owner.user.id, owner.company.id);
    const inviteeCode = await giveCode(invitee.company.id);
    const out = await actions.proposeSendInvites(owner.auth, session.id, {
      listingId: listing.id,
      rothernIds: [inviteeCode],
    });
    await expect(
      actions.confirm(attacker.auth, session.id, out.pending!.id),
    ).rejects.toThrow();
  });
});

describe("proposePublishTender", () => {
  it("davetli firma verilmeden yayın önerilemez", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const session = await makeSession(owner.user.id, owner.company.id, fullDraft());
    const out = await actions.proposePublishTender(owner.auth, session.id, {
      type: "ALIM",
      rothernIds: [],
    });
    expect(out.ok).toBe(false);
    expect(out.problem).toMatch(/davet/i);
  });

  it("eksik zorunlulu taslak önerilemez (ok:false + eksik listesi)", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const { code } = await makeConnectedInvitee(owner.company.id, owner.user.id);
    const session = await makeSession(
      owner.user.id,
      owner.company.id,
      fullDraft({ bidsCloseAt: null, deliveryTerm: null }),
    );
    const out = await actions.proposePublishTender(owner.auth, session.id, {
      type: "ALIM",
      rothernIds: [code],
    });
    expect(out.ok).toBe(false);
    expect(out.problem).toMatch(/eksik/i);
  });

  it("teslimat adresi olmayan firma için ok:false (adres yönlendirmesi)", async () => {
    const actions = makeActions();
    await seedCategory();
    const owner = await makeCompanyWithUser(prisma);
    const { code } = await makeConnectedInvitee(owner.company.id, owner.user.id);
    const session = await makeSession(owner.user.id, owner.company.id, fullDraft());
    const out = await actions.proposePublishTender(owner.auth, session.id, {
      type: "ALIM",
      rothernIds: [code],
    });
    expect(out.ok).toBe(false);
    expect(out.problem).toMatch(/adres/i);
  });

  it("tam taslak: kritik onay kartı; confirm → ilan OPEN + taslak temizlenir", async () => {
    const actions = makeActions();
    await seedCategory();
    const owner = await makeCompanyWithUser(prisma);
    await prisma.companyAddress.create({
      data: {
        companyId: owner.company.id,
        type: "TESLIMAT",
        title: "Depo",
        addressLine: "Test Mah. 1",
        city: "İstanbul",
      },
    });
    const { invitee, code } = await makeConnectedInvitee(owner.company.id, owner.user.id);
    // Derin denetim LU-04: sohbette verilen hedef birim fiyat yayındaki kaleme yazılır.
    const session = await makeSession(
      owner.user.id,
      owner.company.id,
      fullDraft({ items: [{ name: "Baret", quantity: 500, unit: "adet", targetUnitPrice: 250 }] }),
    );

    const out = await actions.proposePublishTender(owner.auth, session.id, {
      type: "ALIM",
      rothernIds: [code],
    });
    expect(out.ok).toBe(true);
    expect(out.pending!.severity).toBe("critical");
    expect(out.pending!.summary.join(" ")).toContain("500 adet baret alımı");
    expect(out.pending!.summary.join(" ")).toContain("Davetli AŞ");

    const res = await actions.confirm(owner.auth, session.id, out.pending!.id);
    expect(res.status).toBe("executed");
    const listing = await prisma.listing.findFirst({
      where: { companyId: owner.company.id, title: "500 adet baret alımı" },
    });
    expect(listing?.status).toBe("OPEN");
    expect(listing?.categoryIds).toEqual(["30991900"]);
    const items = await prisma.listingItem.findMany({ where: { listingId: listing!.id } });
    expect(items.map((i) => Number(i.targetPrice))).toEqual([250]);
    const invRows = await prisma.listingInvitation.count({
      where: { listingId: listing!.id, invitedCompanyId: invitee.company.id },
    });
    expect(invRows).toBe(1);
    const s = await prisma.aiChatSession.findUnique({ where: { id: session.id } });
    expect(s?.tenderDraft).toBeNull();
    expect(s?.pendingAction).toBeNull();
  });

  it("onay kartı okuyucunun dilinde: kategori adı nameEn (Türkçe ad sızmaz)", async () => {
    const actions = makeActions();
    await seedCategory();
    await prisma.category.update({ where: { id: "30991900" }, data: { nameEn: "Personal protective equipment" } });
    const owner = await makeCompanyWithUser(prisma);
    await prisma.companyAddress.create({
      data: { companyId: owner.company.id, type: "TESLIMAT", title: "Depo", addressLine: "Test Mah. 1", city: "İstanbul" },
    });
    const { code } = await makeConnectedInvitee(owner.company.id, owner.user.id);
    const session = await makeSession(owner.user.id, owner.company.id, fullDraft());
    const out = await runWithLocale("en", () =>
      actions.proposePublishTender(owner.auth, session.id, { type: "ALIM", rothernIds: [code] }),
    );
    expect(out.ok).toBe(true);
    const text = out.pending!.summary.join(" ");
    expect(text).toContain("Personal protective equipment");
    expect(text).not.toContain("Kişisel koruyucu donanım");
  });

  it("MU-07: kapanis kartta Istanbul saatiyle ve okuyucunun dilinde (ham UTC ISO yok); yalniz gun → 23:59", async () => {
    const actions = makeActions();
    await seedCategory();
    const owner = await makeCompanyWithUser(prisma);
    await prisma.companyAddress.create({
      data: { companyId: owner.company.id, type: "TESLIMAT", title: "Depo", addressLine: "Test Mah. 1", city: "Ankara" },
    });
    const { code } = await makeConnectedInvitee(owner.company.id, owner.user.id);
    // Model yalniz gun verdi (istem "YYYY-MM-DD" istiyor) — 10 gun sonrasi.
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIME_ZONE }).format(
      new Date(Date.now() + 10 * 86_400_000),
    );
    const session = await makeSession(owner.user.id, owner.company.id, fullDraft({ bidsCloseAt: day }));
    const out = await actions.proposePublishTender(owner.auth, session.id, { type: "ALIM", rothernIds: [code] });
    expect(out.ok).toBe(true);
    const text = out.pending!.summary.join(" ");
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(text).toContain("23:59");
    const closingLine = out.pending!.summary.find((l) => l.startsWith("Kapan"))!;
    expect(closingLine).not.toContain("GMT");

    const en = await runWithLocale("en", () =>
      actions.proposePublishTender(owner.auth, session.id, { type: "ALIM", rothernIds: [code] }),
    );
    expect(en.pending!.summary.join(" ")).toMatch(/11:59\sPM \(GMT\+3\)/);

    const res = await actions.confirm(owner.auth, session.id, en.pending!.id);
    expect(res.status).toBe("executed");
    const listing = await prisma.listing.findFirst({ where: { companyId: owner.company.id } });
    // Istanbul 23:59 = 20:59Z (sabit +03).
    expect(listing!.closesAt!.toISOString()).toBe(`${day}T20:59:00.000Z`);
  });

  it("MU-07: teslimat adresi — varsayilan TESLIMAT eski ILETISIM adresinin onune gecer ve kartta gorunur", async () => {
    const actions = makeActions();
    await seedCategory();
    const owner = await makeCompanyWithUser(prisma);
    await prisma.companyAddress.create({
      data: {
        companyId: owner.company.id,
        type: "ILETISIM",
        title: "Merkez",
        addressLine: "Test Mah. 1",
        city: "Ankara",
        createdAt: new Date(Date.now() - 86_400_000),
      },
    });
    await prisma.companyAddress.create({
      data: { companyId: owner.company.id, type: "TESLIMAT", title: "Depo 1", addressLine: "Test Mah. 2", city: "Bursa" },
    });
    const depo = await prisma.companyAddress.create({
      data: {
        companyId: owner.company.id,
        type: "TESLIMAT",
        title: "Ana Depo",
        addressLine: "Test Mah. 3",
        district: "Gebze",
        city: "Kocaeli",
        isDefault: true,
      },
    });
    const { code } = await makeConnectedInvitee(owner.company.id, owner.user.id);
    const session = await makeSession(owner.user.id, owner.company.id, fullDraft());
    const out = await actions.proposePublishTender(owner.auth, session.id, { type: "ALIM", rothernIds: [code] });
    expect(out.ok).toBe(true);
    expect(out.pending!.summary).toContain("Teslimat adresi: Ana Depo, Gebze, Kocaeli");
    await actions.confirm(owner.auth, session.id, out.pending!.id);
    const listing = await prisma.listing.findFirst({ where: { companyId: owner.company.id } });
    expect(listing?.deliveryAddressId).toBe(depo.id);
  });

  it("MU-07: teslimat adresi — talep sartlari profilindeki adres once gelir (web hizli talep sirasi)", async () => {
    const actions = makeActions();
    await seedCategory();
    const owner = await makeCompanyWithUser(prisma);
    await prisma.companyAddress.create({
      data: { companyId: owner.company.id, type: "TESLIMAT", title: "Ana Depo", addressLine: "Test Mah. 3", city: "Kocaeli", isDefault: true },
    });
    const santiye = await prisma.companyAddress.create({
      data: { companyId: owner.company.id, type: "TESLIMAT", title: "Santiye", addressLine: "Test Mah. 4", city: "Izmir" },
    });
    await prisma.company.update({
      where: { id: owner.company.id },
      data: {
        requestDefaults: {
          targetCountries: [],
          visibility: "PUBLIC",
          deliveryTerm: null,
          paymentCategory: "OPEN_ACCOUNT",
          paymentDays: null,
          advancePercent: null,
          lcType: null,
          primaryCurrency: "TRY",
          allowedCurrencies: ["TRY"],
          isSealedBid: false,
          bidVisibility: "OWN_ONLY",
          requireAllItems: false,
          requireBidDocument: false,
          closeDays: 7,
          deliveryAddressId: santiye.id,
          billingSameAsDelivery: true,
        },
      },
    });
    const { code } = await makeConnectedInvitee(owner.company.id, owner.user.id);
    const session = await makeSession(owner.user.id, owner.company.id, fullDraft());
    const out = await actions.proposePublishTender(owner.auth, session.id, { type: "ALIM", rothernIds: [code] });
    expect(out.ok).toBe(true);
    expect(out.pending!.summary).toContain("Teslimat adresi: Santiye, Izmir");
    const stored = await prisma.aiChatSession.findUnique({ where: { id: session.id } });
    const dto = (stored!.pendingAction as { params: { dto: { deliveryAddressId: string } } }).params.dto;
    expect(dto.deliveryAddressId).toBe(santiye.id);
  });

  /** Adresli sahip + bağlantılı davetli + kategori — kart testleri için. */
  async function publishSetup() {
    await seedCategory();
    const owner = await makeCompanyWithUser(prisma);
    await prisma.companyAddress.create({
      data: { companyId: owner.company.id, type: "TESLIMAT", title: "Depo", addressLine: "Test Mah. 1", city: "İstanbul" },
    });
    const { code } = await makeConnectedInvitee(owner.company.id, owner.user.id);
    return { owner, code };
  }

  it("canli AI: kartta teslim/odeme sekli okuyucunun dilinde etiket (ham enum kodu yok)", async () => {
    const actions = makeActions();
    const { owner, code } = await publishSetup();
    const session = await makeSession(owner.user.id, owner.company.id, fullDraft({ paymentDays: 30 }));
    const expected = {
      tr: ["Açık Hesap · 30 gün vade", "Adrese teslim, indirilmiş — nakliye ve indirme satıcıya ait"],
      en: ["Open account · 30 days payment term", "Delivered to address, unloaded — freight and unloading by the seller"],
      ru: ["Открытый счёт · отсрочка 30 дней", "Доставка до адреса с разгрузкой — перевозка и разгрузка за продавцом"],
    } as const;
    for (const locale of ["tr", "en", "ru"] as const) {
      const out = await runWithLocale(locale, () =>
        actions.proposePublishTender(owner.auth, session.id, { type: "ALIM", rothernIds: [code] }),
      );
      expect(out.ok).toBe(true);
      const text = out.pending!.summary.join("\n");
      expect(text).not.toContain("OPEN_ACCOUNT");
      expect(text).not.toContain("DOMESTIC_DELIVERED");
      for (const part of expected[locale]) expect(text).toContain(part);
    }
  });

  it("canli AI: baslik tekrarsiz; 'belgeden geldi' uyarisi yalniz belge taslaginda", async () => {
    const actions = makeActions();
    const { owner, code } = await publishSetup();
    const chat = await makeSession(owner.user.id, owner.company.id, fullDraft());
    const out = await actions.proposePublishTender(owner.auth, chat.id, { type: "ALIM", rothernIds: [code] });
    expect(out.ok).toBe(true);
    expect(out.pending!.summary[0]).toBe("Satın alma talebi YAYINLANACAK: 500 adet baret alımı");
    const text = out.pending!.summary.join("\n");
    expect(text).not.toContain("belgeden geldi");
    expect(text).toContain("sohbetten derlendi");

    const doc = await makeSession(
      owner.user.id,
      owner.company.id,
      fullDraft({ pageSummaries: ["Sayfa 1: baret teknik şartnamesi"] }),
    );
    const docOut = await actions.proposePublishTender(owner.auth, doc.id, { type: "ALIM", rothernIds: [code] });
    expect(docOut.ok).toBe(true);
    const docText = docOut.pending!.summary.join("\n");
    expect(docText).toContain("belgeden geldi");
    expect(docText).not.toContain("sohbetten derlendi");
  });

  it("canli AI: ayni turdaki (henuz yazilmamis) taslak verilirse DB taslagi yerine o kullanilir", async () => {
    const actions = makeActions();
    const { owner, code } = await publishSetup();
    // Oturumda taslak YOK — taslak bu turda toplandı, tur sonunda yazılacak.
    const empty = await makeSession(owner.user.id, owner.company.id);
    const out = await actions.proposePublishTender(
      owner.auth,
      empty.id,
      { type: "ALIM", rothernIds: [code] },
      fullDraft({ title: "Tek mesajda hazırlanan talep" }),
    );
    expect(out.ok).toBe(true);
    expect(out.pending!.summary.join(" ")).toContain("Tek mesajda hazırlanan talep");

    // Bayat DB taslağı yerine turdaki güncel taslak kartta ve pendingAction'da.
    const stale = await makeSession(owner.user.id, owner.company.id, fullDraft({ title: "Eski başlık" }));
    const fresh = await actions.proposePublishTender(
      owner.auth,
      stale.id,
      { type: "ALIM", rothernIds: [code] },
      fullDraft({ title: "Yeni başlık" }),
    );
    expect(fresh.ok).toBe(true);
    const stored = await prisma.aiChatSession.findUnique({ where: { id: stale.id } });
    expect((stored!.pendingAction as { params: { dto: { title: string } } }).params.dto.title).toBe("Yeni başlık");
    // Başka kullanıcının oturumuna turdaki taslakla da kart yazılamaz.
    const other = await makeCompanyWithUser(prisma);
    const { code: otherCode } = await makeConnectedInvitee(other.company.id, other.user.id, "Diğer AŞ");
    const foreign = await actions.proposePublishTender(
      other.auth,
      empty.id,
      { type: "ALIM", rothernIds: [otherCode] },
      fullDraft(),
    );
    expect(foreign.ok).toBe(false);
    expect(foreign.problem).toMatch(/taslağı yok/);
    const emptyAfter = await prisma.aiChatSession.findUnique({ where: { id: empty.id } });
    expect((emptyAfter!.pendingAction as { params: { dto: { title: string } } }).params.dto.title).toBe(
      "Tek mesajda hazırlanan talep",
    );
  });

  it("reject: hiçbir şey yürütülmez, pendingAction temizlenir", async () => {
    const actions = makeActions();
    await seedCategory();
    const owner = await makeCompanyWithUser(prisma);
    await prisma.companyAddress.create({
      data: {
        companyId: owner.company.id,
        type: "TESLIMAT",
        title: "Depo",
        addressLine: "Test Mah. 1",
        city: "İstanbul",
      },
    });
    const { code } = await makeConnectedInvitee(owner.company.id, owner.user.id);
    const session = await makeSession(owner.user.id, owner.company.id, fullDraft());
    const out = await actions.proposePublishTender(owner.auth, session.id, {
      type: "ALIM",
      rothernIds: [code],
    });
    const res = await actions.reject(owner.auth, session.id, out.pending!.id);
    expect(res.status).toBe("rejected");
    expect(
      await prisma.listing.count({ where: { companyId: owner.company.id } }),
    ).toBe(0);
  });
});

describe("Faz 2 — eleme + toplu kazandırma", () => {
  async function bidSetup() {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const bidder = await makeCompanyWithUser(prisma, { name: "Teklifçi AŞ" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      title: "Baret alımı",
    });
    const item = await makeItem(prisma, listing.id, {
      quantity: new Prisma.Decimal(2),
    });
    const bid = await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: bidder.company.id,
      createdById: bidder.user.id,
      amount: "200",
      currency: "TRY",
      items: [{ itemId: item.id, unitPrice: "100" }],
    });
    const session = await makeSession(owner.user.id, owner.company.id);
    return { actions, owner, bidder, listing, bid, session };
  }

  it("eleme: özet tedarikçi adını taşır; confirm → bid LOST", async () => {
    const { actions, owner, listing, bid, session } = await bidSetup();
    const out = await actions.proposeEliminateBid(owner.auth, session.id, {
      listingId: listing.id,
      bidId: bid.id,
      reason: "fiyat yüksek",
    });
    expect(out.ok).toBe(true);
    expect(out.pending!.severity).toBe("normal");
    expect(out.pending!.summary.join(" ")).toContain("Teklifçi AŞ");

    const res = await actions.confirm(owner.auth, session.id, out.pending!.id);
    expect(res.status).toBe("executed");
    const updated = await prisma.listingBid.findUnique({ where: { id: bid.id } });
    expect(updated?.status).toBe("LOST");
  });

  it("eleme: başka firmanın ihalesi için ok:false", async () => {
    const { actions, listing, bid } = await bidSetup();
    const outsider = await makeCompanyWithUser(prisma);
    const session2 = await makeSession(outsider.user.id, outsider.company.id);
    const out = await actions.proposeEliminateBid(outsider.auth, session2.id, {
      listingId: listing.id,
      bidId: bid.id,
    });
    expect(out.ok).toBe(false);
  });

  it("kazandırma: kritik kart (GERİ ALINAMAZ uyarılı); confirm → AWARDED + sipariş", async () => {
    const { actions, owner, listing, bid, session } = await bidSetup();
    const out = await actions.proposeAwardTender(owner.auth, session.id, {
      listingId: listing.id,
      bidId: bid.id,
    });
    expect(out.ok).toBe(true);
    expect(out.pending!.severity).toBe("critical");
    expect(out.pending!.summary.join(" ")).toMatch(/GERİ ALINAMAZ/);

    const res = await actions.confirm(owner.auth, session.id, out.pending!.id);
    expect(res.status).toBe("executed");
    const l = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(l?.status).toBe("AWARDED");
    expect(await prisma.companyOrder.count()).toBe(1);
  });

  it("kazandırma: elenmiş (LOST) teklif önerilemez", async () => {
    const { actions, owner, listing, bid, session } = await bidSetup();
    await prisma.listingBid.update({ where: { id: bid.id }, data: { status: "LOST" } });
    const out = await actions.proposeAwardTender(owner.auth, session.id, {
      listingId: listing.id,
      bidId: bid.id,
    });
    expect(out.ok).toBe(false);
  });
});

describe("Faz 3 — teklif verme + teslim alma", () => {
  it("place_bid: tüm kalemler fiyatlı → kritik kart (toplam doğru); confirm → SUBMITTED bid", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const bidder = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
      title: "Kablo alımı",
      primaryCurrency: "TRY",
      allowedCurrencies: ["TRY"],
    });
    const item = await makeItem(prisma, listing.id, {
      quantity: new Prisma.Decimal(10),
      name: "NYM kablo",
    });
    const session = await makeSession(bidder.user.id, bidder.company.id);

    const out = await actions.proposePlaceBid(bidder.auth, session.id, {
      listingId: listing.id,
      items: [{ itemId: item.id, unitPrice: 50 }],
      deliveryTime: "W1_2",
      validityDays: 30,
    });
    expect(out.ok).toBe(true);
    expect(out.pending!.severity).toBe("critical");
    expect(out.pending!.summary.join(" ")).toContain("TOPLAM: 500 ₺");
    // Kalem satırı da okuyucunun dilinde: birim etiketi + sembollü tutar.
    expect(out.pending!.summary.join(" ")).toContain("10 adet × 50 ₺ = 500 ₺");
    expect(out.pending!.summary.join(" ")).toContain("Teslim: 1-2 hafta");
    expect(out.pending!.summary.join(" ")).toMatch(/GERİ ÇEKİLEMEZ/);
    // Teslim süresi kartta okuyucunun dilinde (Türkçe sözlük sabit değil) —
    // ayrı oturumda, ilk kartın onayı bozulmasın.
    const enSession = await makeSession(bidder.user.id, bidder.company.id);
    const en = await runWithLocale("en", () =>
      actions.proposePlaceBid(bidder.auth, enSession.id, {
        listingId: listing.id,
        items: [{ itemId: item.id, unitPrice: 50 }],
        deliveryTime: "W1_2",
        validityDays: 30,
      }),
    );
    expect(en.pending!.summary.join(" ")).toContain("Delivery: 1–2 weeks");
    expect(en.pending!.summary.join(" ")).not.toContain("hafta");
    // İngilizcede birim etiketi çevrilir, sembol önde.
    expect(en.pending!.summary.join(" ")).toContain("10 pieces × ₺50 = ₺500");
    expect(en.pending!.summary.join(" ")).toContain("TOTAL: ₺500");

    const res = await actions.confirm(bidder.auth, session.id, out.pending!.id);
    expect(res.status).toBe("executed");
    const bid = await prisma.listingBid.findFirst({
      where: { listingId: listing.id, bidderCompanyId: bidder.company.id },
    });
    expect(bid?.status).toBe("SUBMITTED");
    expect(bid?.amount.toString()).toBe("500");
  });

  it("MU-07 place_bid: kesirli miktarli kalemde confirm dogrulamada dusmez (amount DTO'ya yazilmaz)", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const bidder = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
      primaryCurrency: "TRY",
      allowedCurrencies: ["TRY"],
    });
    const item = await makeItem(prisma, listing.id, {
      quantity: new Prisma.Decimal("12.5"),
      unit: "kg",
      name: "Bakir tel",
    });
    const session = await makeSession(bidder.user.id, bidder.company.id);
    const out = await actions.proposePlaceBid(bidder.auth, session.id, {
      listingId: listing.id,
      items: [{ itemId: item.id, unitPrice: 3.33 }],
      deliveryTime: "W1_2",
      validityDays: 15,
    });
    expect(out.ok).toBe(true);
    const stored = await prisma.aiChatSession.findUnique({ where: { id: session.id } });
    const dto = (stored!.pendingAction as { params: { dto: Record<string, unknown> } }).params.dto;
    expect(dto.amount).toBeUndefined();
    const res = await actions.confirm(bidder.auth, session.id, out.pending!.id);
    expect(res.status).toBe("executed");
    const bid = await prisma.listingBid.findFirst({
      where: { listingId: listing.id, bidderCompanyId: bidder.company.id },
    });
    expect(bid?.status).toBe("SUBMITTED");
  });

  it("MU-07 place_bid: 2'den fazla ondalikli birim fiyat propose'da reddedilir (kart cikmaz)", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const bidder = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
    });
    const item = await makeItem(prisma, listing.id, { name: "Somun" });
    const session = await makeSession(bidder.user.id, bidder.company.id);
    const out = await actions.proposePlaceBid(bidder.auth, session.id, {
      listingId: listing.id,
      items: [{ itemId: item.id, unitPrice: 1.335 }],
      deliveryTime: "W1_2",
    });
    expect(out.ok).toBe(false);
    expect(out.problem).toContain("Somun");
    const stored = await prisma.aiChatSession.findUnique({ where: { id: session.id } });
    expect(stored?.pendingAction).toBeNull();
    // Gecerlilik de propose'da istenir (placeBid gonderimde zorunlu tutuyor).
    const noValidity = await actions.proposePlaceBid(bidder.auth, session.id, {
      listingId: listing.id,
      items: [{ itemId: item.id, unitPrice: 1.5 }],
      deliveryTime: "W1_2",
    });
    expect(noValidity.ok).toBe(false);
    expect(noValidity.problem).toContain("validityDays");
  });

  it("place_bid: eksik kalem fiyatı → ok:false, kalem adı söylenir", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const bidder = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
    });
    await makeItem(prisma, listing.id, { name: "Fiyatsız kalem" });
    const session = await makeSession(bidder.user.id, bidder.company.id);
    const out = await actions.proposePlaceBid(bidder.auth, session.id, {
      listingId: listing.id,
      items: [],
    });
    expect(out.ok).toBe(false);
    expect(out.problem).toContain("Fiyatsız kalem");
  });

  it("place_bid: belge zorunlu ihale sayfaya yönlendirilir", async () => {
    const actions = makeActions();
    const owner = await makeCompanyWithUser(prisma);
    const bidder = await makeCompanyWithUser(prisma);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      format: "RFQ",
      visibility: "PUBLIC",
      requireBidDocument: true,
    });
    await makeItem(prisma, listing.id, {});
    const session = await makeSession(bidder.user.id, bidder.company.id);
    const out = await actions.proposePlaceBid(bidder.auth, session.id, {
      listingId: listing.id,
      items: [],
    });
    expect(out.ok).toBe(false);
    expect(out.problem).toMatch(/belge/i);
  });

  it("mark_order_received: IN_DELIVERY sipariş → kart; confirm → oto-COMPLETED (madde 17)", async () => {
    const actions = makeActions();
    const seller = await makeCompanyWithUser(prisma, { name: "Satıcı AŞ" });
    const buyer = await makeCompanyWithUser(prisma);
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 1000,
        status: "IN_DELIVERY",
        paymentTiming: "AFTER_DELIVERY",
      } as never,
    });
    const session = await makeSession(buyer.user.id, buyer.company.id);
    const out = await actions.proposeMarkOrderReceived(buyer.auth, session.id, {
      orderId: order.id,
    });
    expect(out.ok).toBe(true);
    expect(out.pending!.summary.join(" ")).toContain("Satıcı AŞ");

    const res = await actions.confirm(buyer.auth, session.id, out.pending!.id);
    expect(res.status).toBe("executed");
    const updated = await prisma.companyOrder.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe("COMPLETED");
  });

  it("mark_order_received: satıcı taraf öneremez (alıcı-scope)", async () => {
    const actions = makeActions();
    const seller = await makeCompanyWithUser(prisma);
    const buyer = await makeCompanyWithUser(prisma);
    const order = await prisma.companyOrder.create({
      data: {
        sellerCompanyId: seller.company.id,
        buyerCompanyId: buyer.company.id,
        amount: 1000,
        status: "IN_DELIVERY",
        paymentTiming: "AFTER_DELIVERY",
      } as never,
    });
    const session = await makeSession(seller.user.id, seller.company.id);
    const out = await actions.proposeMarkOrderReceived(seller.auth, session.id, {
      orderId: order.id,
    });
    expect(out.ok).toBe(false);
  });
});
