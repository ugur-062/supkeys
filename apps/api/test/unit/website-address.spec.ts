import { BadRequestException } from "@nestjs/common";
import {
  assertWebsiteAddress,
  isValidWebsiteAddress,
} from "../../src/common/company/website-address";

/**
 * Company web site rule (arayuz testi 2026-10 signup-tr-5): a host name with a
 * dot and no whitespace, http/https optional. "ornek firma sitesi" used to be
 * stored as "https://ornek firma sitesi" and published in the public profile.
 */
describe("isValidWebsiteAddress", () => {
  it.each([
    "firma.com",
    "www.firma.com.tr",
    "https://www.firma.com",
    "http://firma.com",
    "HTTPS://Firma.COM",
    "https://firma.com/",
    "https://firma.com/tr/urunler?x=1#ust",
    "firma.com/iletisim",
    "firma.com:8080",
    "alt-alan.firma-adi.co.uk",
    "şirket.com.tr",
    "компания.рф",
    "xn--80aswg.xn--p1ai",
    "  www.firma.com  ",
  ])("accepts %s", (value) => {
    expect(isValidWebsiteAddress(value)).toBe(true);
  });

  // website-idn-combining-marks: scripts that write vowels / tone marks as
  // combining marks (\p{M}), the Persian zero-width non-joiner and decomposed
  // Latin letters were refused, so these hosts got 400 WEBSITE_INVALID.
  it.each([
    ["ธุรกิจ.ไทย", "Thai host and top level"],
    ["บริษัท.com", "Thai"],
    ["उदाहरण.भारत", "Hindi host and top level"],
    ["कंपनी.com", "Hindi, label ends with a vowel sign"],
    ["நிறுவனம்.com", "Tamil, label ends with a virama"],
    ["কোম্পানি.com", "Bengali"],
    ["کتاب‌خانه.com", "Persian with a zero-width non-joiner"],
    ["şirket.com", "decomposed Latin letter (s + combining cedilla)"],
    ["https://www.บริษัท.com/th?x=1", "scheme, subdomain, path and query"],
  ])("accepts %s (%s)", (value) => {
    expect(isValidWebsiteAddress(value)).toBe(true);
  });

  it.each([
    ["́firma.com", "label starts with a combining mark"],
    ["‌firma.com", "label starts with a zero-width non-joiner"],
    ["firma‌.com", "label ends with a zero-width non-joiner"],
    ["www.ุรกิจ.com", "inner label starts with a combining mark"],
    ["บริษัท", "no dot"],
    ["บริษัท .com", "space inside the host"],
    ["info@บริษัท.com", "an e-mail address"],
  ])("still rejects %s (%s)", (value) => {
    expect(isValidWebsiteAddress(value)).toBe(false);
  });

  it.each([
    ["ornek firma sitesi", "spaces, no dot"],
    ["https://ornek firma sitesi", "the value the finding stored"],
    ["www.firma .com", "space inside the host"],
    ["firma.com /yol", "space before the path"],
    ["firma", "no dot"],
    ["https://firma", "no dot with scheme"],
    ["https://", "scheme only"],
    ["", "empty"],
    ["   ", "blank"],
    [".com", "empty first label"],
    ["firma.", "empty last label"],
    ["firma..com", "empty middle label"],
    ["-firma.com", "label starts with a hyphen"],
    ["firma-.com", "label ends with a hyphen"],
    ["firma_adi.com", "underscore is not a host character"],
    ["firma.c", "one-letter top level"],
    ["1.5", "a number"],
    ["192.168.1.10", "an IP address"],
    ["info@firma.com", "an e-mail address"],
    ["https://kullanici:sifre@firma.com", "user part"],
    ["ftp://firma.com", "other scheme"],
    ["https://https://firma.com", "scheme twice"],
    ["mailto:info@firma.com", "mailto"],
    ["javascript:alert(1)", "script"],
    ["firma.com:abc", "port is not a number"],
    ["firma,com", "comma instead of dot"],
  ])("rejects %s (%s)", (value) => {
    expect(isValidWebsiteAddress(value)).toBe(false);
  });
});

describe("assertWebsiteAddress", () => {
  it("empty means 'no web site' and passes", () => {
    for (const empty of [undefined, null, "", "   "]) {
      expect(() => assertWebsiteAddress(empty)).not.toThrow();
    }
  });

  it("a valid address passes", () => {
    expect(() => assertWebsiteAddress("https://www.firma.com")).not.toThrow();
  });

  it("an invalid address is a 400 with the catalog message and a machine code", () => {
    let caught: unknown;
    try {
      assertWebsiteAddress("ornek firma sitesi");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).getResponse()).toEqual({
      message: "Geçerli bir web sitesi adresi giriniz (örnek: www.firmaniz.com)",
      i18nKey: "api.companyProfile.gecerliBirWebSitesiGiriniz",
      code: "WEBSITE_INVALID",
    });
  });
});
