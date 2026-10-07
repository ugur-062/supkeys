import {
  dateParam,
  formatAmount,
  formatNotificationParams,
  listingTitleParam,
  ListingTitleResolver,
  listingTitleRefs,
  moneyParam,
  numberParam,
  type ListingTitleSource,
} from "../../src/common/notifications/notification-params";
import { renderPayload } from "../../src/modules/notifications/notification.service";

/**
 * TİPLİ BİLDİRİM PARAMETRELERİ (2026-09-27) — aynı bildirim tr/en/ru alıcıya
 * FARKLI biçimde gider: tarih İstanbul duvar saatiyle (UTC sunucuda gün/saat
 * kaymaz), Türkçe dışı dilde saat metnine " (GMT+3)", sayı alıcının biçiminde,
 * talep başlığı alıcının dilindeki çeviriden (yoksa kaynak başlık).
 */

// 21:30 UTC = İstanbul'da ERTESİ GÜN 00:30 — UTC günü basılsaydı 27 Eylül çıkardı.
const LATE_UTC = new Date("2026-09-27T21:30:00Z");
const NBSP = " ";

describe("formatNotificationParams — alıcının dilinde", () => {
  it("tarih (date) İstanbul takvim günüyle ve alıcının dilinde", () => {
    const p = { d: dateParam(LATE_UTC, "date") };
    expect(formatNotificationParams(p, "tr")!.d).toBe("28 Eylül 2026");
    expect(formatNotificationParams(p, "en")!.d).toBe("September 28, 2026");
    expect(formatNotificationParams(p, "ru")!.d).toBe("28 сентября 2026 г.");
  });

  it("tarih-saat İstanbul saatiyle; Türkçe dışında (GMT+3) eklenir", () => {
    const p = { d: dateParam(LATE_UTC, "dateTime") };
    expect(formatNotificationParams(p, "tr")!.d).toBe("28 Eylül 2026 00:30");
    // 24 saat (2026-10-07): "12:30 AM" değil — karttaki zaman damgası ve e-postalarla aynı.
    expect(formatNotificationParams(p, "en")!.d).toMatch(/^September 28, 2026.*00:30 \(GMT\+3\)$/);
    const afternoon = { d: dateParam(new Date("2026-10-15T11:30:00.000Z"), "dateTime") };
    expect(formatNotificationParams(afternoon, "en")!.d).toMatch(/^October 15, 2026.*14:30 \(GMT\+3\)$/);
    expect(formatNotificationParams(afternoon, "en")!.d).not.toMatch(/AM|PM/);
    expect(formatNotificationParams(p, "ru")!.d).toMatch(/^28 сентября 2026 г\..*00:30 \(GMT\+3\)$/);
  });

  it("ISO dize de tarih olarak okunur; bozuk değer boş dize", () => {
    expect(formatNotificationParams({ d: { $date: LATE_UTC.toISOString() } }, "tr")!.d).toBe("28 Eylül 2026");
    expect(formatNotificationParams({ d: { $date: "bozuk" } }, "tr")!.d).toBe("");
  });

  it("tutar alıcının sayı biçiminde; sembol tek kaynaktan, YERİ dilden", () => {
    const p = { a: moneyParam(1234.5, "TRY"), b: moneyParam("99.999", "USD"), c: moneyParam(10, "CHF") };
    // Kuruş her zaman iki hane (arayüz testi D-006).
    expect(formatNotificationParams(p, "tr")).toEqual({ a: "1.234,50 ₺", b: "100,00 $", c: "10,00 CHF" });
    // İngilizcede sembol önde; harfli kodda boşluklu.
    expect(formatNotificationParams(p, "en")).toEqual({ a: "₺1,234.50", b: "$100.00", c: "CHF 10.00" });
    expect(formatNotificationParams(p, "ru")!.a).toBe(`1${NBSP}234,50 ₺`);
  });

  it("sayı alıcının biçiminde (en fazla 2 ondalık)", () => {
    const p = { n: numberParam(12345.678) };
    expect(formatNotificationParams(p, "tr")!.n).toBe("12.345,68");
    expect(formatNotificationParams(p, "en")!.n).toBe("12,345.68");
    expect(formatAmount(12345.678, "ru")).toBe(`12${NBSP}345,68`);
  });

  it("talep başlığı: çeviri varsa o, yoksa kaynak başlık", () => {
    const p = { title: listingTitleParam("l1", "Çelik boru alımı") };
    expect(formatNotificationParams(p, "en")!.title).toBe("Çelik boru alımı");
    expect(formatNotificationParams(p, "en", new Map([["l1", "Steel pipe purchase"]]))!.title).toBe(
      "Steel pipe purchase",
    );
  });

  it("düz dize/sayı AYNEN geçer; params yoksa undefined", () => {
    expect(formatNotificationParams({ number: "ROT-1", count: 3 }, "ru")).toEqual({ number: "ROT-1", count: 3 });
    expect(formatNotificationParams(undefined, "tr")).toBeUndefined();
  });

  it("listingTitleRefs yalnız başlık başvurularını toplar (tekil)", () => {
    expect(
      listingTitleRefs({
        a: listingTitleParam("l1", "x"),
        b: listingTitleParam("l1", "x"),
        c: listingTitleParam("l2", "y"),
        d: "düz",
        e: dateParam(LATE_UTC),
      }),
    ).toEqual(["l1", "l2"]);
    expect(listingTitleRefs(undefined)).toEqual([]);
  });
});

