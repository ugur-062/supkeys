import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { appRoutes, localizeAppPath } from "../../src/common/company/app-routes";

/**
 * i18n Faz 3 — e-posta/bildirim derin bağlantıları ALICININ dilinde.
 * Sözleşme: `locale` verilmeyince bugünkü Türkçe adresler BİREBİR korunur;
 * `en`/`ru` yol parçalarını çevirir ve `/<dil>` ön eki alır; sorgu korunur.
 */
const BASE = "https://www.rothern.com";

describe("appRoutes — dil farkında derin bağlantılar", () => {
  it("varsayılan (locale verilmezse) bugünkü Türkçe yolları aynen üretir", () => {
    expect(appRoutes.home(BASE)).toBe(`${BASE}/company`);
    expect(appRoutes.listing(BASE, "abc123")).toBe(`${BASE}/company/ilan/abc123`);
    expect(appRoutes.order(BASE, "ord1")).toBe(`${BASE}/company/siparis/ord1`);
    expect(appRoutes.approvals(BASE)).toBe(`${BASE}/company/onaylar`);
    expect(appRoutes.messagesWith(BASE, "cmp1")).toBe(
      `${BASE}/company/mesajlar?with=cmp1`,
    );
    expect(appRoutes.inquiriesReceived(BASE)).toBe(
      `${BASE}/company/satis/bilgi-talepleri`,
    );
    expect(appRoutes.inquiriesSent(BASE)).toBe(
      `${BASE}/company/satinalma/bilgi-taleplerim`,
    );
  });

  it('açıkça "tr" verildiğinde de aynı yollar (ön ek YOK)', () => {
    expect(appRoutes.listing(BASE, "abc123", "tr")).toBe(
      `${BASE}/company/ilan/abc123`,
    );
    expect(appRoutes.inquiriesSent(BASE, "tr")).toBe(
      `${BASE}/company/satinalma/bilgi-taleplerim`,
    );
  });

  it("İngilizce: /en ön eki + çevrilmiş yol parçaları", () => {
    expect(appRoutes.home(BASE, "en")).toBe(`${BASE}/en/company`);
    expect(appRoutes.listing(BASE, "abc123", "en")).toBe(
      `${BASE}/en/company/request/abc123`,
    );
    expect(appRoutes.order(BASE, "ord1", "en")).toBe(
      `${BASE}/en/company/order/ord1`,
    );
    expect(appRoutes.approvals(BASE, "en")).toBe(`${BASE}/en/company/approvals`);
    expect(appRoutes.inquiriesReceived(BASE, "en")).toBe(
      `${BASE}/en/company/sales/inquiries`,
    );
    expect(appRoutes.inquiriesSent(BASE, "en")).toBe(
      `${BASE}/en/company/purchasing/my-inquiries`,
    );
  });

  it("Rusça: /ru ön eki + panel kökü de çevrilir", () => {
    expect(appRoutes.home(BASE, "ru")).toBe(`${BASE}/ru/kompaniya`);
    expect(appRoutes.listing(BASE, "abc123", "ru")).toBe(
      `${BASE}/ru/kompaniya/zayavka/abc123`,
    );
    expect(appRoutes.order(BASE, "ord1", "ru")).toBe(
      `${BASE}/ru/kompaniya/zakaz/ord1`,
    );
    expect(appRoutes.approvals(BASE, "ru")).toBe(
      `${BASE}/ru/kompaniya/soglasovaniya`,
    );
    expect(appRoutes.inquiriesReceived(BASE, "ru")).toBe(
      `${BASE}/ru/kompaniya/prodazhi/zaprosy`,
    );
    expect(appRoutes.inquiriesSent(BASE, "ru")).toBe(
      `${BASE}/ru/kompaniya/zakupki/moi-zaprosy`,
    );
  });

  it("sorgu dizesi her dilde korunur", () => {
    expect(appRoutes.messagesWith(BASE, "cmp1", "en")).toBe(
      `${BASE}/en/company/messages?with=cmp1`,
    );
    expect(appRoutes.messagesWith(BASE, "cmp1", "ru")).toBe(
      `${BASE}/ru/kompaniya/soobshcheniya?with=cmp1`,
    );
  });

  it("paket sayfası kalktı (ücretsiz dönem): hiçbir kaynak dosya paket sayfasına bağlanmaz; kilit CTA'larının hedefi doğrulama sayfası her dilde çevrilir", () => {
    // `/company/premium` web'den ve yol sözlüğünden (ROUTE_PATHNAMES) kalktı; web
    // eski adresi doğrulama sayfasına 308'ler. Yardımcı uykuda durur (çevrilmiş
    // karşılığı yok) ve HİÇBİR çağıranı olmamalı — e-posta/bildirim oraya bağlanamaz.
    expect(appRoutes.premium(BASE)).toBe(`${BASE}/company/premium`);
    expect(appRoutes.premium(BASE, "en")).not.toContain("/plans");
    expect(appRoutes.premium(BASE, "ru")).not.toContain("/tarify");
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith(".ts") && !full.endsWith(join("company", "app-routes.ts"))) {
          const src = readFileSync(full, "utf8");
          if (/appRoutes\s*\.\s*premium\b|["'`]\/company\/premium/.test(src)) callers.push(full);
        }
      }
    };
    walk(join(__dirname, "../../src"));
    expect(callers).toEqual([]);

    const verify = `${BASE}/company/ayarlar/dogrulama`;
    expect(localizeAppPath(verify, "tr")).toBe(verify);
    expect(localizeAppPath(verify, "en")).toBe(`${BASE}/en/company/settings/verification`);
    expect(localizeAppPath(verify, "ru")).toBe(`${BASE}/ru/kompaniya/nastroyki/verifikatsiya`);
  });
});
