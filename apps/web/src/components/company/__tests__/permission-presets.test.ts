/**
 * HAZIR SET PAKET/KOLTUK KAPISI (derin denetim MU-13) — backend
 * `assertSeatAvailable` aynası: satınalma işlem izni yalnız GOLD'da, kişinin
 * tutmadığı her grup 1 koltuk ister. Kapıdan geçemeyen grubun yalnız İŞLEM
 * izinleri düşer; kişinin zaten tuttuğu grup dokunulmaz.
 */
import { describe, expect, it } from "vitest";
import type { PermissionCatalog } from "@/hooks/use-company-users";
import { defaultInvitePermissions, gatePreset } from "../permission-presets";

const catalog: PermissionCatalog = {
  catalog: [
    { key: "buy:view", label: "", group: "buy", seat: false },
    { key: "buy:listing:manage", label: "", group: "buy", seat: true },
    { key: "buy:award", label: "", group: "buy", seat: true },
    { key: "sell:view", label: "", group: "sell", seat: false },
    { key: "sell:bid:submit", label: "", group: "sell", seat: true },
    { key: "approval:act", label: "", group: "approval", seat: false },
    { key: "templates:manage", label: "", group: "management", seat: false },
  ],
  groups: { buy: "", sell: "", approval: "", management: "" },
  presets: {
    SATIN_ALMACI: ["buy:view", "buy:listing:manage", "buy:award", "templates:manage"],
    SATISCI: ["sell:view", "sell:bid:submit"],
    ONAYLAYICI: ["approval:act"],
    YONETICI: ["buy:view", "sell:view", "approval:act"],
    GORUNTULEYICI: ["buy:view", "sell:view"],
  },
  roleDefaults: {} as PermissionCatalog["roleDefaults"],
};
const BOTH = [...catalog.presets.SATIN_ALMACI, "sell:view", "sell:bid:submit"];

describe("gatePreset", () => {
  it("Gold değilse satınalma İŞLEM izinleri düşer, görüntüleme ve koltuksuz izin kalır", () => {
    expect(gatePreset(catalog, catalog.presets.SATIN_ALMACI, { canGrantBuy: false, freeSeats: null })).toEqual([
      "buy:view",
      "templates:manage",
    ]);
  });

  it("Gold ve koltuk varsa set aynen", () => {
    expect(gatePreset(catalog, catalog.presets.SATIN_ALMACI, { canGrantBuy: true, freeSeats: 3 })).toEqual(
      catalog.presets.SATIN_ALMACI,
    );
  });

  it("koltuk doluysa yeni grubun işlem izinleri düşer; tek koltuk yalnız bir gruba yeter", () => {
    expect(gatePreset(catalog, catalog.presets.SATISCI, { canGrantBuy: true, freeSeats: 0 })).toEqual(["sell:view"]);
    expect(gatePreset(catalog, BOTH, { canGrantBuy: true, freeSeats: 1 })).toEqual([
      "buy:view",
      "buy:listing:manage",
      "buy:award",
      "templates:manage",
      "sell:view",
    ]);
  });

  it("kişinin ZATEN tuttuğu grup dokunulmaz (yeni koltuk açmaz, paket düşüşü mevcut yetkiyi silmez)", () => {
    expect(
      gatePreset(catalog, catalog.presets.SATIN_ALMACI, {
        canGrantBuy: false,
        freeSeats: 0,
        hadGroups: { buy: true, sell: false },
      }),
    ).toEqual(catalog.presets.SATIN_ALMACI);
  });
});

describe("defaultInvitePermissions", () => {
  it("Gold: Satın Almacı", () => {
    expect(defaultInvitePermissions(catalog, { canGrantBuy: true, freeSeats: 4 })).toEqual(catalog.presets.SATIN_ALMACI);
  });

  it("ücretsiz/Silver: Satışçı — satınalma işlem izni YOK (davet paket kapısına takılmaz)", () => {
    const perms = defaultInvitePermissions(catalog, { canGrantBuy: false, freeSeats: 1 });
    expect(perms).toEqual(catalog.presets.SATISCI);
    expect(perms).not.toContain("buy:listing:manage");
  });

  it("koltuk doluysa koltuk tüketmeyen Görüntüleyici", () => {
    expect(defaultInvitePermissions(catalog, { canGrantBuy: true, freeSeats: 0 })).toEqual(catalog.presets.GORUNTULEYICI);
  });
});
