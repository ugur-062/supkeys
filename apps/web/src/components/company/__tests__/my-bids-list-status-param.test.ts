import { describe, expect, it, vi } from "vitest";

// Bileşen modülü ağır bağımlılıklar çekiyor; yalnız saf ayrıştırıcı sınanıyor.
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

import { parseStatusParam } from "../my-bids-list";

describe("MyBidsList — `?status=` başlangıç süzgeci (derin denetim LU-27)", () => {
  it("parametre yoksa süzgeç boş", () => {
    expect(parseStatusParam(null)).toEqual([]);
    expect(parseStatusParam("")).toEqual([]);
  });

  it("KPI 'Kazanılan' bağlantısı (?status=WON) kısmi kazanımı da seçer — sayı ile liste aynı kümeyi gösterir", () => {
    expect(parseStatusParam("WON")).toEqual(["WON", "AWARDED_PARTIAL"]);
  });

  it("virgüllü çoklu seçim okunur, bilinmeyen kodlar atılır, tekrar olmaz", () => {
    expect(parseStatusParam("LOST,BOGUS,SUBMITTED")).toEqual(["LOST", "SUBMITTED"]);
    expect(parseStatusParam("WON,AWARDED_PARTIAL,WON")).toEqual(["WON", "AWARDED_PARTIAL"]);
  });
});
