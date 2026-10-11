import { allCitySlugs, cityFromSlug, citySlug, decodeCityParam } from "@/lib/public/city";
import { describe, expect, it } from "vitest";

describe("şehir slug'ı", () => {
  it("81 ilin slug'ı TEKİLDİR (kod eklemeye gerek yok)", () => {
    const slugs = allCitySlugs().map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("Türkçe harfleri doğru katlar", () => {
    expect(citySlug("İstanbul")).toBe("istanbul");
    expect(citySlug("Şanlıurfa")).toBe("sanliurfa");
    expect(citySlug("Iğdır")).toBe("igdir");
    expect(citySlug("Çanakkale")).toBe("canakkale");
    expect(citySlug("Kahramanmaraş")).toBe("kahramanmaras");
  });

  it("slug'dan kanonik ada döner, tanınmayanda null", () => {
    expect(cityFromSlug("istanbul")).toBe("İstanbul");
    expect(cityFromSlug("izmir")).toBe("İzmir");
    expect(cityFromSlug("atlantis")).toBeNull();
  });

  it("Türkçe harfli ham il adı ve yüzde kodlu yol parçası tanınır (arayüz testi D-323)", () => {
    expect(cityFromSlug("İstanbul")).toBe("İstanbul");
    expect(cityFromSlug("Şanlıurfa")).toBe("Şanlıurfa");
    expect(decodeCityParam("%C4%B0stanbul")).toBe("İstanbul");
    expect(decodeCityParam("İstanbul")).toBe("İstanbul");
    expect(decodeCityParam("istanbul")).toBe("istanbul");
    expect(decodeCityParam("bozuk%")).toBe("bozuk%");
  });
});
