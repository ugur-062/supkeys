import { describe, expect, it } from "vitest";
import {
  activeRequestFilterCount,
  buildRequestFilterQuery,
  clearRequestFilters,
  EMPTY_REQUEST_FILTERS,
  parseRequestFilters,
} from "../request-filter-params";

describe("request-filter-params (açık talep süzgeç URL şeması)", () => {
  it("varsayılan: aktif, boş listeler, sayfa 1; sorgu yazılmaz", () => {
    const s = parseRequestFilters(new URLSearchParams());
    expect(s).toEqual(EMPTY_REQUEST_FILTERS);
    expect(buildRequestFilterQuery(s)).toBe("");
    expect(activeRequestFilterCount(s)).toBe(0);
  });

  it("gidiş-dönüş: her anahtar okunur ve aynen yazılır", () => {
    const q =
      "?q=%C3%A7elik&durum=gecmis&uygunluk=davet%2Ckategori&kategori=39000000%2C23000000&kapsam=uluslararasi&kapanis=7&alici=c1%2Cc2&sehir=Bursa&para=USD%2CEUR&usul=pazarlik&donem=30&sirala=yeni&sayfa=3";
    const s = parseRequestFilters(new URLSearchParams(q));
    expect(s.q).toBe("çelik");
    expect(s.status).toBe("gecmis");
    expect(s.fit).toEqual(["davet", "kategori"]);
    expect(s.categories).toEqual(["39000000", "23000000"]);
    expect(s.scope).toBe("uluslararasi");
    expect(s.closing).toBe(7);
    expect(s.buyers).toEqual(["c1", "c2"]);
    expect(s.cities).toEqual(["Bursa"]);
    expect(s.currencies).toEqual(["USD", "EUR"]);
    expect(s.format).toBe("pazarlik");
    expect(s.period).toBe(30);
    expect(s.sort).toBe("yeni");
    expect(s.page).toBe(3);
    expect(buildRequestFilterQuery(s)).toBe(q);
    // durum + 2 uygunluk + 2 kategori + kapsam + kapanış + 2 alıcı + şehir + 2 para + usul + dönem
    expect(activeRequestFilterCount(s)).toBe(14);
  });

  it("geçersiz değerler düşer: bilinmeyen durum/uygunluk/kapanış, 8 haneli olmayan kod, sayfa 0", () => {
    const s = parseRequestFilters(
      new URLSearchParams("durum=x&uygunluk=yok,davet&kategori=39,abc&kapanis=9&donem=5&sirala=z&sayfa=0"),
    );
    expect(s.status).toBe("aktif");
    expect(s.fit).toEqual(["davet"]);
    expect(s.categories).toEqual([]);
    expect(s.closing).toBeUndefined();
    expect(s.period).toBeUndefined();
    expect(s.sort).toBeUndefined();
    expect(s.page).toBe(1);
  });

  it("kategori SEGMENT'e indirgenir ve tekilleşir (öneri/çipten tam kod gelebilir)", () => {
    const s = parseRequestFilters(new URLSearchParams("kategori=39121501,39000000,23151800"));
    expect(s.categories).toEqual(["39000000", "23000000"]);
    // Para birimi büyük harfe çekilir.
    expect(parseRequestFilters(new URLSearchParams("para=try")).currencies).toEqual(["TRY"]);
  });

  it("temizle: arama DAHİL sıfırlar, sıralama kalır", () => {
    const s = parseRequestFilters(new URLSearchParams("q=x&durum=tumu&alici=c1&sirala=yakin&sayfa=2"));
    expect(clearRequestFilters(s)).toEqual({ ...EMPTY_REQUEST_FILTERS, sort: "yakin" });
  });
});
