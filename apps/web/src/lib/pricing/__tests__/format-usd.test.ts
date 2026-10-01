import { describe, expect, it } from "vitest";
import { formatUsd } from "../plans";

/**
 * USD BİÇİMİ (arayüz testi D-078): simgenin yeri ve binlik ayracı dile göre.
 * Rusçada "$160" değil "160 $" (bölünmez boşlukla).
 */
describe("formatUsd", () => {
  it("TR/EN simge önde, RU simge sonda", () => {
    expect(formatUsd(160, "tr")).toBe("$160");
    expect(formatUsd(160, "en")).toBe("$160");
    expect(formatUsd(160, "ru")).toBe("160 $");
  });

  it("binlik ayracı dile göre", () => {
    expect(formatUsd(1920, "tr")).toBe("$1.920");
    expect(formatUsd(1920, "en")).toBe("$1,920");
    expect(formatUsd(1920, "ru")).toMatch(/^1\s920 \$$/);
  });
});
