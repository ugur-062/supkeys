import { describe, expect, it } from "vitest";
import type { AiSearchIntentResult } from "@rothern/shared";
import { messagesFor, WEB_NAMESPACES } from "@rothern/i18n/messages";
import { createTranslator } from "use-intl/core";
import { intentChips, intentToProductQuery, intentToRequestQuery, type IntentChipFormat, type IntentChipT } from "../ai-search";

// `intentChips` React DIŞI: çevirmeni ÇAĞIRAN verir. Testte TR katalogdan
// kurulur — beklenen Türkçe metin tek kaynaktan gelir.
const t = createTranslator({
  locale: "tr",
  messages: messagesFor("tr", WEB_NAMESPACES),
  namespace: "web.panel.shell.aiIntentBand" as never,
  timeZone: "Europe/Istanbul",
}) as unknown as IntentChipT;

// Biçimleyiciler bileşende `@/i18n/domain` hook'larından gelir; burada sahte.
const fmt = (locale = "tr"): IntentChipFormat => ({
  t,
  locale,
  activityLabel: (c) => `act:${c}`,
  quantity: (n, u) => `${n} ${u === "adet" ? (locale === "en" ? (n === 1 ? "piece" : "pieces") : "adet") : u}`,
  cityLabel: (c) => `city:${c}`,
  countryLabel: (cc) => `country:${cc}`,
});

const base: AiSearchIntentResult = {
  portal: "satinalma",
  summary: "50 adet kompanzasyon panosu, İstanbul",
  query: "kompanzasyon panosu",
  category: { id: "39121500", name: "Kompanzasyon panoları" },
  categoryHint: "kompanzasyon panosu",
  city: "istanbul",
  cityName: "İstanbul",
  country: null,
  verifiedOnly: true,
  activity: "MANUFACTURER",
  priceMax: 1500.5,
  currency: "TRY",
  quantity: 50,
  unit: "adet",
  keywords: ["kompanzasyon"],
  relaxed: [],
  relaxedCategoryName: null,
  draft: null,
  downgraded: false,
  warned: false,
};

describe("ai-search — yorum → URL süzgeci", () => {
  it("satınalma: ürün dizini şemasına yazar (adet → MOQ tavanı, fiyat tavanı)", () => {
    expect(intentToProductQuery(base)).toBe(
      "?q=kompanzasyon+panosu&kategori=39121500&sehir=istanbul&faaliyet=MANUFACTURER&dogrulanmis=1&para=TRY&fiyatMax=1500.5&moqMax=50",
    );
    // Fiyat tavanı yoksa para birimi yazılmaz (görünüm tercihi — tavansız anlamsız).
    expect(intentToProductQuery({ ...base, priceMax: null })).not.toContain("para=");
    // Ülke (şehirsiz ya da şehirle birlikte) satıcı ülkesi süzgecine yazılır.
    expect(intentToProductQuery({ ...base, query: null, category: null, city: null, cityName: null, country: "DE", activity: null, verifiedOnly: false, priceMax: null, quantity: null })).toBe("?ulke=DE");
    expect(intentToProductQuery({ ...base, query: null, category: null, city: null, activity: null, verifiedOnly: false, priceMax: null, quantity: null })).toBe("");
  });

  it("satış: kategori SEGMENT'e iner, şehir alıcı şehri; alıcıya özgü alanlar yazılmaz", () => {
    expect(intentToRequestQuery({ ...base, portal: "satis" })).toBe("?q=kompanzasyon+panosu&kategori=39000000&sehir=istanbul");
    // Ülke = alıcı ülkesi süzgeci.
    expect(intentToRequestQuery({ ...base, portal: "satis", city: "de-munich", country: "DE" })).toBe(
      "?q=kompanzasyon+panosu&kategori=39000000&sehir=de-munich&ulke=DE",
    );
  });

  it("çipler URL'de duran parçalardan; kaldırılan çip düşer", () => {
    const sp = new URLSearchParams(intentToProductQuery(base));
    expect(intentChips(base, sp, fmt()).map((c) => c.param)).toEqual(["q", "kategori", "sehir", "dogrulanmis", "faaliyet", "fiyatMax", "moqMax"]);
    expect(intentChips(base, sp, fmt()).find((c) => c.param === "moqMax")?.label).toBe("Min. sipariş ≤ 50 adet");
    expect(intentChips(base, sp, fmt()).find((c) => c.param === "fiyatMax")?.label).toBe("Birim fiyat ≤ 1.500,5 ₺");
    sp.delete("sehir");
    sp.delete("q");
    expect(intentChips(base, sp, fmt()).map((c) => c.param)).toEqual(["kategori", "dogrulanmis", "faaliyet", "fiyatMax", "moqMax"]);
    // Satışta alıcıya özgü çipler hiç çıkmaz.
    expect(intentChips({ ...base, portal: "satis" }, new URLSearchParams("q=x&kategori=39000000&dogrulanmis=1"), fmt()).map((c) => c.param)).toEqual(["q", "kategori"]);
    // Ülke çipi iki portalda da (satışta alıcı ülkesi).
    expect(intentChips({ ...base, portal: "satis", country: "DE" }, new URLSearchParams("q=x&ulke=DE"), fmt()).map((c) => c.param)).toEqual(["q", "ulke"]);
  });

  it("çip etiketleri okuyucunun dilinde: şehir adı sunucudan, faaliyet/birim/ülke biçimleyiciden, sayı arayüz dilinde", () => {
    const r = { ...base, country: "TR" };
    const sp = new URLSearchParams(intentToProductQuery(r));
    const chips = intentChips(r, sp, fmt("en"));
    const label = (p: string) => chips.find((c) => c.param === p)?.label;
    expect(label("sehir")).toBe("Şehir: İstanbul");
    expect(label("ulke")).toBe("Ülke: country:TR");
    expect(label("faaliyet")).toBe("act:MANUFACTURER");
    // Sayı biçimi arayüz dilinden (eskiden "tr-TR" sabitti).
    // İngilizcede sembol önde; miktar çoğul kuralıyla.
    expect(label("fiyatMax")).toBe("Birim fiyat ≤ ₺1,500.5");
    expect(label("moqMax")).toBe("Min. sipariş ≤ 50 pieces");
    // Sunucu şehir adı vermediyse (eski oturum) yerel biçimleyici.
    expect(intentChips({ ...base, cityName: null }, sp, fmt()).find((c) => c.param === "sehir")?.label).toBe("Şehir: city:istanbul");
  });
});
