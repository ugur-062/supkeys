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
      "?q=%C3%A7elik&durum=gecmis&uygunluk=davet%2Ckategori&kategori=39000000%2C23000000&kapanis=7&alici=c1%2Cc2&ulke=TR%2CDE&para=USD%2CEUR&usul=pazarlik&donem=30&sirala=yeni&sayfa=3";
    const s = parseRequestFilters(new URLSearchParams(q));
    expect(s.q).toBe("çelik");
    expect(s.status).toBe("gecmis");
    expect(s.fit).toEqual(["davet", "kategori"]);
    expect(s.categories).toEqual(["39000000", "23000000"]);
    expect(s.closing).toBe(7);
    expect(s.buyers).toEqual(["c1", "c2"]);
    expect(s.countries).toEqual(["TR", "DE"]);
    expect(s.currencies).toEqual(["USD", "EUR"]);
    expect(s.format).toBe("pazarlik");
    expect(s.period).toBe(30);
    expect(s.sort).toBe("yeni");
    expect(s.page).toBe(3);
    expect(buildRequestFilterQuery(s)).toBe(q);
    // durum + 2 uygunluk + 2 kategori + kapanış + 2 alıcı + 2 ülke + 2 para + usul + dönem (kapsam 2026-09-21'de, şehir 2026-10-04'te kalktı)
    expect(activeRequestFilterCount(s)).toBe(14);
  });

  it("ALICI ŞEHRİ süzgeci yok (2026-10-04 sahip kararı): eski `?sehir=` bağlantısı açılır, yok sayılır ve adrese geri yazılmaz", () => {
    const s = parseRequestFilters(new URLSearchParams("sehir=bursa%2Cde-munich&ulke=TR"));
    expect(s).not.toHaveProperty("cities");
    expect(s.countries).toEqual(["TR"]);
    expect(buildRequestFilterQuery(s)).toBe("?ulke=TR");
    expect(activeRequestFilterCount(s)).toBe(1);
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
    // Ülke: büyük harf, ISO alpha-2 dışı düşer, tekilleşir.
    expect(parseRequestFilters(new URLSearchParams("ulke=de,DE,xyz,1a,tr")).countries).toEqual(["DE", "TR"]);
  });

  // 2026-10-09 (W-12): gizli segment kodu süzgeç yokmuş gibi okunur — Açık
  // Talepler ham kodu ("77000000") aktif çip olarak basıyor, listeyi gizli
  // sektöre süzüyordu.
  it("gizli segment kodu süzgeç olarak YOK sayılır (tam kod da segment kodu da)", () => {
    const s = parseRequestFilters(new URLSearchParams("kategori=92000000,39121501,92101500,77000000"));
    expect(s.categories).toEqual(["39000000"]);
    const only = parseRequestFilters(new URLSearchParams("kategori=77000000"));
    expect(only).toEqual(parseRequestFilters(new URLSearchParams()));
    expect(activeRequestFilterCount(only)).toBe(0);
    expect(buildRequestFilterQuery(only)).toBe("");
  });

  // 2026-10-10: 46 görünür sektör, silah / kolluk dalları gizli. Kod segmente
  // indirgenmeden ÖNCE sınanır — gizli dalın kodu görünür sektörün süzgecine
  // DÖNÜŞMEZ (önce yuvarlamak `46101500`ı `46000000` yapıp listeyi süzerdi).
  it("görünür sektörün gizli dalı süzgeç olmaz; görünür dalı sektöre iner", () => {
    for (const hidden of ["46101500", "46100000", "46151600", "46182500", "46182501", "46220000"]) {
      const s = parseRequestFilters(new URLSearchParams(`kategori=${hidden}`));
      expect(s.categories, hidden).toEqual([]);
      expect(buildRequestFilterQuery(s), hidden).toBe("");
    }
    for (const visible of ["46000000", "46181500", "46180000", "46191600"]) {
      expect(parseRequestFilters(new URLSearchParams(`kategori=${visible}`)).categories, visible).toEqual(["46000000"]);
    }
    expect(parseRequestFilters(new URLSearchParams("kategori=46101500,46181500,39121501")).categories).toEqual(["46000000", "39000000"]);
  });

  it("temizle: arama DAHİL sıfırlar, sıralama kalır", () => {
    const s = parseRequestFilters(new URLSearchParams("q=x&durum=tumu&alici=c1&sirala=yakin&sayfa=2"));
    expect(clearRequestFilters(s)).toEqual({ ...EMPTY_REQUEST_FILTERS, sort: "yakin" });
  });
});
