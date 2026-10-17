import { describe, expect, it, vi } from "vitest";

// Bileşen modülü ağır bağımlılıklar çekiyor; yalnız saf ayrıştırıcı sınanıyor.
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

import { parseStatusParam } from "../my-bids-list";
import { MY_BIDS_WON_KPI_HREF } from "@/lib/company/my-bids-links";

describe("MyBidsList — `?status=` başlangıç süzgeci (derin denetim LU-27)", () => {
  it("parametre yoksa süzgeç boş", () => {
    expect(parseStatusParam(null)).toEqual([]);
    expect(parseStatusParam("")).toEqual([]);
  });

  it("yalnız 'Kazandı' seçimi (?status=WON) geri dönüşte genişletilmez — kullanıcının süzgeci aynen gelir (D-120)", () => {
    expect(parseStatusParam("WON")).toEqual(["WON"]);
  });

  it("KPI 'Kazanılan' bağlantısı kısmi kazanımı açıkça taşır — sayı ile liste aynı kümeyi gösterir", () => {
    const status = new URL(MY_BIDS_WON_KPI_HREF, "https://x.test").searchParams.get("status");
    expect(parseStatusParam(status)).toEqual(["WON", "AWARDED_PARTIAL"]);
  });

  it("virgüllü çoklu seçim okunur, bilinmeyen kodlar atılır, tekrar olmaz", () => {
    expect(parseStatusParam("LOST,BOGUS,SUBMITTED")).toEqual(["LOST", "SUBMITTED"]);
    expect(parseStatusParam("WON,AWARDED_PARTIAL,WON")).toEqual(["WON", "AWARDED_PARTIAL"]);
  });
});
