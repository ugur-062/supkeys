/**
 * Ziyaret Edenler + İş Analizi (company-views): kayıt/tekilleştirme, kendi
 * görüntülemesi, gizlilik anahtarı (anonimleştirme), herkese açık beacon
 * (bot süzgeci, günlük tekil), paket kapıları, gruplama, temizlik.
 */
import { ForbiddenException } from "@nestjs/common";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { CompanyViewsService } from "../../src/modules/company-views/company-views.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, connect } from "./factories";

const svc = () => new CompanyViewsService(prisma as unknown as PrismaService);
let pseq = 0;
async function publicCompany(over: { city?: string; tier?: "STANDART" | "BRONZ" | "SILVER" | "GOLD" } = {}) {
  pseq += 1;
  const r = await makeCompanyWithUser(prisma, over.tier ? { tier: over.tier } : {});
  await prisma.company.update({
    where: { id: r.company.id },
    data: { name: `Firma ${pseq}`, slug: `firma-cv-${pseq}`, city: over.city ?? "İzmir", publicEnabled: true },
  });
  const item = await prisma.companyItem.create({
    data: { companyId: r.company.id, createdById: r.user.id, name: `Ürün ${pseq}`, unit: "adet", slug: `urun-cv-${pseq}`, isPublic: true, publishedAt: new Date(), images: ["a.webp"] },
  });
  return { ...r, slug: `firma-cv-${pseq}`, item };
}

describe("Ziyaret Edenler — kayıt", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("panel görüntülemesi kimlikli; aynı gün aynı sayfa TEK satır; kendi görüntülemesi YOK", async () => {
    const target = await publicCompany();
    const viewer = await makeCompanyWithUser(prisma);
    const s = svc();
    await s.recordPanelView({ companyId: viewer.company.id, id: viewer.user.id }, { companyId: target.company.id });
    await s.recordPanelView({ companyId: viewer.company.id, id: viewer.user.id }, { companyId: target.company.id });
    await s.recordPanelView({ companyId: viewer.company.id }, { companyId: target.company.id, productId: target.item.id });
    await s.recordPanelView({ companyId: target.company.id }, { companyId: target.company.id });
    const rows = await prisma.companyView.findMany({ where: { targetCompanyId: target.company.id } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.viewerCompanyId === viewer.company.id && r.surface === "PANEL")).toBe(true);
    expect(rows.find((r) => !r.productId)?.viewerUserId).toBe(viewer.user.id);
  });

  it("'ziyaretlerim görünmesin' → sayılır ama kimlik yazılmaz", async () => {
    const target = await publicCompany();
    const viewer = await makeCompanyWithUser(prisma);
    await prisma.company.update({ where: { id: viewer.company.id }, data: { visitsVisible: false } });
    await svc().recordPanelView({ companyId: viewer.company.id, id: viewer.user.id }, { companyId: target.company.id });
    const rows = await prisma.companyView.findMany({ where: { targetCompanyId: target.company.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].viewerCompanyId).toBeNull();
    expect(rows[0].viewerUserId).toBeNull();
    expect(rows[0].dedupeKey.startsWith("o:")).toBe(true);
  });

  it("herkese açık beacon: bot ajanı sayılmaz; ip+ua+gün tekil; ürün slug'ı çözülür; kapalı firma sayılmaz", async () => {
    const target = await publicCompany();
    const s = svc();
    const ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128 Safari/537.36";
    expect(await s.recordPublicView({ type: "profile", companySlug: target.slug, ip: "1.2.3.4", userAgent: "Googlebot/2.1" })).toEqual({ recorded: false });
    expect(await s.recordPublicView({ type: "profile", companySlug: target.slug, ip: "1.2.3.4", userAgent: ua })).toEqual({ recorded: true });
    expect(await s.recordPublicView({ type: "profile", companySlug: target.slug, ip: "1.2.3.4", userAgent: ua })).toEqual({ recorded: false });
    expect(await s.recordPublicView({ type: "product", companySlug: target.slug, productSlug: target.item.slug, ip: "1.2.3.4", userAgent: ua })).toEqual({ recorded: true });
    expect(await s.recordPublicView({ type: "product", companySlug: target.slug, productSlug: "yok", ip: "1.2.3.4", userAgent: ua })).toEqual({ recorded: false });
    await prisma.company.update({ where: { id: target.company.id }, data: { publicEnabled: false } });
    expect(await s.recordPublicView({ type: "profile", companySlug: target.slug, ip: "9.9.9.9", userAgent: ua })).toEqual({ recorded: false });
    const rows = await prisma.companyView.findMany({ where: { targetCompanyId: target.company.id } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.surface === "PUBLIC" && r.viewerCompanyId === null)).toBe(true);
    expect(rows.find((r) => r.productId)?.productId).toBe(target.item.id);
  });
});

