/**
 * BILDIRIM DILI (2026-10-07, sahip bulgusu staging): "Bildirimler dil secimine
 * gore degismiyor; hangi dil seciliyken geldiyse o sekilde kaliyor."
 *
 * Sozlesme: satir uretim GIRDILERINI saklar (`Notification.i18n`) ve
 * `GET /notifications` her satiri OKUYANIN guncel diliyle yeniden uretir
 * (`Accept-Language`; yoksa kullanicinin kayitli dili): metin, tipli tarih /
 * tutar, talep basligi (sayfa basina TEK sorgu) ve CTA adresi. Eski satir
 * (i18n yok) saklanan metinle doner, adresi cevrilebiliyorsa okuyanin diline
 * cevrilir. Katalogdan dusmus anahtar saklanan metne duser (firlatmaz, ham
 * anahtar basmaz). Okunmamis sayaci ve okundu isaretleme etkilenmez.
 *
 * HTTP katmani: bu pakette Nest uygulamasi ayaga kaldirilmaz; gercek
 * `NotificationController.list` handler'i `LocaleMiddleware`'in yaptigi gibi
 * `runWithLocale(<Accept-Language>)` baglaminda cagrilir.
 */
import { CompanyRole } from "@rothern/db";
import { appRoutes } from "../../src/common/company/app-routes";
import {
  applyUserLocale,
  runWithLocale,
} from "../../src/common/i18n/locale-context";
import {
  dateParam,
  listingTitleParam,
  moneyParam,
  numberParam,
} from "../../src/common/notifications/notification-params";
import { NotificationController } from "../../src/modules/notifications/notification.controller";
import {
  serializeNotificationParams,
  toStoredI18n,
} from "../../src/modules/notifications/notification-i18n";
import {
  NotificationService,
  type NotificationRow,
} from "../../src/modules/notifications/notification.service";
import { RealtimeService } from "../../src/modules/realtime/realtime.service";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/decorators/current-company-user.decorator";
import { makeCompany, makeListing, makeUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

const BASE = "https://www.rothern.com";
const LISTING_ID = "lst-steel-1";
const ORDER_ID = "ord-77";
const LISTING_TITLE = "Çelik boru alımı";

/** NBSP / dar NBSP -> bosluk (Intl ciktisi dile gore ozel bosluk basar). */
const plain = (s: string | null) => (s ?? "").replace(/\s/g, " ");

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

function rig() {
  const titleCalls: { ids: string[]; locale: string }[] = [];
  const translated: Record<string, string> = {
    en: "Steel pipe purchase",
    ru: "Закупка стальных труб",
  };
  const translations = {
    localizeListings: async (
      items: { title: string }[],
      ids: string[],
      locale: string,
    ) => {
      titleCalls.push({ ids: [...ids], locale });
      return items.map((it, i) =>
        translated[locale] && ids[i] === LISTING_ID
          ? { ...it, title: translated[locale] }
          : it,
      );
    },
  };
  const pings: unknown[][] = [];
  const realtime = {
    pingNotification: (...args: unknown[]) => {
      pings.push(args);
    },
  };
  const service = new NotificationService(
    prisma as never,
    realtime as never,
    translations as never,
  );
  const controller = new NotificationController(service);
  return { service, controller, titleCalls, pings };
}

async function seed() {
  const co = await makeCompany(prisma, {});
  // Alicinin KAYITLI dili Ingilizce: satirlar yazma aninda Ingilizce uretilir.
  const user = await makeUser(prisma, co.id, [CompanyRole.SATIN_ALMACI], {
    locale: "en",
  });
  const auth = {
    userId: user.id,
    companyId: co.id,
    email: user.email,
    roles: [CompanyRole.SATIN_ALMACI],
    isOwner: false,
  } as unknown as AuthenticatedCompanyUser;
  // Okuma yolu ceviriyi yalniz talebin GUNCEL kaynak basligi satirda saklanan
  // baslikla ayniysa kullanir -> talep satiri gercekten var olmali.
  await makeListing(prisma, {
    id: LISTING_ID,
    companyId: co.id,
    createdById: user.id,
    title: LISTING_TITLE,
  });
  return { co, user, auth };
}

/** `GET /notifications` — Accept-Language basligiyla (LocaleMiddleware aynasi). */
function getList(
  controller: NotificationController,
  auth: AuthenticatedCompanyUser,
  acceptLanguage: string | undefined,
  afterAuth?: () => void,
): Promise<NotificationRow[]> {
  return runWithLocale(acceptLanguage, async () => {
    afterAuth?.();
    return controller.list(auth);
  });
}

/** Uc bildirim: (1) tarih + tutar, (2) talep basligi, (3) i18n'siz eski satir. */
async function writeThree(
  service: NotificationService,
  user: { id: string; companyId: string },
) {
  // (1) 2026-11-04 21:30 UTC = Istanbul'da 5 Kasim 00:30 (gun kaymasi sinanir).
  await service.pushToUser(user.id, {
    type: "order_payment_due",
    portal: "satinalma",
    titleKey: "api.notifications.orders.paymentDue.heading",
    bodyKey: "api.notifications.orders.paymentDue.body",
    ctaLabelKey: "api.notifications.orders.ctaOrder",
    params: {
      hasNumber: "yes",
      number: "ORD-2026-0042",
      dueDate: dateParam(new Date("2026-11-04T21:30:00Z")),
      amount: moneyParam(12500.5, "TRY"),
    },
    ctaPath: appRoutes.order(BASE, ORDER_ID),
  });
  // (2) talep basligi okuyanin dilindeki icerik cevirisinden.
  await service.pushToUser(user.id, {
    type: "listing_closing_changed",
    portal: "satinalma",
    titleKey: "api.notifications.listings.closingChanged.title",
    bodyKey: "api.notifications.listings.closingChanged.body",
    ctaLabelKey: "api.notifications.listings.cta.viewRequest",
    params: {
      title: listingTitleParam(LISTING_ID, "Çelik boru alımı"),
      number: "ROT-000007",
      direction: "extended",
      closesAt: dateParam(new Date("2026-11-04T21:30:00Z"), "dateTime"),
    },
    ctaPath: appRoutes.listing(BASE, LISTING_ID),
    listingId: LISTING_ID,
  });
  // (3) ESKI satir: yalniz uretilmis (Ingilizce) metin + Ingilizce DIS adres.
  await prisma.notification.create({
    data: {
      companyUserId: user.id,
      companyId: user.companyId,
      type: "bid_received",
      portal: "satinalma",
      title: "New quote received",
      body: "A new quote was submitted for your request.",
      ctaLabel: "View request",
      ctaUrl: appRoutes.listing(BASE, "lst-legacy", "en"),
      listingId: "lst-legacy",
    },
  });
}

const byType = (rows: NotificationRow[], type: string) =>
  rows.find((r) => r.type === type)!;

describe("GET /notifications — metin OKUYANIN guncel dilinde", () => {
  it("kayitli dili en olan kullanici: tr / en / ru basligiyla her seferinde o dilde metin, tarih, tutar, baslik ve CTA", async () => {
    const { service, controller, titleCalls } = rig();
    const { user, auth } = await seed();
    await writeThree(service, user);

    // Yazilan kolonlar AYNEN (alicinin kayitli dili en) — yedek + eski istemci.
    const stored = await prisma.notification.findMany({
      where: { companyUserId: user.id },
    });
    const storedPay = stored.find((r) => r.type === "order_payment_due")!;
    expect(storedPay.title).toBe("Payment due soon");
    expect(storedPay.ctaUrl).toBe(appRoutes.order(BASE, ORDER_ID, "en"));
    expect(storedPay.i18n).not.toBeNull();
    expect(stored.find((r) => r.type === "bid_received")!.i18n).toBeNull();

    // ---------------- Turkce ----------------
    titleCalls.length = 0;
    const tr = await getList(controller, auth, "tr");
    expect(tr).toHaveLength(3);
    const trPay = byType(tr, "order_payment_due");
    expect(trPay.title).toBe("Ödeme vadesi yaklaşıyor");
    expect(plain(trPay.body)).toContain("ORD-2026-0042 numaralı");
    expect(plain(trPay.body)).toContain("5 Kasım 2026");
    expect(plain(trPay.body)).toContain("12.500,50 ₺");
    expect(trPay.ctaUrl).toBe(appRoutes.order(BASE, ORDER_ID, "tr"));
    expect(trPay.ctaUrl).toBe(`${BASE}/company/siparis/${ORDER_ID}`);
    const trList = byType(tr, "listing_closing_changed");
    expect(trList.title).toBe("Kapanış zamanı değişti");
    expect(trList.body).toContain("“Çelik boru alımı” (ROT-000007)");
    expect(plain(trList.body)).toContain("5 Kasım 2026 00:30");
    expect(trList.body).not.toContain("GMT");
    expect(trList.ctaLabel).toBe("Talebi gör");
    expect(trList.ctaUrl).toBe(`${BASE}/company/ilan/${LISTING_ID}`);
    // Eski satir: metin saklandigi gibi (yeniden uretilemez), adres Turkce bicime.
    const trLegacy = byType(tr, "bid_received");
    expect(trLegacy.title).toBe("New quote received");
    expect(trLegacy.ctaLabel).toBe("View request");
    expect(trLegacy.ctaUrl).toBe(`${BASE}/company/ilan/lst-legacy`);
    // Talep basligi sayfa basina TEK toplu sorgu (N+1 yok).
    expect(titleCalls).toEqual([{ ids: [LISTING_ID], locale: "tr" }]);

    // ---------------- Ingilizce ----------------
    const en = await getList(controller, auth, "en-US,en;q=0.9");
    const enPay = byType(en, "order_payment_due");
    expect(enPay.title).toBe("Payment due soon");
    expect(plain(enPay.body)).toContain("order ORD-2026-0042");
    expect(plain(enPay.body)).toContain("November 5, 2026");
    expect(plain(enPay.body)).toContain("₺12,500.50");
    expect(enPay.ctaLabel).toBe("View order");
    expect(enPay.ctaUrl).toBe(appRoutes.order(BASE, ORDER_ID, "en"));
    expect(enPay.ctaUrl!.startsWith(`${BASE}/en/`)).toBe(true);
    const enList = byType(en, "listing_closing_changed");
    expect(enList.body).toContain("“Steel pipe purchase” (ROT-000007)");
    expect(plain(enList.body)).toContain("November 5, 2026");
    expect(enList.body).toContain("(GMT+3)");
    expect(enList.ctaUrl).toBe(appRoutes.listing(BASE, LISTING_ID, "en"));
    expect(byType(en, "bid_received").ctaUrl).toBe(
      appRoutes.listing(BASE, "lst-legacy", "en"),
    );

    // ---------------- Rusca ----------------
    const ru = await getList(controller, auth, "ru");
    const ruPay = byType(ru, "order_payment_due");
    expect(ruPay.title).toBe("Приближается срок оплаты");
    expect(plain(ruPay.body)).toContain("5 ноября 2026");
    expect(plain(ruPay.body)).toContain("12 500,50 ₺");
    expect(ruPay.ctaUrl).toBe(appRoutes.order(BASE, ORDER_ID, "ru"));
    expect(ruPay.ctaUrl!.startsWith(`${BASE}/ru/`)).toBe(true);
    const ruList = byType(ru, "listing_closing_changed");
    expect(ruList.title).toBe("Время закрытия изменено");
    expect(ruList.body).toContain("«Закупка стальных труб» (ROT-000007)");
    expect(ruList.ctaLabel).toBe("Открыть заявку");
    expect(ruList.ctaUrl).toBe(appRoutes.listing(BASE, LISTING_ID, "ru"));
    const ruLegacy = byType(ru, "bid_received");
    expect(ruLegacy.title).toBe("New quote received");
    expect(ruLegacy.ctaUrl).toBe(appRoutes.listing(BASE, "lst-legacy", "ru"));

    // Ayni satirlar, uc dilde uc ayri metin; `i18n` kolonu yanita YAZILMAZ.
    expect(new Set([trPay.body, enPay.body, ruPay.body]).size).toBe(3);
    for (const row of [...tr, ...en, ...ru]) {
      expect(row).not.toHaveProperty("i18n");
      expect(Object.keys(row).sort()).toEqual(
        [
          "body",
          "companyId",
          "companyUserId",
          "createdAt",
          "ctaLabel",
          "ctaUrl",
          "id",
          "listingId",
          "portal",
          "readAt",
          "title",
          "type",
        ].sort(),
      );
    }
    // Dil degistirip geri donmek satiri BOZMAZ (okuma DB'ye yazmaz).
    const after = await prisma.notification.findMany({
      where: { companyUserId: user.id },
    });
    expect(after.find((r) => r.type === "order_payment_due")!.title).toBe(
      "Payment due soon",
    );
  });

  it("baslik yoksa / desteklenmeyen dildeyse kullanicinin KAYITLI diline, o da yoksa varsayilana duser", async () => {
    const { service, controller } = rig();
    const { user, auth } = await seed();
    await writeThree(service, user);

    // Baslik yok: JWT stratejisi kayitli dili uygular (`applyUserLocale`).
    const viaStored = await getList(controller, auth, undefined, () =>
      applyUserLocale("ru"),
    );
    expect(byType(viaStored, "order_payment_due").title).toBe(
      "Приближается срок оплаты",
    );
    // Desteklenmeyen dil (de) de kayitli dile duser.
    const unsupported = await getList(controller, auth, "de-DE,de;q=0.9", () =>
      applyUserLocale("en"),
    );
    expect(byType(unsupported, "order_payment_due").title).toBe(
      "Payment due soon",
    );
    // Baslik desteklenen dil veriyorsa kayitli dil onu EZMEZ (guncel secim kazanir).
    const explicit = await getList(controller, auth, "tr", () =>
      applyUserLocale("en"),
    );
    expect(byType(explicit, "order_payment_due").title).toBe(
      "Ödeme vadesi yaklaşıyor",
    );
    // Baglam disi (cron/test) -> varsayilan Turkce.
    const bare = await service.listForUser(user.id);
    expect(byType(bare, "order_payment_due").title).toBe(
      "Ödeme vadesi yaklaşıyor",
    );
  });

  it("iki talep basligi basvurusu olan sayfa: basliklar TEK toplu sorguyla okunur", async () => {
    const { service, controller, titleCalls } = rig();
    const { user, auth } = await seed();
    await prisma.listing.update({
      where: { id: LISTING_ID },
      data: { title: `Kaynak ${LISTING_ID}` },
    });
    for (const id of [LISTING_ID, "lst-other", LISTING_ID]) {
      await service.pushToUser(user.id, {
        type: "listing_closing_changed",
        titleKey: "api.notifications.listings.closingChanged.title",
        bodyKey: "api.notifications.listings.closingChanged.body",
        params: {
          title: listingTitleParam(id, `Kaynak ${id}`),
          number: "ROT-000001",
          direction: "advanced",
          closesAt: dateParam(new Date("2026-11-04T09:00:00Z"), "dateTime"),
        },
        ctaPath: appRoutes.listing(BASE, id),
      });
    }
    titleCalls.length = 0;
    const ru = await getList(controller, auth, "ru");
    expect(ru).toHaveLength(3);
    expect(titleCalls).toHaveLength(1);
    expect(titleCalls[0]!.locale).toBe("ru");
    expect([...titleCalls[0]!.ids].sort()).toEqual(
      [LISTING_ID, "lst-other"].sort(),
    );
    // Cevirisi olan baslik cevrilmis, olmayan kaynak baslikla.
    expect(ru.filter((r) => r.body.includes("«Закупка стальных труб»"))).toHaveLength(2);
    expect(ru.filter((r) => r.body.includes("«Kaynak lst-other»"))).toHaveLength(1);
  });

  it("talep bildirimden SONRA yeniden adlandirilirsa / silinirse: guncel ceviri DEGIL, saklanan (bildirim anindaki) baslik — her dilde ayni surum", async () => {
    const { service, controller } = rig();
    const { user, auth } = await seed();
    const push = (title: string) =>
      service.pushToUser(user.id, {
        type: "listing_closing_changed",
        titleKey: "api.notifications.listings.closingChanged.title",
        bodyKey: "api.notifications.listings.closingChanged.body",
        params: {
          title: listingTitleParam(LISTING_ID, title),
          number: "ROT-000007",
          direction: "advanced",
          closesAt: dateParam(new Date("2026-11-04T09:00:00Z"), "dateTime"),
        },
        ctaPath: appRoutes.listing(BASE, LISTING_ID),
      });
    await push(LISTING_TITLE);
    // Baslik hala ayni: ceviri kullanilir.
    const before = await getList(controller, auth, "ru");
    expect(before[0]!.body).toContain("«Закупка стальных труб»");

    // Talep yeniden adlandirildi (rig'in ceviri kaynagi artik YENI basligin
    // cevirisini temsil eder) + yeni baslikla ikinci bildirim.
    await prisma.listing.update({
      where: { id: LISTING_ID },
      data: { title: "Gizli yeni baslik" },
    });
    await push("Gizli yeni baslik");
    for (const lang of ["ru", "en", "tr"]) {
      const list = await getList(controller, auth, lang);
      expect(list).toHaveLength(2);
      // Eski satir: bildirim anindaki baslik, hicbir dilde yeni ceviri yok.
      const old = list.filter((r) => r.body.includes(LISTING_TITLE));
      expect(old).toHaveLength(1);
      expect(old[0]!.body).not.toContain("Закупка стальных труб");
      expect(old[0]!.body).not.toContain("Steel pipe purchase");
      expect(old[0]!.body).not.toContain("Gizli yeni baslik");
    }
    // Yeni satir (saklanan baslik = guncel baslik) cevrilmis basligi alir.
    const ru = await getList(controller, auth, "ru");
    expect(ru.filter((r) => r.body.includes("«Закупка стальных труб»"))).toHaveLength(1);

    // Talep silindi: hicbir satir ceviri kullanmaz, liste yine doner.
    await prisma.listing.delete({ where: { id: LISTING_ID } });
    const gone = await getList(controller, auth, "ru");
    expect(gone).toHaveLength(2);
    expect(gone.some((r) => r.body.includes("Закупка стальных труб"))).toBe(false);
    expect(gone.some((r) => r.body.includes(`«${LISTING_TITLE}»`))).toBe(true);
  });

  it("katalogdan dusmus anahtar ve bozuk i18n: saklanan metne duser, firlatmaz, ham anahtar basmaz", async () => {
    const { controller } = rig();
    const { user, auth } = await seed();
    const base = {
      companyUserId: user.id,
      companyId: user.companyId,
      title: "Saklanan baslik",
      body: "Saklanan govde",
      ctaLabel: "Saklanan dugme",
      ctaUrl: `${BASE}/en/company/request/lst-x`,
    };
    // (a) baslik anahtari artik yok; govde anahtari gecerli; cta anahtari yok.
    await prisma.notification.create({
      data: {
        ...base,
        type: "gone_title",
        i18n: {
          v: 1,
          titleKey: "api.notifications.silinmis.anahtar",
          bodyKey: "api.notifications.listings.bidReceived.body",
          ctaLabelKey: "api.notifications.yok.cta",
          params: { title: "Vida", number: "ROT-000009" },
          ctaPath: appRoutes.listing(BASE, "lst-x"),
        },
      },
    });
    // (b) anahtar var ama ICU parametresi eksik -> saklanan govde.
    await prisma.notification.create({
      data: {
        ...base,
        type: "missing_param",
        i18n: {
          v: 1,
          bodyKey: "api.notifications.listings.bidReceived.body",
        },
      },
    });
    // (c) taninmayan bicim (surum yok / dizi / dize) -> eski satir gibi.
    await prisma.notification.create({
      data: { ...base, type: "bad_shape", i18n: ["x"] },
    });
    await prisma.notification.create({
      data: {
        ...base,
        type: "bad_params",
        i18n: {
          v: 1,
          titleKey: "api.notifications.listings.bidReceived.title",
          params: { dueDate: { $date: "tarih-degil" }, amount: { $money: {} } },
          ctaPath: 42,
        },
      },
    });

    const rows = await getList(controller, auth, "tr");
    expect(rows).toHaveLength(4);
    const gone = byType(rows, "gone_title");
    expect(gone.title).toBe("Saklanan baslik");
    expect(gone.body).toBe("“Vida” (ROT-000009) talebinize yeni bir teklif verildi.");
    expect(gone.ctaLabel).toBe("Saklanan dugme");
    expect(gone.ctaUrl).toBe(`${BASE}/company/ilan/lst-x`);
    const missing = byType(rows, "missing_param");
    expect(missing.body).toBe("Saklanan govde");
    expect(missing.title).toBe("Saklanan baslik");
    const bad = byType(rows, "bad_shape");
    expect(bad.title).toBe("Saklanan baslik");
    expect(bad.body).toBe("Saklanan govde");
    expect(bad.ctaUrl).toBe(`${BASE}/company/ilan/lst-x`);
    const badParams = byType(rows, "bad_params");
    expect(badParams.title).toBe("Yeni teklif geldi");
    expect(badParams.body).toBe("Saklanan govde");
    for (const r of rows) {
      for (const text of [r.title, r.body, r.ctaLabel ?? ""]) {
        expect(text).not.toMatch(/api\.notifications\./);
      }
    }
  });

  it("eski satirin adresi: rota tablosunun tanimadigi yol ve goreli/harici adres OLDUGU GIBI kalir", async () => {
    const { controller } = rig();
    const { user, auth } = await seed();
    const mk = (type: string, ctaUrl: string | null) =>
      prisma.notification.create({
        data: {
          companyUserId: user.id,
          companyId: user.companyId,
          type,
          title: "t",
          body: "b",
          ctaUrl,
        },
      });
    await mk("unknown", `${BASE}/en/boyle-bir-rota-yok/abc?x=1`);
    await mk("mailto", "mailto:destek@rothern.com");
    await mk("none", null);
    await mk("query", `${appRoutes.listing(BASE, "lst-q", "en")}?ai-davet=1`);
    await mk("turkish", `${BASE}/company/onaylar`);

    const ru = await getList(controller, auth, "ru");
    expect(byType(ru, "unknown").ctaUrl).toBe(
      `${BASE}/en/boyle-bir-rota-yok/abc?x=1`,
    );
    expect(byType(ru, "mailto").ctaUrl).toBe("mailto:destek@rothern.com");
    expect(byType(ru, "none").ctaUrl).toBeNull();
    // Sorgu dizesi korunur; Turkce (on eksiz) saklanan adres de cevrilir.
    expect(byType(ru, "query").ctaUrl).toBe(
      `${appRoutes.listing(BASE, "lst-q", "ru")}?ai-davet=1`,
    );
    expect(byType(ru, "turkish").ctaUrl).toBe(appRoutes.approvals(BASE, "ru"));
    const tr = await getList(controller, auth, "tr");
    expect(byType(tr, "query").ctaUrl).toBe(
      `${BASE}/company/ilan/lst-q?ai-davet=1`,
    );
  });
});

describe("yazma yolu — uretim girdileri satirda", () => {
  it("pushToCompanies: her alici satiri AYNI i18n girdilerini tasir; metin kolonlari alicinin dilinde", async () => {
    const { service } = rig();
    const co = await makeCompany(prisma, {});
    const trUser = await makeUser(prisma, co.id, [CompanyRole.SATISCI]);
    const ruUser = await makeUser(prisma, co.id, [CompanyRole.SATISCI], {
      locale: "ru",
    });
    const payload = {
      type: "order_payment_due",
      titleKey: "api.notifications.orders.paymentDue.heading" as const,
      bodyKey: "api.notifications.orders.paymentDue.body" as const,
      ctaLabelKey: "api.notifications.orders.ctaOrder" as const,
      params: {
        hasNumber: "no",
        number: "",
        dueDate: dateParam(new Date("2026-12-31T22:00:00Z")),
        amount: moneyParam("999.9", "USD"),
        adet: numberParam(1234.5),
        title: listingTitleParam(LISTING_ID, "Çelik boru alımı"),
      },
      ctaPath: appRoutes.order(BASE, ORDER_ID),
    };
    expect(await service.pushToCompany(co.id, payload)).toBe(2);
    const rows = await prisma.notification.findMany({
      where: { companyId: co.id },
    });
    const rowOf = (id: string) => rows.find((r) => r.companyUserId === id)!;
    expect(rowOf(trUser.id).title).toBe("Ödeme vadesi yaklaşıyor");
    expect(rowOf(ruUser.id).title).toBe("Приближается срок оплаты");
    expect(rowOf(ruUser.id).ctaUrl).toBe(appRoutes.order(BASE, ORDER_ID, "ru"));
    // JSON gidis-donus: Date -> ISO, tutar / sayi / talep basligi aynen.
    const expected = {
      v: 1,
      titleKey: payload.titleKey,
      bodyKey: payload.bodyKey,
      ctaLabelKey: payload.ctaLabelKey,
      params: {
        hasNumber: "no",
        number: "",
        dueDate: { $date: "2026-12-31T22:00:00.000Z", style: "date" },
        amount: { $money: "999.9", currency: "USD" },
        adet: { $number: 1234.5 },
        title: { $listingTitle: LISTING_ID, fallback: "Çelik boru alımı" },
      },
      ctaPath: `${BASE}/company/siparis/${ORDER_ID}`,
    };
    expect(rowOf(trUser.id).i18n).toEqual(expected);
    expect(rowOf(ruUser.id).i18n).toEqual(expected);
    expect(toStoredI18n(payload)).toEqual(expected);
    // DB'den okunan parametreler ayni fonksiyondan degismeden gecer (kararli).
    expect(
      serializeNotificationParams(
        (rowOf(trUser.id).i18n as { params: unknown }).params,
      ),
    ).toEqual(expected.params);

    // Rusca alici dilini Ingilizceye cevirince: yeni yilin ilk gunu (Istanbul), USD onde.
    const en = await service.listForUser(ruUser.id, {}, undefined, "en");
    expect(plain(en[0]!.body)).toContain("January 1, 2027");
    expect(plain(en[0]!.body)).toContain("$999.90");
    const ru = await service.listForUser(ruUser.id, {}, undefined, "ru");
    expect(plain(ru[0]!.body)).toContain("1 января 2027");
    expect(plain(ru[0]!.body)).toContain("999,90 $");
  });

  it("duz metinli (anahtarsiz) cagri: i18n NULL; yalniz CTA anahtari/yolu verilirse metin saklanandan, dugme + adres okuyanin dilinde", async () => {
    const { service } = rig();
    const { user } = await seed();
    await service.pushToUser(user.id, {
      type: "plain",
      title: "Serbest baslik",
      body: "Serbest govde",
    });
    // Admin duyurusu kalibi: metin admin'in yazdigi serbest metin, dugme katalogdan.
    await service.pushToUser(user.id, {
      type: "admin_announcement",
      title: "Bakım duyurusu",
      body: "Cumartesi 02:00 bakım yapılacak.",
      ctaLabelKey: "api.notifications.listings.cta.viewRequest",
      ctaPath: `${BASE}/company`,
    });
    const stored = await prisma.notification.findMany({
      where: { companyUserId: user.id },
    });
    expect(stored.find((r) => r.type === "plain")!.i18n).toBeNull();
    expect(stored.find((r) => r.type === "admin_announcement")!.i18n).toEqual({
      v: 1,
      ctaLabelKey: "api.notifications.listings.cta.viewRequest",
      ctaPath: `${BASE}/company`,
    });
    const ru = await service.listForUser(user.id, {}, undefined, "ru");
    const ann = byType(ru, "admin_announcement");
    expect(ann.title).toBe("Bakım duyurusu");
    expect(ann.body).toBe("Cumartesi 02:00 bakım yapılacak.");
    expect(ann.ctaLabel).toBe("Открыть заявку");
    expect(ann.ctaUrl).toBe(appRoutes.home(BASE, "ru"));
    expect(byType(ru, "plain").title).toBe("Serbest baslik");
  });
});

describe("okunmamis sayaci ve okundu isaretleme dilden bagimsiz", () => {
  it("dil degistirerek listelemek sayaci degistirmez; okundu isaretleme her dilde ayni satirlari etkiler", async () => {
    const { service, controller } = rig();
    const { user, auth } = await seed();
    await writeThree(service, user);

    const count = (lang: string) =>
      runWithLocale(lang, () => controller.unreadCount(auth));
    expect(await count("tr")).toEqual({ count: 3 });
    const en = await getList(controller, auth, "en");
    const ru = await getList(controller, auth, "ru");
    expect(ru.map((r) => r.id)).toEqual(en.map((r) => r.id));
    expect(await count("ru")).toEqual({ count: 3 });

    const target = byType(ru, "order_payment_due");
    expect(
      await runWithLocale("ru", () => controller.read(auth, { ids: [target.id] })),
    ).toEqual({ updated: 1 });
    expect(await count("en")).toEqual({ count: 2 });
    const tr = await getList(controller, auth, "tr");
    expect(byType(tr, "order_payment_due").readAt).toBeInstanceOf(Date);
    expect(byType(tr, "order_payment_due").title).toBe("Ödeme vadesi yaklaşıyor");
    // Yalniz okunmamislar suzgeci de okuyanin dilinde doner.
    const unread = await runWithLocale("ru", () =>
      controller.list(auth, "1"),
    );
    expect(unread.map((r) => r.type).sort()).toEqual(
      ["bid_received", "listing_closing_changed"].sort(),
    );
    expect(byType(unread, "listing_closing_changed").title).toBe(
      "Время закрытия изменено",
    );
    expect(
      await runWithLocale("tr", () => controller.readAll(auth)),
    ).toEqual({ updated: 2 });
    expect(await count("ru")).toEqual({ count: 0 });
  });

  it("portal suzgeci ve `before` imleci yeniden uretimle birlikte calisir", async () => {
    const { service, controller } = rig();
    const { user, auth } = await seed();
    await writeThree(service, user);
    await service.pushToUser(user.id, {
      type: "seat_selection",
      titleKey: "api.notifications.companyUsers.seatSelection.title",
      bodyKey: "api.notifications.companyUsers.seatSelection.body",
    });
    const all = await getList(controller, auth, "en");
    expect(all).toHaveLength(4);
    const cursor = `${all[1]!.createdAt.toISOString()}_${all[1]!.id}`;
    const older = await runWithLocale("en", () =>
      controller.list(auth, undefined, undefined, "10", cursor),
    );
    expect(older.map((r) => r.id)).toEqual(all.slice(2).map((r) => r.id));
    expect(byType(all, "seat_selection").title).toBe(
      "Your action permissions have been removed",
    );
    expect(byType(all, "seat_selection").ctaUrl).toBeNull();
  });
});

describe("gercek zamanli sinyal metin TASIMAZ", () => {
  it("bildirim yazilinca yalniz firma kimligiyle ping atilir; WS olayi bos yuk tasir (istemci listeyi kendi diliyle yeniden ceker)", async () => {
    const { service, pings } = rig();
    const { co, user } = await seed();
    await writeThree(service, user);
    expect(pings).toEqual([[co.id], [co.id]]);

    const emitted: { rooms: string[]; event: string; payload: unknown }[] = [];
    const rt = new RealtimeService();
    rt.attach({
      to: (rooms: string[]) => ({
        emit: (event: string, payload: unknown) => {
          emitted.push({ rooms, event, payload });
        },
      }),
    } as never);
    rt.pingNotification(co.id);
    expect(emitted).toEqual([
      { rooms: [`company:${co.id}`], event: "notification.new", payload: {} },
    ]);
  });
});
