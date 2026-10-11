import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale, negotiateLocale, pickLocale } from "../locales";

describe("locales", () => {
  it("pickLocale bölge etiketini temel dile indirger", () => {
    expect(pickLocale("en-US")).toBe("en");
    expect(pickLocale("RU")).toBe("ru");
    expect(pickLocale("tr_TR")).toBe("tr");
    expect(pickLocale("de")).toBeNull();
    expect(pickLocale("")).toBeNull();
    expect(pickLocale(undefined)).toBeNull();
  });

  it("negotiateLocale q-değerine göre ilk desteklenen dili seçer", () => {
    expect(negotiateLocale("de-DE,de;q=0.9,ru;q=0.8,en;q=0.7")).toBe("ru");
    expect(negotiateLocale("en-GB,en;q=0.9")).toBe("en");
    expect(negotiateLocale("fr")).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale("*")).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale(null)).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale("bozuk;;q=x")).toBe(DEFAULT_LOCALE);
  });

  it("isLocale yalnız desteklenen kodları kabul eder", () => {
    expect(isLocale("tr")).toBe(true);
    expect(isLocale("en-US")).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});
