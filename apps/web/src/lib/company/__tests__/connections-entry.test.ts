import { describe, expect, it } from "vitest";
import { connectionsPagePath } from "../connections-entry";

/**
 * Portaldan bağımsız Bağlantılar girişi (bildirimler): hedef KİŞİNİN açabildiği
 * portaldan seçilir. İnceleme bulgusu: portal firma paketinden seçildiğinde
 * Gold firmanın satışçısı "Satınalma paneline erişim yetkiniz yok" ekranına,
 * Gold altındaki firmanın satın almacısı açamadığı satış portalına düşüyordu.
 */
const SELLER = { roles: ["SATISCI"], permissions: ["sell:view", "sell:bid:submit", "connections:manage"] };
const BUYER = { roles: ["SATIN_ALMACI"], permissions: ["buy:view", "buy:listing:manage", "connections:manage"] };
const BOTH = { roles: [], permissions: ["buy:view", "sell:view", "connections:manage"] };

describe("connectionsPagePath", () => {
  it("Gold firmanın satışçısı satış Bağlantılar'ına gider (satınalmayı açamaz)", () => {
    expect(connectionsPagePath(SELLER, "GOLD", null, true)).toBe("/company/satis/musterilerim?view=incoming");
    expect(connectionsPagePath(SELLER, "GOLD", "satinalma", false)).toBe("/company/satis/musterilerim");
  });

  it("iki portalı açan: son portal açılabiliyorsa o, değilse satınalma önce", () => {
    expect(connectionsPagePath(BOTH, "GOLD", "satis", true)).toBe("/company/satis/musterilerim?view=incoming");
    expect(connectionsPagePath(BOTH, "GOLD", null, true)).toBe(
      "/company/satinalma/tedarikcilerim?view=incoming",
    );
    // Gold altında satınalma açılmaz: son portal satınalma olsa da satış.
    expect(connectionsPagePath(BOTH, "STANDART", "satinalma", false)).toBe("/company/satis/musterilerim");
  });

  it("Gold altındaki satın almacı satış portalına değil satınalma kapısına gider", () => {
    expect(connectionsPagePath(BUYER, "STANDART", null, true)).toBe(
      "/company/satinalma/tedarikcilerim?view=incoming",
    );
  });

  it("hiçbir portalı açamayan panel köküne; görünüm yalnız gelen istekler", () => {
    expect(connectionsPagePath({ roles: [], permissions: ["approval:act"] }, "GOLD", null, true)).toBe(
      "/company",
    );
    expect(connectionsPagePath(null, "GOLD", null, true)).toBe("/company");
  });
});
