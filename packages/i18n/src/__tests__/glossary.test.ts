import { describe, expect, it } from "vitest";
import { bannedTerms, findBannedTerm } from "../glossary";

describe("glossary — yasaklı terimler", () => {
  it("ürün dili kuralını üç dilde taşır", () => {
    expect(bannedTerms("tr")).toContain("ihale");
    expect(bannedTerms("en")).toContain("tender");
    expect(bannedTerms("ru")).toContain("тендер");
  });

  it("sözcük başında yakalar, ekli biçim dahil; içte geçeni yakalamaz", () => {
    expect(findBannedTerm("Bu ihaleye teklif verin", "tr")).toBe("ihale");
    expect(findBannedTerm("Open tenders", "en")).toBe("tender");
    // Argüman adı görünmez metin değildir.
    expect(findBannedTerm('Invited to "{tenderTitle}"', "en")).toBeNull();
    expect(findBannedTerm("{count, plural, other {# tenders}}", "en")).toBe("tender");
    expect(findBannedTerm("Submit a quote for this request", "en")).toBeNull();
    expect(findBannedTerm("The bartender", "en")).toBeNull();
    expect(findBannedTerm("Открытые тендеры", "ru")).toBe("тендер");
    expect(findBannedTerm("Открытые запросы", "ru")).toBeNull();
  });
});
