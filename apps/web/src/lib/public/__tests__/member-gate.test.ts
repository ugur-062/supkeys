import { describe, expect, it } from "vitest";
import {
  VERIFY_HREF,
  buyingGate,
  connectGate,
  gateHref,
  memberDirectoryTarget,
  memberProductHref,
  memberProductPath,
  publicBidGate,
} from "../member-gate";
import { PANEL_TARGET } from "../visibility";

/**
 * Arayüz testi Y-03 / kullanıcı kararı T-02: satın alma eylemlerinde paket
 * kapısı ÖNCE, izin SONRA (rol denetimi paket denetiminin içinde); Gold
 * olmayana doğrulanmamışsa önce doğrulama, değilse Gold'a geçiş.
 */
const buyer = { permissions: ["buy:view", "buy:inquiry:send", "buy:listing:manage"] };
const viewer = { permissions: ["buy:view"] };
const seller = { permissions: ["sell:view", "sell:bid:submit"] };

describe("buyingGate", () => {
  it("oturum yok → misafir", () => {
    expect(buyingGate(null, null, "inquiry")).toBe("guest");
  });

  it("Gold ∧ izin → ok; Gold ∧ izin yok → noPermission", () => {
    const gold = { tier: "GOLD", companyVerificationStatus: "VERIFIED" };
    expect(buyingGate(buyer, gold, "inquiry")).toBe("ok");
    expect(buyingGate(buyer, gold, "listing")).toBe("ok");
    expect(buyingGate(viewer, gold, "inquiry")).toBe("noPermission");
    expect(buyingGate(viewer, gold, "browse")).toBe("ok");
  });

  it("Gold değil: izin olsa bile kapı paket — doğrulanmamış/reddedilmiş önce doğrulama, diğerleri yükseltme", () => {
    expect(buyingGate(buyer, { tier: "SILVER", companyVerificationStatus: "UNVERIFIED" }, "inquiry")).toBe("verify");
    expect(buyingGate(buyer, { tier: "STANDART", companyVerificationStatus: "REJECTED" }, "inquiry")).toBe("verify");
    expect(buyingGate(viewer, { tier: "STANDART", companyVerificationStatus: "PENDING" }, "listing")).toBe("upgrade");
    expect(buyingGate(seller, { tier: "SILVER", companyVerificationStatus: "VERIFIED" }, "inquiry")).toBe("upgrade");
  });

  it("kapalı kapının hedefi", () => {
    expect(gateHref("verify")).toBe(VERIFY_HREF);
    // Ücretsiz dönem: iki kapalı dal da doğrulama sayfasına gider.
    expect(gateHref("upgrade")).toBe(VERIFY_HREF);
    expect(gateHref("ok")).toBeNull();
  });
});

describe("üye iniş adresleri", () => {
  it("herkese açık ürünün panel karşılığı paket bilmeyen üye adresidir (satınalma DEĞİL)", () => {
    expect(PANEL_TARGET.product("abc", "urun-x")).toBe("/company/urun/abc/urun-x");
    expect(memberProductPath("abc", "urun-x")).toBe("/company/urun/abc/urun-x");
  });

  it("panel kartı: Gold alıcı doğrudan satınalma sayfasına, diğerleri üye adresine", () => {
    expect(memberProductHref(viewer, { tier: "GOLD" }, "abc", "x")).toBe("/company/satinalma/urunler/abc/x");
    expect(memberProductHref(viewer, { tier: "SILVER" }, "abc", "x")).toBe("/company/urun/abc/x");
    expect(memberProductHref(seller, { tier: "GOLD" }, "abc", "x")).toBe("/company/urun/abc/x");
  });

  it("firma dizini: Gold ∧ buy:view satınalma, satış görüntüleme satış dizini", () => {
    expect(memberDirectoryTarget(viewer, { tier: "GOLD" })).toBe("/company/satinalma/firmalar");
    expect(memberDirectoryTarget({ permissions: ["buy:view", "sell:view"] }, { tier: "SILVER" })).toBe(
      "/company/satis/firmalar",
    );
    expect(memberDirectoryTarget(seller, { tier: "GOLD" })).toBe("/company/satis/firmalar");
  });
});

/**
 * Herkese açık talebe teklif (webA-02 yeniden doğrulama): PUBLIC talebe
 * tanımadan teklif Silver ister; önce paket, sonra `sell:bid:submit`.
 */
describe("publicBidGate", () => {
  it("oturum yok → misafir", () => {
    expect(publicBidGate(null, null)).toBe("guest");
  });

  it("ücretsiz: doğrulanmamış → doğrulama, doğrulanmış/incelemede → paket (izin olsa bile)", () => {
    expect(publicBidGate(seller, { tier: "STANDART", companyVerificationStatus: "UNVERIFIED" })).toBe("verify");
    expect(publicBidGate(seller, { tier: "STANDART", companyVerificationStatus: "VERIFIED" })).toBe("upgrade");
    expect(publicBidGate(seller, { tier: "STANDART", companyVerificationStatus: "PENDING" })).toBe("upgrade");
    expect(gateHref(publicBidGate(seller, { tier: "STANDART", companyVerificationStatus: "UNVERIFIED" }))).toBe(VERIFY_HREF);
  });

  it("Silver ve Gold ∧ teklif izni → ok; teklif izni yok → noPermission", () => {
    expect(publicBidGate(seller, { tier: "SILVER", companyVerificationStatus: "VERIFIED" })).toBe("ok");
    expect(publicBidGate(seller, { tier: "GOLD", companyVerificationStatus: "VERIFIED" })).toBe("ok");
    expect(publicBidGate(buyer, { tier: "SILVER", companyVerificationStatus: "VERIFIED" })).toBe("noPermission");
  });
});

/** Arayüz testi kapanış S-PUB-ADMIN: bağlantı daveti Silver, sonra `connections:manage`. */
describe("connectGate", () => {
  const manager = { permissions: ["connections:manage"] };
  it("oturum yok → misafir", () => {
    expect(connectGate(null, null)).toBe("guest");
  });

  it("ücretsiz: izin olsa bile paket — doğrulanmamış önce doğrulama", () => {
    expect(connectGate(manager, { tier: "STANDART", companyVerificationStatus: "UNVERIFIED" })).toBe("verify");
    expect(connectGate(manager, { tier: "STANDART", companyVerificationStatus: "VERIFIED" })).toBe("upgrade");
    expect(connectGate(seller, { tier: "STANDART", companyVerificationStatus: "VERIFIED" })).toBe("upgrade");
  });

  it("Silver/Gold ∧ izin → ok; izin yok → noPermission", () => {
    expect(connectGate(manager, { tier: "SILVER", companyVerificationStatus: "VERIFIED" })).toBe("ok");
    expect(connectGate(manager, { tier: "GOLD", companyVerificationStatus: "VERIFIED" })).toBe("ok");
    expect(connectGate(seller, { tier: "GOLD", companyVerificationStatus: "VERIFIED" })).toBe("noPermission");
  });
});
