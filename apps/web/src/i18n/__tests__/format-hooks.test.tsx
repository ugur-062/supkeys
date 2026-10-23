// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Arayüz dili test başına (`vitest.setup.ts` sahtesi hep "tr" döner).
let currentLocale = "tr";
vi.mock("next-intl", () => ({
  useLocale: () => currentLocale,
  useTranslations: () => (key: string) => key,
}));

import { useFormatDate, useFormatNumber, useFormatPercent, useRelativeTime } from "../domain";

afterEach(() => {
  currentLocale = "tr";
});

const OLD = "2020-01-15T09:00:00Z"; // İstanbul 12:00

describe("tarih/sayı hook'ları arayüz dilinde", () => {
  it("useRelativeTime: 7 günden eskisi OKUYUCUNUN dilinde kısa tarih (Türkçeye düşüyordu)", () => {
    currentLocale = "en";
    expect(renderHook(() => useRelativeTime()).result.current(OLD)).toBe("15 Jan 2020");
    currentLocale = "tr";
    expect(renderHook(() => useRelativeTime()).result.current(OLD)).toBe("15 Oca 2020");
  });

  it("useFormatDate: saatli metin TR dışında dilim etiketli", () => {
    currentLocale = "en";
    const f = renderHook(() => useFormatDate()).result.current;
    expect(f(OLD)).toBe("15 Jan 2020");
    expect(f(OLD, "datetime")).toBe("15 Jan 2020 12:00 (GMT+3)");
    currentLocale = "tr";
    expect(renderHook(() => useFormatDate()).result.current(OLD, "datetime")).toBe("15 Oca 2020 12:00");
  });

  it("useFormatNumber / useFormatPercent", () => {
    currentLocale = "en";
    expect(renderHook(() => useFormatNumber()).result.current("12500.5")).toBe("12,500.5");
    expect(renderHook(() => useFormatPercent()).result.current(40)).toBe("40%");
    currentLocale = "tr";
    expect(renderHook(() => useFormatPercent()).result.current(40)).toBe("%40");
  });
});
