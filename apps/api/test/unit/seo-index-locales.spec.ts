import { localizedIndexNowUrls } from "../../src/modules/seo-index/seo-index.service";

describe("IndexNow — üç dilde adres (i18n SEO)", () => {
  it("Türkçe iç yolun EN/RU dış adresleri de listelenir, tekrar yok", () => {
    const urls = localizedIndexNowUrls("https://www.rothern.com", [
      "/firma/acme/urun/celik-boru",
      "/talep/rot-000042-celik-boru",
      "/firma/acme/urun/celik-boru",
    ]);
    expect(urls).toEqual([
      "https://www.rothern.com/firma/acme/urun/celik-boru",
      "https://www.rothern.com/en/companies/acme/products/celik-boru",
      "https://www.rothern.com/ru/kompanii/acme/tovary/celik-boru",
      "https://www.rothern.com/talep/rot-000042-celik-boru",
      "https://www.rothern.com/en/buying-requests/rot-000042-celik-boru",
      "https://www.rothern.com/ru/zayavki/rot-000042-celik-boru",
    ]);
  });

  it("ülke sayfası adresi dilin adıyla (2026-09-27): de-almanya · de-germany · de-germaniya", () => {
    expect(localizedIndexNowUrls("https://www.rothern.com", ["/urunler/ulke/de-almanya"])).toEqual([
      "https://www.rothern.com/urunler/ulke/de-almanya",
      "https://www.rothern.com/en/products/country/de-germany",
      "https://www.rothern.com/ru/tovary/strana/de-germaniya",
    ]);
  });
});
