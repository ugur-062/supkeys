/**
 * V2-6.5 RBAC — resolveUserPermissions saf fonksiyon.
 *
 * Doğrulama matrisi:
 *  - Her rol için default permission seti
 *  - override null/undefined/invalid → saf default
 *  - override.added → eklenir (rol default'unda yoksa)
 *  - override.removed → çıkarılır
 *  - added + removed birlikte
 *  - bilinmeyen rol → boş array fallback
 *  - duplicate added → tek kez
 */
import { resolveUserPermissions, hasPermission } from "./permissions.utils";
import { ROLE_DEFAULT_PERMISSIONS } from "./permissions.constants";

describe("resolveUserPermissions", () => {
  describe("role defaults (override null)", () => {
    it("COMPANY_ADMIN → 11 yetki (default)", () => {
      const perms = resolveUserPermissions("COMPANY_ADMIN", null);
      expect(perms).toEqual(ROLE_DEFAULT_PERMISSIONS.COMPANY_ADMIN);
      expect(perms).toContain("settings:users");
      expect(perms).toContain("approval:approve");
      expect(perms).not.toContain("tender:create"); // admin default'ta tender oluşturamaz
    });

    it("BUYER → 15 yetki (default), tender + bid + order operasyonu", () => {
      const perms = resolveUserPermissions("BUYER", null);
      expect(perms).toEqual(ROLE_DEFAULT_PERMISSIONS.BUYER);
      expect(perms).toContain("tender:create");
      expect(perms).toContain("tender:award");
      expect(perms).toContain("bid:eliminate");
      expect(perms).not.toContain("settings:users"); // ayarları yönetemez
    });

    it("APPROVER → 5 yetki (default), sadece onay + view", () => {
      const perms = resolveUserPermissions("APPROVER", null);
      expect(perms).toEqual(ROLE_DEFAULT_PERMISSIONS.APPROVER);
      expect(perms).toContain("approval:approve");
      expect(perms).toContain("tender:view");
      expect(perms).not.toContain("tender:create");
      expect(perms).not.toContain("bid:eliminate");
    });
  });

  describe("override null/invalid → saf default", () => {
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["string", "not-an-object"],
      ["number", 42],
      ["array", []],
    ])("%s → saf default seti döner", (_label, value) => {
      const perms = resolveUserPermissions("BUYER", value);
      expect(perms).toEqual(ROLE_DEFAULT_PERMISSIONS.BUYER);
    });

    it("boş object {} → saf default", () => {
      const perms = resolveUserPermissions("BUYER", {});
      expect(perms).toEqual(ROLE_DEFAULT_PERMISSIONS.BUYER);
    });
  });

  describe("override.added", () => {
    it("APPROVER'a settings:users ekle (yasak değil) → +1 yetki", () => {
      const perms = resolveUserPermissions("APPROVER", {
        added: ["settings:users"],
      });
      expect(perms).toContain("settings:users");
      expect(perms.length).toBe(ROLE_DEFAULT_PERMISSIONS.APPROVER.length + 1);
    });

    it("default'ta zaten olan yetki added → duplicate edilmez", () => {
      const perms = resolveUserPermissions("BUYER", {
        added: ["tender:create"], // BUYER'ın default'unda zaten var
      });
      expect(perms.filter((p) => p === "tender:create")).toHaveLength(1);
      expect(perms.length).toBe(ROLE_DEFAULT_PERMISSIONS.BUYER.length);
    });

    it("aynı permission added array'inde 2 kez → tek kez (yasak değilse)", () => {
      const perms = resolveUserPermissions("APPROVER", {
        added: ["settings:users", "settings:users"],
      });
      expect(perms.filter((p) => p === "settings:users")).toHaveLength(1);
    });
  });

  describe("override.removed", () => {
    it("BUYER'dan tender:delete kaldır", () => {
      const perms = resolveUserPermissions("BUYER", {
        removed: ["tender:delete"],
      });
      expect(perms).not.toContain("tender:delete");
      expect(perms.length).toBe(ROLE_DEFAULT_PERMISSIONS.BUYER.length - 1);
    });

    it("zaten yetkisi olmayan permission removed → no-op", () => {
      const perms = resolveUserPermissions("APPROVER", {
        removed: ["tender:create"], // APPROVER'da zaten yok
      });
      expect(perms).toEqual(ROLE_DEFAULT_PERMISSIONS.APPROVER);
    });
  });

  describe("override.added + removed birlikte", () => {
    it("APPROVER: settings:users eklenir (yasak değil), tender:view kaldırılır", () => {
      const perms = resolveUserPermissions("APPROVER", {
        added: ["settings:users"],
        removed: ["tender:view"],
      });
      expect(perms).toContain("settings:users");
      expect(perms).not.toContain("tender:view");
    });

    it("added + removed aynı permission'a işaret ederse → added kazanır (Set semantic)", () => {
      // removed önce uygulanır, added Set'e eklenir → sonuçta yetki olur
      const perms = resolveUserPermissions("BUYER", {
        added: ["tender:create"],
        removed: ["tender:create"],
      });
      expect(perms).toContain("tender:create");
    });
  });

  // V2-6.5 — FORBIDDEN_PERMISSIONS_BY_ROLE güvencesi: yasak yetkiler
  // override.added ile bile efektif listede çıkmaz. Bu RBAC tasarımının
  // savunma katmanı — saldırgan veya buggy code override yazsa bile
  // resolveUserPermissions yasak yetkileri filtreler.
  describe("FORBIDDEN_PERMISSIONS_BY_ROLE savunma katmanı", () => {
    it("COMPANY_ADMIN: tender:create override.added ile bile verilemez", () => {
      const perms = resolveUserPermissions("COMPANY_ADMIN", {
        added: ["tender:create"],
      });
      expect(perms).not.toContain("tender:create");
    });

    it("COMPANY_ADMIN: tender:edit/publish/delete + bid:eliminate + order:edit yasak", () => {
      const perms = resolveUserPermissions("COMPANY_ADMIN", {
        added: [
          "tender:edit",
          "tender:publish",
          "tender:delete",
          "bid:eliminate",
          "order:edit",
        ],
      });
      expect(perms).not.toContain("tender:edit");
      expect(perms).not.toContain("tender:publish");
      expect(perms).not.toContain("tender:delete");
      expect(perms).not.toContain("bid:eliminate");
      expect(perms).not.toContain("order:edit");
    });

    it("APPROVER: yazma yetkileri (tender:*, bid:eliminate, order:*) yasak", () => {
      const perms = resolveUserPermissions("APPROVER", {
        added: [
          "tender:create",
          "tender:edit",
          "tender:publish",
          "tender:delete",
          "tender:cancel",
          "tender:award",
          "bid:eliminate",
          "order:edit",
          "order:complete",
          "order:cancel",
        ],
      });
      expect(perms).not.toContain("tender:create");
      expect(perms).not.toContain("tender:edit");
      expect(perms).not.toContain("tender:publish");
      expect(perms).not.toContain("tender:delete");
      expect(perms).not.toContain("tender:cancel");
      expect(perms).not.toContain("tender:award");
      expect(perms).not.toContain("bid:eliminate");
      expect(perms).not.toContain("order:edit");
      expect(perms).not.toContain("order:complete");
      expect(perms).not.toContain("order:cancel");
    });

    it("APPROVER: settings:* yasak DEĞİL → override ile verilebilir", () => {
      const perms = resolveUserPermissions("APPROVER", {
        added: [
          "settings:users",
          "settings:addresses",
          "settings:approval",
          "settings:company",
        ],
      });
      expect(perms).toContain("settings:users");
      expect(perms).toContain("settings:addresses");
      expect(perms).toContain("settings:approval");
      expect(perms).toContain("settings:company");
    });

    it("BUYER: yasak listesi boş → tüm yetkiler override ile verilebilir", () => {
      const perms = resolveUserPermissions("BUYER", {
        added: ["settings:users", "settings:approval", "approval:approve"],
      });
      expect(perms).toContain("settings:users");
      expect(perms).toContain("settings:approval");
      expect(perms).toContain("approval:approve");
    });
  });

  describe("unknown role → boş array", () => {
    it("role tablosunda olmayan değer → []", () => {
      const perms = resolveUserPermissions(
        "UNKNOWN_ROLE" as never,
        null,
      );
      expect(perms).toEqual([]);
    });

    it("unknown role + override.added → sadece added permission'ları", () => {
      const perms = resolveUserPermissions(
        "UNKNOWN_ROLE" as never,
        { added: ["tender:view"] },
      );
      expect(perms).toEqual(["tender:view"]);
    });
  });

  describe("hasPermission yardımcısı", () => {
    it("BUYER tender:create → true", () => {
      expect(hasPermission("BUYER", null, "tender:create")).toBe(true);
    });

    it("APPROVER tender:create → false", () => {
      expect(hasPermission("APPROVER", null, "tender:create")).toBe(false);
    });

    it("override.added ile yetki kazanan kullanıcı → true (yasak değilse)", () => {
      expect(
        hasPermission("APPROVER", { added: ["settings:users"] }, "settings:users"),
      ).toBe(true);
    });

    it("yasak yetki override.added ile verilse de → false", () => {
      expect(
        hasPermission(
          "COMPANY_ADMIN",
          { added: ["tender:create"] },
          "tender:create",
        ),
      ).toBe(false);
    });

    it("override.removed ile yetki kaybeden kullanıcı → false", () => {
      expect(
        hasPermission("BUYER", { removed: ["tender:create"] }, "tender:create"),
      ).toBe(false);
    });

    it("bilinmeyen permission → false (hiçbir rolde yok)", () => {
      expect(hasPermission("COMPANY_ADMIN", null, "nonexistent:perm")).toBe(false);
    });
  });
});
