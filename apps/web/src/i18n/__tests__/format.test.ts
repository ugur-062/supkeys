import { describe, expect, it } from "vitest";
import { avatarInitials, getAvatarProps } from "@/lib/avatar-utils";
import { formatNumber, formatPercent, intlLocale, numberSeparators, upperForText } from "../format";

describe("intlLocale / numberSeparators", () => {
  it("dil kodu → BCP-47; bilinmeyen varsayılana düşer", () => {
    expect(intlLocale("en")).toBe("en-US");
    expect(intlLocale("ru")).toBe("ru-RU");
    expect(intlLocale("de")).toBe("tr-TR");
    expect(intlLocale(undefined)).toBe("tr-TR");
  });

  it("ayraçlar Intl ile aynı (sunucu/tarayıcı farkı olmasın diye elle sabit)", () => {
    for (const locale of ["tr", "en", "ru"] as const) {
      const parts = new Intl.NumberFormat(intlLocale(locale)).formatToParts(12345.6);
      expect(parts.find((p) => p.type === "decimal")?.value).toBe(numberSeparators(locale).decimal);
      expect(parts.find((p) => p.type === "group")?.value).toBe(numberSeparators(locale).group);
    }
  });
});

describe("formatNumber / formatPercent — arayüz dilinde", () => {
  it("gruplama ve ondalık dilden", () => {
    expect(formatNumber(12500.5, "en")).toBe("12,500.5");
    expect(formatNumber(12500.5, "tr")).toBe("12.500,5");
    expect(formatNumber(12500.5, "ru")).toBe("12 500,5");
    expect(formatNumber(2.345, "en", { maximumFractionDigits: 1 })).toBe("2.3");
  });

  it("yüzde işareti dilin yerinde (TR önek, EN/RU sonek)", () => {
    expect(formatPercent(12, "tr")).toBe("%12");
    expect(formatPercent(12, "en")).toBe("12%");
    expect(formatPercent(12, "ru")).toBe("12 %");
    expect(formatPercent(12.46, "en", { maximumFractionDigits: 1 })).toBe("12.5%");
  });
});

/**
 * Baş harf METNİN diline göre: `tr-TR` sabitken "ivan" → "İ" oluyordu;
 * arayüz diline bağlamak da yanlış olurdu (Türkçe arayüzde Rus adı).
 */
describe("upperForText / avatarInitials", () => {
  it("Türkçe harfsiz metin dilden bağımsız büyür", () => {
    expect(upperForText("ivan")).toBe("IVAN");
    expect(avatarInitials("ivan petrov")).toBe("IP");
    expect(getAvatarProps("irina").initials).toBe("IR");
  });

  it("Türkçe harfli metin Türkçe kuralla büyür (i → İ)", () => {
    expect(upperForText("iş")).toBe("İŞ");
    expect(avatarInitials("ilker şahin")).toBe("İŞ");
    expect(upperForText("i", "ilker şahin")).toBe("İ");
  });

  it("Kiril metin", () => {
    expect(avatarInitials("иван петров")).toBe("ИП");
  });
});