describe("Ziyaret Edenler — liste ve İş Analizi", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("STANDART: sayılar döner, liste KİLİTLİ; BRONZ: ziyaretçi firmalar gruplanır (ziyaret, son, ürünler, bağlantı)", async () => {
    const standard = await publicCompany({ tier: "STANDART" });
    const bronz = await publicCompany({ tier: "BRONZ" });
    const a = await makeCompanyWithUser(prisma);
    const b = await makeCompanyWithUser(prisma);
    await prisma.company.update({ where: { id: a.company.id }, data: { name: "Ziyaretçi A", city: "Bursa" } });
    await connect(prisma, a.company.id, bronz.company.id, a.user.id);
    const s = svc();
    for (const t of [standard, bronz]) {
      await s.recordPanelView({ companyId: a.company.id }, { companyId: t.company.id });
      await s.recordPanelView({ companyId: a.company.id }, { companyId: t.company.id, productId: t.item.id });
      await s.recordPanelView({ companyId: b.company.id }, { companyId: t.company.id });
      await s.recordPublicView({ type: "profile", companySlug: t.slug, ip: "5.5.5.5", userAgent: "Mozilla/5.0 Chrome/128" });
    }
    const locked = await s.visitors(standard.auth, { days: 30 });
    expect(locked).toMatchObject({ total: 4, profileViews: 3, productViews: 1, identified: 2, anonymous: 1, locked: true, totalItems: 2 });
    expect(locked.items).toEqual([]);

    const open = await s.visitors(bronz.auth, { days: 30 });
    expect(open.locked).toBe(false);
    expect(open.items).toHaveLength(2);
    const va = open.items.find((i) => i.company.id === a.company.id)!;
    expect(va).toMatchObject({ visits: 2, profileViews: 1, connected: true });
    expect(va.company).toMatchObject({ name: "Ziyaretçi A", city: "Bursa" });
    expect(va.products.map((p) => p.id)).toEqual([bronz.item.id]);
    expect(open.items.find((i) => i.company.id === b.company.id)).toMatchObject({ visits: 1, connected: false });
  });

  it("İş Analizi: Silver+ kapısı; görüntülenme dönem/önceki dönem, en çok bakılan ürün, ziyaretçi şehri, davet/teklif sayıları", async () => {
    const bronz = await publicCompany({ tier: "BRONZ" });
    await expect(svc().insights(bronz.auth)).rejects.toBeInstanceOf(ForbiddenException);

    const me = await publicCompany({ tier: "SILVER" });
    const v1 = await makeCompanyWithUser(prisma);
    await prisma.company.update({ where: { id: v1.company.id }, data: { city: "Ankara" } });
    const s = svc();
    await s.recordPanelView({ companyId: v1.company.id }, { companyId: me.company.id });
    await s.recordPanelView({ companyId: v1.company.id }, { companyId: me.company.id, productId: me.item.id });
    // Önceki döneme düşen bir görüntüleme (45 gün önce).
    await prisma.companyView.create({
      data: { targetCompanyId: me.company.id, surface: "PUBLIC", dedupeKey: "a:old:profile:2026-07-20", viewedAt: new Date(Date.now() - 45 * 86_400_000) },
    });
    await connect(prisma, v1.company.id, me.company.id, v1.user.id);
    const r = await s.insights(me.auth, { days: 30 });
    expect(r.views.profile).toEqual({ current: 1, previous: 1 });
    expect(r.views.product).toEqual({ current: 1, previous: 0 });
    expect(r.views.identifiedVisitors).toEqual({ current: 1, previous: 0 });
    expect(r.topProducts).toEqual([{ id: me.item.id, name: me.item.name, slug: me.item.slug, views: 1 }]);
    expect(r.viewerCities).toEqual([{ city: "Ankara", count: 1 }]);
    expect(r.connections.invitesReceived).toBe(1);
    expect(r.bids).toEqual({ submitted: 0, won: 0 });
    expect(r.inquiries).toEqual({ received: 0, replied: 0, medianFirstReplyHours: null });
  });

  it("temizlik: 180 günden eski satırlar silinir", async () => {
    const me = await publicCompany();
    await prisma.companyView.createMany({
      data: [
        { targetCompanyId: me.company.id, surface: "PUBLIC", dedupeKey: "a:x:profile:old", viewedAt: new Date(Date.now() - 200 * 86_400_000) },
        { targetCompanyId: me.company.id, surface: "PUBLIC", dedupeKey: "a:y:profile:new", viewedAt: new Date() },
      ],
    });
    expect(await svc().purgeExpired()).toBe(1);
    expect(await prisma.companyView.count()).toBe(1);
  });
});