describe("renderPayload — tipli parametreler alıcı başına", () => {
  it("aynı bildirim üç dilde farklı tarih biçimiyle yazılır", () => {
    const payload = {
      type: "listing_closing_changed",
      bodyKey: "api.notifications.listings.closingChanged.body" as const,
      params: {
        title: listingTitleParam("l1", "Çelik boru"),
        number: "ROT-000001",
        direction: "extended",
        closesAt: dateParam(LATE_UTC, "dateTime"),
      },
    };
    const tr = renderPayload(payload, "tr").body;
    const en = renderPayload(payload, "en", new Map([["l1", "Steel pipe"]])).body;
    const ru = renderPayload(payload, "ru").body;
    expect(tr).toContain("28 Eylül 2026 00:30");
    expect(tr).not.toContain("GMT");
    expect(en).toContain("September 28, 2026");
    expect(en).toContain("(GMT+3)");
    expect(en).toContain("Steel pipe");
    expect(en).not.toContain("Eylül");
    expect(ru).toContain("28 сентября 2026");
    expect(ru).toContain("Çelik boru"); // çeviri yok → kaynak başlık
  });
});

describe("ListingTitleResolver", () => {
  const source = (titles: Record<string, string>) => {
    const calls: { ids: (string | null | undefined)[]; locale: string }[] = [];
    const src: ListingTitleSource = {
      async localizeListings(items, ids, locale) {
        calls.push({ ids, locale });
        return items.map((item, i) => {
          const t = titles[`${locale}:${ids[i]}`];
          return t ? { ...item, title: t } : item;
        });
      },
    };
    return { src, calls };
  };

  it("alıcının dilindeki çeviriyi döner; çevirisi olmayan kimlik haritada YOK", async () => {
    const { src } = source({ "en:l1": "Steel pipe" });
    const r = new ListingTitleResolver(() => src);
    const m = await r.resolve(["l1", "l2"], "en");
    expect(m.get("l1")).toBe("Steel pipe");
    expect(m.has("l2")).toBe(false);
  });

  it("dil × talep önbelleklidir — aynı duyurunun 2. alıcısı sorgu atmaz", async () => {
    const { src, calls } = source({ "en:l1": "Steel pipe", "ru:l1": "Стальная труба" });
    const r = new ListingTitleResolver(() => src);
    await r.resolve(["l1"], "en");
    await r.resolve(["l1"], "en");
    expect(calls).toHaveLength(1);
    expect((await r.resolve(["l1"], "ru")).get("l1")).toBe("Стальная труба");
    expect(calls).toHaveLength(2);
  });

  it("kaynak yoksa ya da başvuru yoksa sorgu atmaz; kaynak hatası fail-open", async () => {
    expect(await new ListingTitleResolver(() => undefined).resolve(["l1"], "en")).toEqual(new Map());
    const { src, calls } = source({});
    expect(await new ListingTitleResolver(() => src).forParams({ a: "x" }, "en")).toBeUndefined();
    expect(calls).toHaveLength(0);
    const broken: ListingTitleSource = {
      localizeListings: () => Promise.reject(new Error("db")),
    };
    expect(await new ListingTitleResolver(() => broken).resolve(["l1"], "en")).toEqual(new Map());
  });
});
