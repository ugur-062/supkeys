// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let currentLocale = "tr";
vi.mock("next-intl", () => ({ useLocale: () => currentLocale }));

import { DateTimeInput, browserZoneDiffers } from "../date-time-input";

afterEach(() => {
  currentLocale = "tr";
  vi.restoreAllMocks();
});

// Ekim 2026 — İstanbul UTC+3 (getTimezoneOffset İstanbul'da -180).
const AT = new Date("2026-10-01T12:00:00Z");
const offset = (min: number) => vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(min);

describe("browserZoneDiffers — tarayıcı saati İstanbul'dan farklı mı", () => {
  it("İstanbul ve aynı ofsetli dilim (Moskova) farklı sayılmaz", () => {
    offset(-180);
    expect(browserZoneDiffers(AT)).toBe(false);
  });

  it("Bakü (+4), Berlin (+2), UTC farklıdır", () => {
    offset(-240);
    expect(browserZoneDiffers(AT)).toBe(true);
    offset(-120);
    expect(browserZoneDiffers(AT)).toBe(true);
    offset(0);
    expect(browserZoneDiffers(AT)).toBe(true);
  });
});

/**
 * 2026-09-27: "GMT+3" ipucu yalnız Türkçe DIŞI arayüzde çıkıyordu → Türkçe
 * arayüzlü ama Bakü/Berlin'deki kullanıcı saati kendi saati sanıyordu.
 */
describe("DateTimeInput — dilim ipucu", () => {
  const draw = () =>
    render(<DateTimeInput idPrefix="k" value="2026-10-01T17:00" onChange={() => {}} />);

  it("TR arayüz + İstanbul saati: ipucu yok", () => {
    offset(-180);
    draw();
    expect(screen.queryByText(/GMT\+3/)).toBeNull();
  });

  it("TR arayüz + Bakü saati: ipucu var", () => {
    offset(-240);
    draw();
    expect(screen.getByText("GMT+3")).toBeTruthy();
  });

  it("EN arayüz: her zaman ipucu", () => {
    currentLocale = "en";
    offset(-180);
    draw();
    expect(screen.getByText("GMT+3")).toBeTruthy();
  });
});
